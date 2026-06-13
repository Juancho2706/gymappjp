-- INCIDENTE 2026-06-09 (~14:55-15:00 UTC) — REVERT de RLS team en HOT TABLES.
--
-- Causa raiz: las policies team_*_member_all (migracion 1, team_foundation) usaban
-- is_team_member()/is_team_manager() SECURITY DEFINER evaluadas POR FILA + subqueries
-- EXISTS correlacionadas. El planner las trata como opacas -> evaluacion per-row en las
-- tablas calientes (clients, workout_*, nutrition_*, check_ins...). Bajo carga real sobre
-- compute t4g.nano: statement timeouts masivos -> DB Unhealthy -> alumnos no logean + web lenta.
--
-- Fix: DROP de las 16 policies en hot tables. Perdida funcional CERO (teams en prod = 0,
-- ningun cliente tiene team_id; el app deployado en master no consulta tablas team).
-- Las policies standalone/enterprise (coach_id = auth.uid(), org-scoped) quedan INTACTAS.
-- Idempotente (IF EXISTS) y forward-only.
--
-- Las policies de las tablas team_* NUEVAS (teams, team_members, team_audit_logs,
-- team_access_logs) NO se tocan: estan fuera del hot path y no afectan login.
--
-- PENDIENTE antes de provisionar Movida: re-introducir el acceso pool en forma OPTIMIZADA
-- (no SECURITY DEFINER por fila). Opciones a evaluar: envolver el check en (select ...)
-- para que el planner lo cachee como InitPlan, o materializar membresia/ids del pool en
-- una estructura indexable. Ver docs/plans/movida/00-DIRECTOR.md (bitacora + leccion RLS).

DROP POLICY IF EXISTS team_clients_member_all ON public.clients;
DROP POLICY IF EXISTS team_check_ins_member_all ON public.check_ins;
DROP POLICY IF EXISTS team_client_intake_member_all ON public.client_intake;
DROP POLICY IF EXISTS team_workout_logs_member_all ON public.workout_logs;
DROP POLICY IF EXISTS team_daily_habits_member_all ON public.daily_habits;
DROP POLICY IF EXISTS team_client_food_prefs_member_all ON public.client_food_preferences;
DROP POLICY IF EXISTS team_client_payments_member_all ON public.client_payments;
DROP POLICY IF EXISTS team_daily_nutrition_logs_member_all ON public.daily_nutrition_logs;
DROP POLICY IF EXISTS team_nutrition_meal_logs_member_all ON public.nutrition_meal_logs;
DROP POLICY IF EXISTS team_nutrition_plans_member_all ON public.nutrition_plans;
DROP POLICY IF EXISTS team_nutrition_meals_member_all ON public.nutrition_meals;
DROP POLICY IF EXISTS team_food_items_member_all ON public.food_items;
DROP POLICY IF EXISTS team_workout_plans_member_all ON public.workout_plans;
DROP POLICY IF EXISTS team_workout_blocks_member_all ON public.workout_blocks;
DROP POLICY IF EXISTS team_workout_programs_member_all ON public.workout_programs;
DROP POLICY IF EXISTS team_nutrition_plan_templates_member_all ON public.nutrition_plan_templates;
