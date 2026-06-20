-- F1 · nutrition_intake_entries: registro de ingesta FUERA de plan (feature: off-plan log).
-- Desacoplado de la prescripcion. El alumno registra lo que comio de verdad; el coach lo
-- ve como contexto. Tabla nueva, aislada. RLS espeja nutrition_meal_logs (client own +
-- coach read + team pool).

CREATE TABLE IF NOT EXISTS public.nutrition_intake_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  log_date    date NOT NULL,
  food_id     uuid REFERENCES public.foods(id) ON DELETE SET NULL,
  custom_name text,
  quantity    numeric NOT NULL,
  unit        text NOT NULL,
  source      text NOT NULL DEFAULT 'offplan' CHECK (source IN ('offplan','quickadd','recent','copy')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_intake_entries_client_date_idx
  ON public.nutrition_intake_entries(client_id, log_date);
CREATE INDEX IF NOT EXISTS nutrition_intake_entries_food_idx
  ON public.nutrition_intake_entries(food_id);

ALTER TABLE public.nutrition_intake_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_intake_entries TO authenticated;

DROP POLICY IF EXISTS nutrition_intake_client_all ON public.nutrition_intake_entries;
CREATE POLICY nutrition_intake_client_all ON public.nutrition_intake_entries FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = client_id)
  WITH CHECK ((SELECT auth.uid()) = client_id);

DROP POLICY IF EXISTS nutrition_intake_coach_select ON public.nutrition_intake_entries;
CREATE POLICY nutrition_intake_coach_select ON public.nutrition_intake_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = nutrition_intake_entries.client_id AND c.coach_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS nutrition_intake_team_all ON public.nutrition_intake_entries;
CREATE POLICY nutrition_intake_team_all ON public.nutrition_intake_entries FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));
