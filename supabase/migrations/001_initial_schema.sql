-- ============================================================
-- 001 Initial Schema — Wakacje Aggregator
-- ============================================================
-- Run this in Supabase SQL Editor or via supabase CLI:
--   supabase db push
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search on hotel names

-- ────────────────────────────────────────────────────────────
-- PROVIDERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS providers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        TEXT UNIQUE NOT NULL,     -- 'rpl', 'exim', 'coral', 'itaka', 'grecos', 'tui'
  name        TEXT NOT NULL,            -- Display name
  base_url    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE providers IS 'Travel agency providers / data sources';

-- ────────────────────────────────────────────────────────────
-- DESTINATIONS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS destinations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT UNIQUE NOT NULL,  -- 'turkey', 'egypt', 'greece', etc.
  display_name   TEXT NOT NULL,         -- 'Turcja', 'Egipt', etc.
  country_code   CHAR(2),               -- ISO 3166-1 alpha-2
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE destinations IS 'Canonical vacation destinations';

-- ────────────────────────────────────────────────────────────
-- HOTELS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name  TEXT NOT NULL,         -- Human-readable canonical name
  normalized_name TEXT NOT NULL,         -- Lowercase, diacritics stripped — used for dedup
  destination_id  UUID REFERENCES destinations(id) ON DELETE SET NULL,
  stars           SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  location_city   TEXT,
  location_region TEXT,
  latitude        NUMERIC(9, 6),
  longitude       NUMERIC(9, 6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE hotels IS 'Deduplicated hotel master records';
COMMENT ON COLUMN hotels.normalized_name IS 'Lowercase, diacritics-free name for fuzzy matching';

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────
-- HOTEL ALIASES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_aliases (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id              UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  provider_id           UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  provider_hotel_name   TEXT NOT NULL,   -- Exact name as seen on provider site
  provider_hotel_id     TEXT,            -- Provider's internal hotel ID (if known)
  confidence_score      NUMERIC(4, 3) NOT NULL DEFAULT 1.000
                        CHECK (confidence_score BETWEEN 0 AND 1),
  verified              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, provider_hotel_name)
);

COMMENT ON TABLE hotel_aliases IS 'Maps provider-specific hotel names to canonical hotels';
COMMENT ON COLUMN hotel_aliases.confidence_score IS '0=no match, 1=perfect match. ≥0.85=high confidence';

-- ────────────────────────────────────────────────────────────
-- SEARCH RUNS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS search_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  search_params   JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  offers_found    INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE search_runs IS 'Log of scraper runs — one row per provider per run';

-- ────────────────────────────────────────────────────────────
-- OFFERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_run_id     UUID REFERENCES search_runs(id) ON DELETE CASCADE,
  provider_id       UUID REFERENCES providers(id) ON DELETE SET NULL,
  hotel_id          UUID REFERENCES hotels(id) ON DELETE SET NULL,
  provider_offer_id TEXT,                -- Provider's internal offer ID
  destination_id    UUID REFERENCES destinations(id) ON DELETE SET NULL,

  -- ── Flight ──
  departure_airport TEXT NOT NULL,       -- IATA code: KTW, KRK, WAW, ...
  departure_date    DATE NOT NULL,
  return_date       DATE NOT NULL,
  nights            SMALLINT NOT NULL CHECK (nights BETWEEN 1 AND 60),

  -- ── Hotel ──
  hotel_name        TEXT NOT NULL,       -- As seen on provider (raw)
  hotel_stars       SMALLINT NOT NULL CHECK (hotel_stars BETWEEN 1 AND 5),
  hotel_location    TEXT NOT NULL DEFAULT '',
  board_type        TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (board_type IN (
                      'all-inclusive', 'ultra-all-inclusive',
                      'half-board', 'full-board',
                      'bed-and-breakfast', 'room-only', 'unknown'
                    )),
  room_type         TEXT,

  -- ── Pricing ──
  price_total       NUMERIC(10, 2) NOT NULL,
  price_per_person  NUMERIC(10, 2) NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'PLN',
  adults            SMALLINT NOT NULL DEFAULT 2,
  children          SMALLINT NOT NULL DEFAULT 0,

  -- ── Source ──
  source_url        TEXT NOT NULL,
  raw_data          JSONB,

  -- ── Scoring ──
  composite_score   NUMERIC(5, 2),       -- 0–100 computed score

  -- ── Meta ──
  is_available      BOOLEAN NOT NULL DEFAULT TRUE,
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE offers IS 'Individual vacation offers from providers';
COMMENT ON COLUMN offers.composite_score IS '0-100 score computed from price + reviews + hotel quality';
COMMENT ON COLUMN offers.raw_data IS 'Original scraped JSON for debugging';

-- ────────────────────────────────────────────────────────────
-- HOTEL REVIEWS SUMMARY
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hotel_reviews_summary (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id          UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  source            TEXT NOT NULL CHECK (source IN ('tripadvisor', 'google')),
  overall_rating    NUMERIC(3, 1),       -- 0.0–5.0
  review_count      INTEGER,
  food_score        NUMERIC(3, 1),       -- 0.0–5.0
  food_summary      TEXT,                -- Short text summary of food quality
  rooms_score       NUMERIC(3, 1),
  rooms_summary     TEXT,
  cleanliness_score NUMERIC(3, 1),
  service_score     NUMERIC(3, 1),
  beach_score       NUMERIC(3, 1),
  sentiment_tags    TEXT[] NOT NULL DEFAULT '{}',
  scraped_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, source)
);

COMMENT ON TABLE hotel_reviews_summary IS 'Aggregated review data from TripAdvisor and Google';
COMMENT ON COLUMN hotel_reviews_summary.sentiment_tags IS 'Short normalized tags: ["jedzenie: wyśmienite", "plaża wspomniana", ...]';

-- ────────────────────────────────────────────────────────────
-- SOURCE SNAPSHOTS (debugging aid)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS source_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_run_id   UUID REFERENCES search_runs(id) ON DELETE CASCADE,
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  url             TEXT,
  html_size_bytes INTEGER,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE source_snapshots IS 'Metadata about HTML snapshots saved during scraping';

-- ────────────────────────────────────────────────────────────
-- SCRAPE LOGS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_run_id   UUID REFERENCES search_runs(id) ON DELETE CASCADE,
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  level           TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message         TEXT NOT NULL,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE scrape_logs IS 'Structured scraper logs — queryable for debugging';
