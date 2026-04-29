-- Allow clients to persist custom quantity/unit when applying a food swap.

ALTER TABLE nutrition_meal_food_swaps
  ADD COLUMN IF NOT EXISTS swapped_quantity NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS swapped_unit TEXT;

ALTER TABLE nutrition_meal_food_swaps
  DROP CONSTRAINT IF EXISTS nutrition_meal_food_swaps_quantity_nonnegative;

ALTER TABLE nutrition_meal_food_swaps
  ADD CONSTRAINT nutrition_meal_food_swaps_quantity_nonnegative
  CHECK (swapped_quantity IS NULL OR swapped_quantity > 0);

ALTER TABLE nutrition_meal_food_swaps
  DROP CONSTRAINT IF EXISTS nutrition_meal_food_swaps_unit_valid;

ALTER TABLE nutrition_meal_food_swaps
  ADD CONSTRAINT nutrition_meal_food_swaps_unit_valid
  CHECK (swapped_unit IS NULL OR swapped_unit IN ('g', 'un', 'ml'));

COMMENT ON COLUMN nutrition_meal_food_swaps.swapped_quantity IS
  'Optional quantity selected by client for swapped food; NULL means use original item quantity.';

COMMENT ON COLUMN nutrition_meal_food_swaps.swapped_unit IS
  'Optional unit selected by client for swapped food; NULL means use original item unit.';
