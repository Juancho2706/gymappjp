-- EVA Nutrición Pro: evolución aditiva del sistema vivo de recetas.
-- Aplicada en Supabase project `constant` (jikjeokundmaafuytdcx) el 2026-07-14.
-- Las recetas existentes conservan recipe_mode='idea'.

ALTER TABLE public.nutrition_recipes
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS recipe_mode text NOT NULL DEFAULT 'idea',
  ADD COLUMN IF NOT EXISTS servings numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS calories_per_serving numeric,
  ADD COLUMN IF NOT EXISTS protein_g_per_serving numeric,
  ADD COLUMN IF NOT EXISTS carbs_g_per_serving numeric,
  ADD COLUMN IF NOT EXISTS fats_g_per_serving numeric,
  ADD COLUMN IF NOT EXISTS fiber_g_per_serving numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='nutrition_recipes_mode_check'
      AND conrelid='public.nutrition_recipes'::regclass
  ) THEN
    ALTER TABLE public.nutrition_recipes
      ADD CONSTRAINT nutrition_recipes_mode_check
      CHECK (recipe_mode IN ('idea','structured')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='nutrition_recipes_servings_check'
      AND conrelid='public.nutrition_recipes'::regclass
  ) THEN
    ALTER TABLE public.nutrition_recipes
      ADD CONSTRAINT nutrition_recipes_servings_check
      CHECK (servings > 0 AND servings <= 1000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='nutrition_recipes_prep_time_check'
      AND conrelid='public.nutrition_recipes'::regclass
  ) THEN
    ALTER TABLE public.nutrition_recipes
      ADD CONSTRAINT nutrition_recipes_prep_time_check
      CHECK (prep_time_minutes IS NULL OR (prep_time_minutes >= 0 AND prep_time_minutes <= 10080)) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='nutrition_recipes_macros_nonnegative_check'
      AND conrelid='public.nutrition_recipes'::regclass
  ) THEN
    ALTER TABLE public.nutrition_recipes
      ADD CONSTRAINT nutrition_recipes_macros_nonnegative_check
      CHECK (
        (calories_per_serving IS NULL OR calories_per_serving >= 0)
        AND (protein_g_per_serving IS NULL OR protein_g_per_serving >= 0)
        AND (carbs_g_per_serving IS NULL OR carbs_g_per_serving >= 0)
        AND (fats_g_per_serving IS NULL OR fats_g_per_serving >= 0)
        AND (fiber_g_per_serving IS NULL OR fiber_g_per_serving >= 0)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nutrition_recipes_mode_idx
  ON public.nutrition_recipes (recipe_mode, created_at DESC);

CREATE TABLE IF NOT EXISTS public.nutrition_recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.nutrition_recipes(id) ON DELETE CASCADE,
  food_id uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  brand_snapshot text,
  quantity numeric NOT NULL,
  unit text NOT NULL,
  calories_snapshot numeric NOT NULL DEFAULT 0,
  protein_g_snapshot numeric NOT NULL DEFAULT 0,
  carbs_g_snapshot numeric NOT NULL DEFAULT 0,
  fats_g_snapshot numeric NOT NULL DEFAULT 0,
  fiber_g_snapshot numeric,
  serving_size_snapshot numeric NOT NULL DEFAULT 100,
  serving_unit_snapshot text,
  order_index integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_recipe_ingredients_quantity_check CHECK (quantity > 0),
  CONSTRAINT nutrition_recipe_ingredients_unit_check CHECK (unit IN ('g','ml','un')),
  CONSTRAINT nutrition_recipe_ingredients_serving_size_check CHECK (serving_size_snapshot > 0),
  CONSTRAINT nutrition_recipe_ingredients_macros_check CHECK (
    calories_snapshot >= 0
    AND protein_g_snapshot >= 0
    AND carbs_g_snapshot >= 0
    AND fats_g_snapshot >= 0
    AND (fiber_g_snapshot IS NULL OR fiber_g_snapshot >= 0)
  )
);

CREATE INDEX IF NOT EXISTS nutrition_recipe_ingredients_recipe_order_idx
  ON public.nutrition_recipe_ingredients (recipe_id, order_index, id);

CREATE INDEX IF NOT EXISTS nutrition_recipe_ingredients_food_idx
  ON public.nutrition_recipe_ingredients (food_id)
  WHERE food_id IS NOT NULL;

ALTER TABLE public.nutrition_recipe_ingredients ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_recipe_ingredients TO authenticated;

DROP POLICY IF EXISTS nutrition_recipe_ingredients_coach_all
  ON public.nutrition_recipe_ingredients;
CREATE POLICY nutrition_recipe_ingredients_coach_all
  ON public.nutrition_recipe_ingredients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_recipes r
      WHERE r.id = nutrition_recipe_ingredients.recipe_id
        AND r.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nutrition_recipes r
      WHERE r.id = nutrition_recipe_ingredients.recipe_id
        AND r.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS nutrition_recipe_ingredients_team_all
  ON public.nutrition_recipe_ingredients;
CREATE POLICY nutrition_recipe_ingredients_team_all
  ON public.nutrition_recipe_ingredients
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_recipes r
      WHERE r.id = nutrition_recipe_ingredients.recipe_id
        AND r.team_id IS NOT NULL
        AND r.team_id IN (SELECT current_user_team_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nutrition_recipes r
      WHERE r.id = nutrition_recipe_ingredients.recipe_id
        AND r.team_id IS NOT NULL
        AND r.team_id IN (SELECT current_user_team_ids())
    )
  );

DROP POLICY IF EXISTS nutrition_recipe_ingredients_client_select
  ON public.nutrition_recipe_ingredients;
CREATE POLICY nutrition_recipe_ingredients_client_select
  ON public.nutrition_recipe_ingredients
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_recipe_assignments a
      WHERE a.recipe_id = nutrition_recipe_ingredients.recipe_id
        AND a.client_id = (SELECT auth.uid())
    )
  );

COMMENT ON COLUMN public.nutrition_recipes.recipe_mode IS
  'idea = receta inspiracional Base; structured = receta cuantificable de Nutrición Pro.';
COMMENT ON TABLE public.nutrition_recipe_ingredients IS
  'Ingredientes estructurados con snapshot nutricional para preservar historia aunque foods cambie o se elimine.';
