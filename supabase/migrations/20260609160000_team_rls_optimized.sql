-- Migration — TEAM RLS OPTIMIZADO (re-introduce acceso pool en hot tables, sin per-row).
--
-- Reemplaza las 16 policies team_*_member_all que se dropearon en el incidente
-- (20260609150000) por una version PROBADA-RAPIDA. El anti-patron era llamar
-- is_team_member(<columna de la fila>) -> SECURITY DEFINER con parametro de fila ->
-- el planner no puede cachearla (initPlan) -> evaluacion POR FILA -> timeouts.
--
-- Patron validado (Supabase RLS perf docs, jun 2026): funciones SECURITY DEFINER
-- STABLE que devuelven el SET precomputado de ids accesibles (SIN parametro de fila),
-- usadas como `col IN (SELECT helper())`. El planner las evalua UNA vez por query
-- (InitPlan / hashed SubPlan) y hace hash semi-join contra columnas indexadas.
-- Verificado con EXPLAIN ANALYZE en prod (tx+rollback): loops=1, hash join, ~7ms.
--
-- Aditiva / idempotente / forward-only. NO toca policies standalone/enterprise.
-- Mismo intent de acceso que migracion 1 (team_foundation): miembro activo full-access
-- a todo cliente del pool y su sub-data; templates (client_id NULL) compartidos por
-- autor acotado al mismo team.

-- (0) indices faltantes para el probe del hash join (tablas chicas -> plano, instantaneo)
CREATE INDEX IF NOT EXISTS client_payments_client_id_idx ON public.client_payments (client_id);
CREATE INDEX IF NOT EXISTS workout_programs_client_id_idx ON public.workout_programs (client_id);

-- (1) helpers set-returning (STABLE SECURITY DEFINER, sin parametro de fila => InitPlan)
CREATE OR REPLACE FUNCTION public.current_user_team_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tm.team_id
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.coach_id = auth.uid()
    AND tm.status = 'active' AND tm.deleted_at IS NULL
    AND t.deleted_at IS NULL
$$;

-- coaches que comparten al menos un team activo conmigo (incluyendome). Para templates por autor.
CREATE OR REPLACE FUNCTION public.current_user_pool_coach_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tm.coach_id
  FROM public.team_members tm
  WHERE tm.team_id IN (SELECT public.current_user_team_ids())
    AND tm.status = 'active' AND tm.deleted_at IS NULL
$$;

-- clients cuyo team_id esta en mis teams
CREATE OR REPLACE FUNCTION public.current_user_pool_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.clients c
  WHERE c.team_id IN (SELECT public.current_user_team_ids())
$$;

-- workout_plans accesibles: asignados (client en pool) O templates (client_id NULL & autor en pool)
CREATE OR REPLACE FUNCTION public.current_user_pool_workout_plan_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT wp.id FROM public.workout_plans wp
  WHERE wp.client_id IN (SELECT public.current_user_pool_client_ids())
     OR (wp.client_id IS NULL AND wp.coach_id IN (SELECT public.current_user_pool_coach_ids()))
$$;

-- nutrition_plans de clientes del pool
CREATE OR REPLACE FUNCTION public.current_user_pool_nutrition_plan_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT np.id FROM public.nutrition_plans np
  WHERE np.client_id IN (SELECT public.current_user_pool_client_ids())
$$;

-- daily_nutrition_logs de clientes del pool
CREATE OR REPLACE FUNCTION public.current_user_pool_daily_log_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id FROM public.daily_nutrition_logs d
  WHERE d.client_id IN (SELECT public.current_user_pool_client_ids())
$$;

-- nutrition_meals de planes de nutricion del pool
CREATE OR REPLACE FUNCTION public.current_user_pool_meal_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM public.nutrition_meals m
  WHERE m.plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids())
$$;

-- grants: revocar a PUBLIC/anon, otorgar a authenticated + service_role
DO $grants$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'current_user_team_ids',
    'current_user_pool_coach_ids',
    'current_user_pool_client_ids',
    'current_user_pool_workout_plan_ids',
    'current_user_pool_nutrition_plan_ids',
    'current_user_pool_daily_log_ids',
    'current_user_pool_meal_ids'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated, service_role', fn);
  END LOOP;
END
$grants$;

-- (2) policies optimizadas (FOR ALL: USING + WITH CHECK). Predicado sobre FKs propias de
--     la fila (no sobre su id) para que INSERT/UPDATE validen bien con WITH CHECK.

-- clients: por team_id propio
DROP POLICY IF EXISTS team_clients_member_all ON public.clients;
CREATE POLICY team_clients_member_all ON public.clients FOR ALL
  USING (team_id IN (SELECT public.current_user_team_ids()))
  WITH CHECK (team_id IN (SELECT public.current_user_team_ids()));

-- tablas hijas por client_id propio
DROP POLICY IF EXISTS team_check_ins_member_all ON public.check_ins;
CREATE POLICY team_check_ins_member_all ON public.check_ins FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_client_intake_member_all ON public.client_intake;
CREATE POLICY team_client_intake_member_all ON public.client_intake FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_workout_logs_member_all ON public.workout_logs;
CREATE POLICY team_workout_logs_member_all ON public.workout_logs FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_daily_habits_member_all ON public.daily_habits;
CREATE POLICY team_daily_habits_member_all ON public.daily_habits FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_client_food_prefs_member_all ON public.client_food_preferences;
CREATE POLICY team_client_food_prefs_member_all ON public.client_food_preferences FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_client_payments_member_all ON public.client_payments;
CREATE POLICY team_client_payments_member_all ON public.client_payments FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_daily_nutrition_logs_member_all ON public.daily_nutrition_logs;
CREATE POLICY team_daily_nutrition_logs_member_all ON public.daily_nutrition_logs FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_nutrition_plans_member_all ON public.nutrition_plans;
CREATE POLICY team_nutrition_plans_member_all ON public.nutrition_plans FOR ALL
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

-- nutrition_meal_logs por daily_log_id (parent pre-existe)
DROP POLICY IF EXISTS team_nutrition_meal_logs_member_all ON public.nutrition_meal_logs;
CREATE POLICY team_nutrition_meal_logs_member_all ON public.nutrition_meal_logs FOR ALL
  USING (daily_log_id IN (SELECT public.current_user_pool_daily_log_ids()))
  WITH CHECK (daily_log_id IN (SELECT public.current_user_pool_daily_log_ids()));

-- nutrition_meals por plan_id (parent pre-existe)
DROP POLICY IF EXISTS team_nutrition_meals_member_all ON public.nutrition_meals;
CREATE POLICY team_nutrition_meals_member_all ON public.nutrition_meals FOR ALL
  USING (plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids()))
  WITH CHECK (plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids()));

-- food_items por meal_id (parent pre-existe)
DROP POLICY IF EXISTS team_food_items_member_all ON public.food_items;
CREATE POLICY team_food_items_member_all ON public.food_items FOR ALL
  USING (meal_id IN (SELECT public.current_user_pool_meal_ids()))
  WITH CHECK (meal_id IN (SELECT public.current_user_pool_meal_ids()));

-- workout_plans: asignado (client en pool) O template (client_id NULL & autor en pool). Predicado sobre FKs propias.
DROP POLICY IF EXISTS team_workout_plans_member_all ON public.workout_plans;
CREATE POLICY team_workout_plans_member_all ON public.workout_plans FOR ALL
  USING (
    client_id IN (SELECT public.current_user_pool_client_ids())
    OR (client_id IS NULL AND coach_id IN (SELECT public.current_user_pool_coach_ids()))
  )
  WITH CHECK (
    client_id IN (SELECT public.current_user_pool_client_ids())
    OR (client_id IS NULL AND coach_id IN (SELECT public.current_user_pool_coach_ids()))
  );

-- workout_blocks por plan_id accesible (parent pre-existe)
DROP POLICY IF EXISTS team_workout_blocks_member_all ON public.workout_blocks;
CREATE POLICY team_workout_blocks_member_all ON public.workout_blocks FOR ALL
  USING (plan_id IN (SELECT public.current_user_pool_workout_plan_ids()))
  WITH CHECK (plan_id IN (SELECT public.current_user_pool_workout_plan_ids()));

-- workout_programs: misma logica que workout_plans (asignado O template), FKs propias
DROP POLICY IF EXISTS team_workout_programs_member_all ON public.workout_programs;
CREATE POLICY team_workout_programs_member_all ON public.workout_programs FOR ALL
  USING (
    client_id IN (SELECT public.current_user_pool_client_ids())
    OR (client_id IS NULL AND coach_id IN (SELECT public.current_user_pool_coach_ids()))
  )
  WITH CHECK (
    client_id IN (SELECT public.current_user_pool_client_ids())
    OR (client_id IS NULL AND coach_id IN (SELECT public.current_user_pool_coach_ids()))
  );

-- nutrition_plan_templates: compartidos por autor en el pool
DROP POLICY IF EXISTS team_nutrition_plan_templates_member_all ON public.nutrition_plan_templates;
CREATE POLICY team_nutrition_plan_templates_member_all ON public.nutrition_plan_templates FOR ALL
  USING (coach_id IN (SELECT public.current_user_pool_coach_ids()))
  WITH CHECK (coach_id IN (SELECT public.current_user_pool_coach_ids()));
