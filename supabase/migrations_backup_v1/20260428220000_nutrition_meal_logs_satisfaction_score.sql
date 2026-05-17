-- Add optional satisfaction_score to nutrition_meal_logs.
-- NULL = no feedback given (default, preserves all existing rows as-is).
-- 1 = no me gustó, 2 = regular, 3 = muy rico.
-- This is purely additive — no existing data is modified.

ALTER TABLE nutrition_meal_logs
  ADD COLUMN IF NOT EXISTS satisfaction_score SMALLINT
    CHECK (satisfaction_score IN (1, 2, 3));

COMMENT ON COLUMN nutrition_meal_logs.satisfaction_score IS
  'Optional meal satisfaction: 1=no me gustó, 2=regular, 3=muy rico. NULL means no feedback.';
