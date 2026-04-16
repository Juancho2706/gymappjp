-- Add goal_weight_kg to clients table for coach-set weight objective
ALTER TABLE clients ADD COLUMN IF NOT EXISTS goal_weight_kg NUMERIC(5, 2);
