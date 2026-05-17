-- Per-plan/per-item swap options configured by coach in PlanBuilder.
-- Stored as JSONB array to keep snapshot of option macros displayed to clients.

ALTER TABLE food_items
  ADD COLUMN IF NOT EXISTS swap_options JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE saved_meal_items
  ADD COLUMN IF NOT EXISTS swap_options JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN food_items.swap_options IS
  'JSON array of allowed swap options for this plan item: [{food_id,name,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit}]';

COMMENT ON COLUMN saved_meal_items.swap_options IS
  'JSON array of allowed swap options for this template item: [{food_id,name,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit}]';
