-- Add review_snippets column to hotel_reviews_summary
-- Each snippet: { text: string, rating: number | null }
-- Populated by TripAdvisorEnricher from visible review cards on hotel page
ALTER TABLE hotel_reviews_summary
  ADD COLUMN IF NOT EXISTS review_snippets jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN hotel_reviews_summary.review_snippets IS
  'Array of {text: string, rating: number | null} objects — up to 5 review snippets';
