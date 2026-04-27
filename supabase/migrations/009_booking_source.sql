-- ============================================================
-- 009 Add 'booking' to hotel_reviews_summary source constraint
-- ============================================================
-- Previous constraint only allowed 'tripadvisor' and 'google'.
-- BookingReviewEnricher writes source = 'booking', so expand it.

ALTER TABLE hotel_reviews_summary
  DROP CONSTRAINT IF EXISTS hotel_reviews_summary_source_check;

ALTER TABLE hotel_reviews_summary
  ADD CONSTRAINT hotel_reviews_summary_source_check
  CHECK (source IN ('tripadvisor', 'google', 'booking'));
