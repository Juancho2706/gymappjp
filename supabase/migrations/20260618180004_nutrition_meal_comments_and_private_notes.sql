-- F1 · Feature E: feedback bidireccional + notas privadas del coach.
--  * nutrition_meal_comments  -> hilo BIDIRECCIONAL anclado a un dia/meal_log; alumno y coach.
--  * nutrition_private_notes   -> notas SOLO del coach; el alumno NUNCA puede leerlas (sin policy de cliente).
-- Append-friendly (created_at). Tablas nuevas, aisladas.

CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── Comentarios bidireccionales ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_meal_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meal_log_id uuid REFERENCES public.nutrition_meal_logs(id) ON DELETE CASCADE,
  log_date    date,
  author_id   uuid NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('client','coach')),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_meal_comments_client_idx   ON public.nutrition_meal_comments(client_id, log_date);
CREATE INDEX IF NOT EXISTS nutrition_meal_comments_meallog_idx  ON public.nutrition_meal_comments(meal_log_id);

ALTER TABLE public.nutrition_meal_comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_meal_comments TO authenticated;

DROP POLICY IF EXISTS nutrition_meal_comments_client_all ON public.nutrition_meal_comments;
CREATE POLICY nutrition_meal_comments_client_all ON public.nutrition_meal_comments FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = client_id)
  WITH CHECK ((SELECT auth.uid()) = client_id AND author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nutrition_meal_comments_coach_all ON public.nutrition_meal_comments;
CREATE POLICY nutrition_meal_comments_coach_all ON public.nutrition_meal_comments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = nutrition_meal_comments.client_id AND c.coach_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c
                 WHERE c.id = nutrition_meal_comments.client_id AND c.coach_id = (SELECT auth.uid()))
              AND author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS nutrition_meal_comments_team_all ON public.nutrition_meal_comments;
CREATE POLICY nutrition_meal_comments_team_all ON public.nutrition_meal_comments FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()) AND author_id = (SELECT auth.uid()));

-- ── Notas privadas del coach (cliente NUNCA lee) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.nutrition_private_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id   uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_private_notes_client_idx ON public.nutrition_private_notes(client_id);
CREATE INDEX IF NOT EXISTS nutrition_private_notes_coach_idx  ON public.nutrition_private_notes(coach_id);

ALTER TABLE public.nutrition_private_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_private_notes TO authenticated;

DROP TRIGGER IF EXISTS trg_nutrition_private_notes_updated ON public.nutrition_private_notes;
CREATE TRIGGER trg_nutrition_private_notes_updated BEFORE UPDATE ON public.nutrition_private_notes
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_set_updated_at();

-- SOLO coach (dueno del alumno). NO existe policy para el cliente => el alumno no puede SELECT.
DROP POLICY IF EXISTS nutrition_private_notes_coach_all ON public.nutrition_private_notes;
CREATE POLICY nutrition_private_notes_coach_all ON public.nutrition_private_notes FOR ALL TO authenticated
  USING (coach_id = (SELECT auth.uid())
         AND EXISTS (SELECT 1 FROM public.clients c
                     WHERE c.id = nutrition_private_notes.client_id AND c.coach_id = (SELECT auth.uid())))
  WITH CHECK (coach_id = (SELECT auth.uid())
         AND EXISTS (SELECT 1 FROM public.clients c
                     WHERE c.id = nutrition_private_notes.client_id AND c.coach_id = (SELECT auth.uid())));

-- Gestores de team (managers) pueden gestionar notas de los alumnos de su pool.
DROP POLICY IF EXISTS nutrition_private_notes_team_mgr_all ON public.nutrition_private_notes;
CREATE POLICY nutrition_private_notes_team_mgr_all ON public.nutrition_private_notes FOR ALL TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()) AND coach_id = (SELECT auth.uid()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()) AND coach_id = (SELECT auth.uid()));
