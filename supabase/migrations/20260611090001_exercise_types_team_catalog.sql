-- Plan 2 Movida (entrenamiento) — M1: exercise_type + ownership team en el catalogo. Fase EXPAND.
-- Spec: specs/movida-entrenamiento/SPEC.md (AC6, AC11) + PLAN.md (decisiones #1 y #7).
-- Modelo de ownership: exactamente uno de coach_id | org_id | team_id (system = los 3 NULL).
-- Miembro activo del team ve/edita system + team + propios (full-access plano del pool).
-- Aditiva / idempotente / forward-only (replay-safe: el merge re-ejecuta TODO el historial).
-- RLS: patron set-returning + col IN (SELECT helper()) — InitPlan, 1 eval/query (leccion 2026-06-09;
-- helper public.current_user_team_ids() ya en prod, migracion 20260609160000). JAMAS per-row.
-- Grants: NO se crean tablas ni funciones nuevas -> no aplica el bloque REVOKE/GRANT del gotcha
-- de default privileges (20260609054917); los grants existentes de exercises no cambian con ADD COLUMN.

-- Tipo + ownership team en el catalogo (expand)
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS exercise_type text NOT NULL DEFAULT 'strength',
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'exercises_exercise_type_check'
                   AND conrelid = 'public.exercises'::regclass) THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_exercise_type_check
      CHECK (exercise_type IN ('strength','cardio','mobility','roller')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'exercises_single_owner_check'
                   AND conrelid = 'public.exercises'::regclass) THEN
    ALTER TABLE public.exercises ADD CONSTRAINT exercises_single_owner_check
      CHECK (num_nonnulls(coach_id, org_id, team_id) <= 1) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_exercise_type_check;
-- OJO merge: este VALIDATE pasa trivial en el branch (los preview branches NO tienen data de prod),
-- pero el merge re-ejecuta la migracion contra la DATA REAL — si existe alguna fila legacy con
-- coach_id Y org_id no-null (org_id se agrego en 20260608130000), el merge FALLA a mitad de camino.
-- Pre-check read-only obligatorio en prod ANTES del merge (checklist F1 del PLAN):
--   SELECT count(*) FROM public.exercises WHERE num_nonnulls(coach_id, org_id) > 1;  -- debe dar 0
-- Si diera > 0: quitar el VALIDATE de single_owner de esta migracion (queda NOT VALID, expand) y
-- validar en una migracion posterior tras corregir las filas legacy.
ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_single_owner_check;

-- Indice FK COMPLETO (no parcial): el advisor unindexed_foreign_keys no reconoce indices parciales
-- (gotcha documentado en 20260609062017). El PLAN proponia parcial WHERE team_id IS NOT NULL;
-- se ajusta a completo para advisors 0 criticos en F1.
CREATE INDEX IF NOT EXISTS idx_exercises_team_id ON public.exercises (team_id);

-- RLS: cerrar el predicado system (team_id IS NULL) y abrir el 3er caso team.
-- Patron set-returning + col IN (SELECT helper()) — InitPlan, 1 eval/query (regla dura 2026-06-09).
-- Reemplaza exercises_select_visible de 20260608180000 (que dejaba pasar filas team como "system").
-- Las policies de alumno (exercises_client_coach_select / exercises_client_org_select) quedan
-- intactas; exercises_org_update se endurece mas abajo (hueco WITH CHECK pre-existente).
--
-- TO authenticated en las 5 policies nuevas (team + client_team) es OBLIGATORIO, no cosmetico:
-- anon tiene GRANT ALL sobre exercises (baseline 00000000000001 L3634) pero el EXECUTE de
-- public.current_user_team_ids() le fue REVOCADO (20260609160000 L92). Sin TO authenticated,
-- cualquier SELECT con anon key evaluaria exercises_team_select y reventaria con 'permission
-- denied for function current_user_team_ids' (cambio de comportamiento NO aditivo, 500s confusos).
-- Con TO authenticated, anon conserva exactamente el comportamiento actual via
-- exercises_select_visible (los paths pre-auth de la app usan service role).
DROP POLICY IF EXISTS exercises_select_visible ON public.exercises;
CREATE POLICY exercises_select_visible ON public.exercises FOR SELECT
  USING ((coach_id IS NULL AND org_id IS NULL AND team_id IS NULL)
      OR (coach_id = (SELECT auth.uid()) AND org_id IS NULL));

DROP POLICY IF EXISTS exercises_team_select ON public.exercises;
CREATE POLICY exercises_team_select ON public.exercises FOR SELECT
  TO authenticated
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_insert ON public.exercises;
CREATE POLICY exercises_team_insert ON public.exercises FOR INSERT
  TO authenticated
  WITH CHECK (team_id IS NOT NULL AND coach_id IS NULL AND org_id IS NULL
    AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_update ON public.exercises;
CREATE POLICY exercises_team_update ON public.exercises FOR UPDATE
  TO authenticated
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()))
  -- El WITH CHECK exige que el team_id NUEVO tambien sea propio: sin esa clausula, un miembro del
  -- team A podria re-apuntar team_id de un ejercicio de A al uuid del team B e inyectar contenido
  -- en el catalogo ajeno (lo verian sus miembros y alumnos, sin posibilidad de revertir). AC6.
  WITH CHECK (team_id IS NOT NULL AND coach_id IS NULL AND org_id IS NULL
    AND team_id IN (SELECT public.current_user_team_ids()));
DROP POLICY IF EXISTS exercises_team_delete ON public.exercises;
CREATE POLICY exercises_team_delete ON public.exercises FOR DELETE
  TO authenticated
  USING (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_team_ids()));

-- Alumno del pool lee el catalogo de su team (subquery NO correlacionada -> InitPlan)
DROP POLICY IF EXISTS exercises_client_team_select ON public.exercises;
CREATE POLICY exercises_client_team_select ON public.exercises FOR SELECT
  TO authenticated
  USING (team_id IS NOT NULL AND team_id IN (
    SELECT c.team_id FROM public.clients c
    WHERE c.id = (SELECT auth.uid()) AND c.team_id IS NOT NULL));

-- Hardening cross-policy (hueco PRE-EXISTENTE de 20260608180000 L81-83, mismo vector que AC6):
-- exercises_org_update tenia WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL) SIN
-- is_org_admin_member(org_id). Como los WITH CHECK permisivos se combinan con OR entre policies,
-- un coach que pasa el USING de exercises_update_own o exercises_team_update sobre una fila
-- propia/team podia re-apuntar org_id a CUALQUIER org e inyectar contenido en el catalogo
-- enterprise ajeno. Se recrea con membresia admin exigida en el row NUEVO. La inyeccion inversa
-- ORG->TEAM ya esta bloqueada (exercises_team_update WITH CHECK exige membresia del team).
-- (foods_org_update tiene el mismo hueco — follow-up aparte, fuera de este plan.)
DROP POLICY IF EXISTS exercises_org_update ON public.exercises;
CREATE POLICY exercises_org_update ON public.exercises FOR UPDATE
  USING (org_id IS NOT NULL AND public.is_org_admin_member(org_id))
  WITH CHECK (org_id IS NOT NULL AND coach_id IS NULL AND public.is_org_admin_member(org_id));
