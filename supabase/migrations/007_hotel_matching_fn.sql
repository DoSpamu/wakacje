-- Migration 007: pg_trgm hotel similarity function
-- Replaces client-side Fuse.js matching with a server-side function that
-- uses the existing GIN trigram index (idx_hotels_normalized_trgm) for O(log n) lookups.

CREATE OR REPLACE FUNCTION find_similar_hotels(
  p_normalized_name TEXT,
  p_destination_id  UUID DEFAULT NULL,
  p_min_similarity  FLOAT DEFAULT 0.4,
  p_limit           INT DEFAULT 5
)
RETURNS TABLE (
  id               UUID,
  canonical_name   TEXT,
  normalized_name  TEXT,
  destination_id   UUID,
  stars            INT,
  similarity       FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    h.id,
    h.canonical_name,
    h.normalized_name,
    h.destination_id,
    h.stars,
    similarity(h.normalized_name, p_normalized_name) AS similarity
  FROM hotels h
  WHERE
    (p_destination_id IS NULL OR h.destination_id = p_destination_id)
    AND similarity(h.normalized_name, p_normalized_name) >= p_min_similarity
  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION find_similar_hotels IS
  'Returns hotels ranked by trigram similarity to the given normalized name. '
  'Uses the GIN index on normalized_name for efficient lookup. '
  'Replaces client-side Fuse.js matching introduced in the initial build.';
