-- Audit DB 2026-06-16: multiple_permissive_policies — drop de 17 políticas legacy DUPLICADAS en 4
-- tablas calientes (clients, client_intake, workout_plans, daily_nutrition_logs). Eran copias public-role
-- (nombres descriptivos viejos) cuyo predicado YA está cubierto por la política canónica authenticated
-- (o por la team_*_member_all de pool, que se mantiene). Postgres OR-evaluaba todas por query -> overhead.
-- (multiple_permissive 575 -> 510 tras este drop.)
--
-- SEGURIDAD: validado con harness de visibilidad (SET ROLE authenticated + request.jwt.claims) ANTES de
-- aplicar — conteo de filas visibles por 4 usuarios (alumno self, coach owner, otro coach, pool coach)
-- x 4 tablas, ANTES vs DESPUÉS de los drops: IDÉNTICO en los 16 pares (0 cambios de acceso),
-- sanity_before=193. Survivors que quedan: clients_self_select/_update, client_intake_client/_coach +
-- team_client_intake_member_all, daily_nutrition_logs_client/_coach/_coach_select +
-- team_daily_nutrition_logs_member_all, workout_plans_coach/_client_read + team_workout_plans_member_all,
-- y todas las org_* (scopes distintos, intactas). Idempotente (IF EXISTS), forward-only.

-- clients
DROP POLICY IF EXISTS "Client can view their own profile" ON public.clients;
DROP POLICY IF EXISTS client_read_self ON public.clients;
DROP POLICY IF EXISTS "Client can update their own profile" ON public.clients;
DROP POLICY IF EXISTS client_update_self ON public.clients;

-- client_intake
DROP POLICY IF EXISTS "Coaches can view intakes of their clients" ON public.client_intake;
DROP POLICY IF EXISTS "Coach can view their clients' intake" ON public.client_intake;
DROP POLICY IF EXISTS "Client can manage their own intake" ON public.client_intake;
DROP POLICY IF EXISTS "Clients can view own intake" ON public.client_intake;
DROP POLICY IF EXISTS "Clients can insert own intake" ON public.client_intake;
DROP POLICY IF EXISTS "Clients can update own intake" ON public.client_intake;

-- daily_nutrition_logs
DROP POLICY IF EXISTS "Client can manage their own daily nutrition logs" ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS daily_nutrition_logs_client_all ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS "Coach can view their clients' daily nutrition logs" ON public.daily_nutrition_logs;

-- workout_plans
DROP POLICY IF EXISTS "Coach can manage workout plans for their clients" ON public.workout_plans;
DROP POLICY IF EXISTS coaches_manage_plans ON public.workout_plans;
DROP POLICY IF EXISTS "Client can view their own workout plans" ON public.workout_plans;
DROP POLICY IF EXISTS clients_read_own_plans ON public.workout_plans;
