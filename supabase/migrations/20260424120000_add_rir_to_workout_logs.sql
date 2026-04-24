ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS rir integer CHECK (rir >= 0 AND rir <= 10);
