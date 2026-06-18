-- F1 · Feature L: Recetas (ideas). NIVEL 0 — solo inspiracion, SIN macros/adherencia, SIN
-- reemplazar nada, SIN add-on (disponible en tier Pro+). Scope coach XOR team (no global EVA).
-- Asignable a 1..N alumnos. El alumno las ve como "Ideas de recetas" separadas del plan.
-- Foto opcional del coach (bucket privado, fuera de esta migracion). Tablas nuevas, aisladas.

CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── Recetas ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_recipes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  name            text NOT NULL,
  ingredients_text text,
  instructions    text,
  image_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_recipes_scope_xor CHECK (num_nonnulls(coach_id, team_id) = 1)
);
CREATE INDEX IF NOT EXISTS nutrition_recipes_coach_idx ON public.nutrition_recipes(coach_id);
CREATE INDEX IF NOT EXISTS nutrition_recipes_team_idx  ON public.nutrition_recipes(team_id);

ALTER TABLE public.nutrition_recipes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_recipes TO authenticated;

DROP TRIGGER IF EXISTS trg_nutrition_recipes_updated ON public.nutrition_recipes;
CREATE TRIGGER trg_nutrition_recipes_updated BEFORE UPDATE ON public.nutrition_recipes
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_set_updated_at();

-- ── Asignaciones receta -> alumno ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_recipe_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid NOT NULL REFERENCES public.nutrition_recipes(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  assigned_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_recipe_assignments_uq UNIQUE (recipe_id, client_id)
);
CREATE INDEX IF NOT EXISTS nutrition_recipe_assignments_client_idx ON public.nutrition_recipe_assignments(client_id);
CREATE INDEX IF NOT EXISTS nutrition_recipe_assignments_recipe_idx ON public.nutrition_recipe_assignments(recipe_id);

ALTER TABLE public.nutrition_recipe_assignments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_recipe_assignments TO authenticated;

-- RLS recetas: coach dueno; team (coaches del team); alumno SOLO si la receta esta asignada a el.
DROP POLICY IF EXISTS nutrition_recipes_coach_all ON public.nutrition_recipes;
CREATE POLICY nutrition_recipes_coach_all ON public.nutrition_recipes FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid()))
  WITH CHECK (coach_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nutrition_recipes_team_all ON public.nutrition_recipes;
CREATE POLICY nutrition_recipes_team_all ON public.nutrition_recipes FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND team_id IN (SELECT current_user_team_ids()))
  WITH CHECK (team_id IS NOT NULL AND team_id IN (SELECT current_user_team_ids()));

DROP POLICY IF EXISTS nutrition_recipes_client_select ON public.nutrition_recipes;
CREATE POLICY nutrition_recipes_client_select ON public.nutrition_recipes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.nutrition_recipe_assignments a
                 WHERE a.recipe_id = nutrition_recipes.id AND a.client_id = (SELECT auth.uid())));

-- RLS asignaciones: coach asigna a SUS alumnos; team pool; alumno lee las suyas.
DROP POLICY IF EXISTS nutrition_recipe_assignments_coach_all ON public.nutrition_recipe_assignments;
CREATE POLICY nutrition_recipe_assignments_coach_all ON public.nutrition_recipe_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = nutrition_recipe_assignments.client_id AND c.coach_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = nutrition_recipe_assignments.client_id AND c.coach_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS nutrition_recipe_assignments_team_all ON public.nutrition_recipe_assignments;
CREATE POLICY nutrition_recipe_assignments_team_all ON public.nutrition_recipe_assignments FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));

DROP POLICY IF EXISTS nutrition_recipe_assignments_client_select ON public.nutrition_recipe_assignments;
CREATE POLICY nutrition_recipe_assignments_client_select ON public.nutrition_recipe_assignments FOR SELECT TO authenticated
  USING (client_id = (SELECT auth.uid()));
