-- client_food_preferences.food_id must reference catalog foods(id), not plan line food_items(id).
-- Fixes inserts from client UI which always sends foods.id.

DELETE FROM client_food_preferences cfp
WHERE NOT EXISTS (SELECT 1 FROM public.foods f WHERE f.id = cfp.food_id);

ALTER TABLE client_food_preferences
  DROP CONSTRAINT IF EXISTS client_food_preferences_food_id_fkey;

ALTER TABLE client_food_preferences
  ADD CONSTRAINT client_food_preferences_food_id_fkey
  FOREIGN KEY (food_id) REFERENCES public.foods(id) ON DELETE CASCADE;

COMMENT ON COLUMN client_food_preferences.food_id IS 'Catalog foods.id the client marked favorite/dislike.';
