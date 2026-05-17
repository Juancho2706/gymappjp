-- Food swap groups: coach defines sets of equivalent foods.
-- Clients can swap plan foods for others in the same group.

CREATE TABLE IF NOT EXISTS food_swap_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id   UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  food_ids   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_swap_groups_coach ON food_swap_groups(coach_id);

ALTER TABLE food_swap_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach own swap groups" ON food_swap_groups
  FOR ALL USING (auth.uid() = coach_id) WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "client read coach swap groups" ON food_swap_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = auth.uid()
        AND c.coach_id = food_swap_groups.coach_id
    )
  );

COMMENT ON TABLE food_swap_groups IS 'Coach-defined groups of interchangeable foods for client plan swaps.';
