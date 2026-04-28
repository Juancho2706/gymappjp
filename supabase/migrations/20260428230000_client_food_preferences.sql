-- Client food preferences: favorite / dislike flags per food item.
-- Purely additive — no existing data modified.

CREATE TABLE IF NOT EXISTS client_food_preferences (
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  food_id   UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL CHECK (preference_type IN ('favorite', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, food_id)
);

CREATE INDEX IF NOT EXISTS idx_client_food_prefs_client ON client_food_preferences(client_id);
CREATE INDEX IF NOT EXISTS idx_client_food_prefs_food   ON client_food_preferences(food_id);

ALTER TABLE client_food_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client own prefs" ON client_food_preferences
  FOR ALL USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

CREATE POLICY "coach read client prefs" ON client_food_preferences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_food_preferences.client_id
        AND c.coach_id = auth.uid()
    )
  );

COMMENT ON TABLE client_food_preferences IS 'Per-client food preference flags: favorite or dislike.';
