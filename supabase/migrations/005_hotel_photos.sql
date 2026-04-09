-- ============================================================
-- 005 Hotel photos + YouTube video ID
-- ============================================================

-- Add media columns to hotels
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS cover_photo_url  TEXT;

-- Hotel photos table
CREATE TABLE IF NOT EXISTS hotel_photos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'tripadvisor',  -- 'tripadvisor' | 'google' | 'provider'
  caption     TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hotel_photos_hotel_id_idx ON hotel_photos(hotel_id, sort_order);

ALTER TABLE hotel_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel_photos_select" ON hotel_photos FOR SELECT USING (true);
