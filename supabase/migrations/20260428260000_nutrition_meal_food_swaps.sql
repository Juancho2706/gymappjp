-- Persisted food swaps performed by clients on specific meal logs.
-- One row per (daily_log, meal, original_food) keeps latest chosen replacement.

CREATE TABLE IF NOT EXISTS nutrition_meal_food_swaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  daily_log_id UUID NOT NULL REFERENCES daily_nutrition_logs(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  original_food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  swapped_food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_meal_food_swaps_distinct_foods CHECK (original_food_id <> swapped_food_id),
  CONSTRAINT nutrition_meal_food_swaps_unique_per_meal_food
    UNIQUE (daily_log_id, meal_id, original_food_id)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_meal_food_swaps_client_date
  ON nutrition_meal_food_swaps (client_id, daily_log_id);

CREATE INDEX IF NOT EXISTS idx_nutrition_meal_food_swaps_meal
  ON nutrition_meal_food_swaps (meal_id);

ALTER TABLE nutrition_meal_food_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client own meal food swaps" ON nutrition_meal_food_swaps
  FOR ALL
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "coach read client meal food swaps" ON nutrition_meal_food_swaps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM clients c
      WHERE c.id = nutrition_meal_food_swaps.client_id
        AND c.coach_id = auth.uid()
    )
  );

COMMENT ON TABLE nutrition_meal_food_swaps IS 'Client food replacements per meal log (swap history state).';
