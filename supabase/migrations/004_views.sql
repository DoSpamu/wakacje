-- ============================================================
-- 004 Useful Views
-- ============================================================

-- ── offers_enriched ─────────────────────────────────────────
-- Full offer view joined with hotel + review data
-- Used by the frontend API routes
CREATE OR REPLACE VIEW offers_enriched AS
SELECT
  o.id,
  o.search_run_id,
  o.provider_id,
  o.hotel_id,
  o.provider_offer_id,
  o.destination_id,
  o.departure_airport,
  o.departure_date,
  o.return_date,
  o.nights,
  o.hotel_name,
  o.hotel_stars,
  o.hotel_location,
  o.board_type,
  o.room_type,
  o.price_total,
  o.price_per_person,
  o.currency,
  o.adults,
  o.children,
  o.source_url,
  o.composite_score,
  o.is_available,
  o.scraped_at,
  o.created_at,

  -- Provider info
  p.code AS provider_code,
  p.name AS provider_name,

  -- Destination info
  d.canonical_name AS destination_canonical,
  d.display_name AS destination_display,
  d.country_code,

  -- Hotel canonical name
  h.canonical_name AS hotel_canonical_name,

  -- TripAdvisor review data
  ta.overall_rating AS tripadvisor_rating,
  ta.review_count   AS tripadvisor_reviews,
  ta.food_score     AS tripadvisor_food_score,
  ta.food_summary   AS tripadvisor_food_summary,
  ta.rooms_score    AS tripadvisor_rooms_score,
  ta.rooms_summary  AS tripadvisor_rooms_summary,
  ta.cleanliness_score AS tripadvisor_cleanliness,
  ta.service_score  AS tripadvisor_service,
  ta.sentiment_tags AS tripadvisor_tags,

  -- Google review data
  g.overall_rating  AS google_rating,
  g.review_count    AS google_reviews,
  g.food_score      AS google_food_score

FROM offers o
LEFT JOIN providers             p  ON p.id  = o.provider_id
LEFT JOIN destinations          d  ON d.id  = o.destination_id
LEFT JOIN hotels                h  ON h.id  = o.hotel_id
LEFT JOIN hotel_reviews_summary ta ON ta.hotel_id = o.hotel_id AND ta.source = 'tripadvisor'
LEFT JOIN hotel_reviews_summary g  ON g.hotel_id  = o.hotel_id AND g.source  = 'google';

-- ── hotel_price_comparison ──────────────────────────────────
-- For each hotel: all providers + their best price for same period
CREATE OR REPLACE VIEW hotel_price_comparison AS
SELECT
  h.id AS hotel_id,
  h.canonical_name,
  h.stars,
  d.display_name AS destination,
  p.code AS provider_code,
  p.name AS provider_name,
  MIN(o.price_total) AS best_price,
  MIN(o.price_per_person) AS best_per_person,
  COUNT(o.id) AS offer_count,
  MIN(o.departure_date) AS earliest_departure,
  ta.overall_rating AS tripadvisor_rating,
  ta.food_score     AS food_score,
  ta.sentiment_tags AS tags
FROM hotels h
JOIN offers o          ON o.hotel_id    = h.id AND o.is_available = TRUE
JOIN providers p       ON p.id          = o.provider_id
LEFT JOIN destinations d ON d.id         = h.destination_id
LEFT JOIN hotel_reviews_summary ta ON ta.hotel_id = h.id AND ta.source = 'tripadvisor'
GROUP BY h.id, h.canonical_name, h.stars, d.display_name, p.code, p.name, ta.overall_rating, ta.food_score, ta.sentiment_tags;

-- ── scrape_run_summary ──────────────────────────────────────
CREATE OR REPLACE VIEW scrape_run_summary AS
SELECT
  sr.id,
  sr.status,
  sr.started_at,
  sr.completed_at,
  sr.offers_found,
  sr.error_message,
  sr.created_at,
  p.code  AS provider_code,
  p.name  AS provider_name,
  EXTRACT(EPOCH FROM (sr.completed_at - sr.started_at)) AS duration_seconds
FROM search_runs sr
LEFT JOIN providers p ON p.id = sr.provider_id
ORDER BY sr.created_at DESC;
