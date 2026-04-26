-- Price alerts: notify users when a hotel drops below their threshold
CREATE TABLE IF NOT EXISTS price_alerts (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email          text        NOT NULL,
  hotel_id       uuid        NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  threshold_price integer    NOT NULL CHECK (threshold_price > 0),
  last_notified_price integer,
  last_notified_at timestamptz,
  created_at     timestamptz DEFAULT now()
);

-- One alert per (email, hotel) pair — upsert updates the threshold
CREATE UNIQUE INDEX IF NOT EXISTS price_alerts_email_hotel_idx ON price_alerts(email, hotel_id);
CREATE INDEX IF NOT EXISTS price_alerts_hotel_id_idx ON price_alerts(hotel_id);

-- RLS: users can only see/delete their own alerts (by email)
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON price_alerts
  FOR ALL USING (true)
  WITH CHECK (true);
