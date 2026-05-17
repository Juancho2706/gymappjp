-- Add fasting_hours to daily_habits
ALTER TABLE daily_habits
  ADD COLUMN IF NOT EXISTS fasting_hours SMALLINT DEFAULT NULL
    CHECK (fasting_hours IS NULL OR (fasting_hours >= 0 AND fasting_hours <= 72));
