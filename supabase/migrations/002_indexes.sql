-- ============================================================
-- 002 Performance Indexes
-- ============================================================

-- ── offers ──────────────────────────────────────────────────

-- Primary filter: date range
CREATE INDEX IF NOT EXISTS idx_offers_departure_date
  ON offers (departure_date);

-- Filter by airport
CREATE INDEX IF NOT EXISTS idx_offers_airport
  ON offers (departure_airport);

-- Filter by destination
CREATE INDEX IF NOT EXISTS idx_offers_destination
  ON offers (destination_id);

-- Filter by hotel stars
CREATE INDEX IF NOT EXISTS idx_offers_stars
  ON offers (hotel_stars);

-- Filter by board type
CREATE INDEX IF NOT EXISTS idx_offers_board_type
  ON offers (board_type);

-- Filter by price range
CREATE INDEX IF NOT EXISTS idx_offers_price_total
  ON offers (price_total);

-- Sort by composite score
CREATE INDEX IF NOT EXISTS idx_offers_composite_score
  ON offers (composite_score DESC NULLS LAST);

-- Filter available offers
CREATE INDEX IF NOT EXISTS idx_offers_available
  ON offers (is_available)
  WHERE is_available = TRUE;

-- Filter by provider
CREATE INDEX IF NOT EXISTS idx_offers_provider
  ON offers (provider_id);

-- Filter by hotel (for comparison view)
CREATE INDEX IF NOT EXISTS idx_offers_hotel
  ON offers (hotel_id);

-- Combined index for the most common query pattern:
-- departure_date + airport + hotel_stars + board_type
CREATE INDEX IF NOT EXISTS idx_offers_search
  ON offers (departure_date, departure_airport, hotel_stars, board_type)
  WHERE is_available = TRUE;

-- Scrape timestamp
CREATE INDEX IF NOT EXISTS idx_offers_scraped_at
  ON offers (scraped_at DESC);

-- ── hotels ──────────────────────────────────────────────────

-- Fuzzy search on hotel name (trigram)
CREATE INDEX IF NOT EXISTS idx_hotels_normalized_trgm
  ON hotels USING gin (normalized_name gin_trgm_ops);

-- Filter by destination + stars
CREATE INDEX IF NOT EXISTS idx_hotels_destination_stars
  ON hotels (destination_id, stars);

-- ── hotel_reviews_summary ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_reviews_hotel
  ON hotel_reviews_summary (hotel_id);

CREATE INDEX IF NOT EXISTS idx_reviews_rating
  ON hotel_reviews_summary (overall_rating DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_reviews_food_score
  ON hotel_reviews_summary (food_score DESC NULLS LAST);

-- ── hotel_aliases ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_aliases_hotel
  ON hotel_aliases (hotel_id);

CREATE INDEX IF NOT EXISTS idx_aliases_provider_name
  ON hotel_aliases (provider_id, provider_hotel_name);

-- ── search_runs ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_runs_created_at
  ON search_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_provider_status
  ON search_runs (provider_id, status);

-- ── scrape_logs ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_logs_run
  ON scrape_logs (search_run_id);

CREATE INDEX IF NOT EXISTS idx_logs_level_created
  ON scrape_logs (level, created_at DESC);
