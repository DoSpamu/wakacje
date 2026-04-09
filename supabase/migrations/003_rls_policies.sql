-- ============================================================
-- 003 Row Level Security Policies
-- ============================================================
-- The scraper uses service_role key (bypasses RLS).
-- The frontend uses anon key (subject to RLS).
-- All data is publicly readable — no user auth required.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE providers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE destinations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_aliases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_reviews_summary  ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs            ENABLE ROW LEVEL SECURITY;

-- ── Public READ for all tables (anon key) ───────────────────

CREATE POLICY "Public read providers"
  ON providers FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read destinations"
  ON destinations FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read hotels"
  ON hotels FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read hotel_aliases"
  ON hotel_aliases FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read search_runs"
  ON search_runs FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read offers"
  ON offers FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read hotel_reviews_summary"
  ON hotel_reviews_summary FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read source_snapshots"
  ON source_snapshots FOR SELECT TO anon USING (TRUE);

CREATE POLICY "Public read scrape_logs"
  ON scrape_logs FOR SELECT TO anon USING (TRUE);

-- ── Service role has full access (no RLS restriction) ───────
-- Service role bypasses RLS by default in Supabase.
-- No policies needed for service_role.

-- ── Trigger scrape via API route (optional) ─────────────────
-- If you add authentication later, modify policies here.
