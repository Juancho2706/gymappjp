-- Daily habit tracking per client per date.
-- Purely additive — water, steps, sleep. UNIQUE (client_id, log_date).

CREATE TABLE IF NOT EXISTS daily_habits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  log_date    DATE NOT NULL,
  water_ml    SMALLINT CHECK (water_ml >= 0),
  steps       INT   CHECK (steps >= 0),
  sleep_hours NUMERIC(3,1) CHECK (sleep_hours >= 0 AND sleep_hours <= 24),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_habits_client_date
  ON daily_habits (client_id, log_date DESC);

ALTER TABLE daily_habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client own habits" ON daily_habits
  FOR ALL USING (auth.uid() = client_id) WITH CHECK (auth.uid() = client_id);

CREATE POLICY "coach read client habits" ON daily_habits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = daily_habits.client_id
        AND c.coach_id = auth.uid()
    )
  );

COMMENT ON TABLE daily_habits IS 'Daily habit tracking: water, steps, sleep per client per date.';
