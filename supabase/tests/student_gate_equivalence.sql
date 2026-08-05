-- Prueba de equivalencia del archive gate (fase 0.1 del runbook RLS, 2026-08-05).
-- Compara, para CADA usuario real y CADA client_id del universo completo, el veredicto de
-- private.student_data_read_gate contra la expresion de conjunto desplegada por la fase 2.
-- Es LA red de seguridad de las policies del archive gate: la suite Playwright de RLS no corre
-- en PRs y no cubre estas tablas. Correr antes y despues de cualquier cambio a esas policies.
--
-- CRITERIO DE PASO (dos condiciones; si falla cualquiera, DETENERSE):
--   veredictos_distintos = 0        -> no cambia ningun permiso
--   positivos_no_triviales >= 150   -> la prueba no es vacua (un test todo-negativo pasa
--                                      aunque el fix cierre todos los accesos)
-- Resultado de referencia (2026-08-05): 12.408 comparaciones, 0 diferencias, 162 positivos.
--
-- Solo lectura salvo las funciones (identicas a las de produccion) y termina en ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '300s';

CREATE OR REPLACE FUNCTION private.student_self_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT c.id FROM public.clients c
   WHERE c.id = auth.uid() AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
$fn$;

CREATE OR REPLACE FUNCTION private.student_readable_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT c.id FROM public.clients c
   WHERE c.id = auth.uid() AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
  UNION
  SELECT c.id FROM public.clients c
   JOIN public.client_memberships cm ON cm.client_id = c.id
   WHERE cm.account_id = auth.uid() AND cm.deleted_at IS NULL AND cm.status = 'active'
     AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NULL AND c.team_id IS NULL AND c.coach_id = auth.uid()
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.organization_members om
      WHERE om.org_id = c.org_id AND om.user_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active' AND om.deleted_at IS NULL)
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.coach_client_assignments cca
      JOIN public.organization_members om
        ON om.org_id = cca.org_id AND om.coach_id = cca.coach_id
      WHERE cca.client_id = c.id AND cca.org_id = c.org_id AND cca.deleted_at IS NULL
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.deleted_at IS NULL)
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.team_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.teams t
      WHERE t.id = c.team_id AND t.deleted_at IS NULL AND (
        t.owner_coach_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.team_members tm
           WHERE tm.team_id = t.id AND tm.coach_id = auth.uid()
             AND tm.status = 'active' AND tm.deleted_at IS NULL)))
$fn$;

-- universo: TODAS las tablas gateadas, no solo dos
CREATE TEMP TABLE _ids(client_id uuid) ON COMMIT DROP;
INSERT INTO _ids
  SELECT DISTINCT client_id FROM public.workout_logs
  UNION SELECT DISTINCT client_id FROM public.check_ins
  UNION SELECT DISTINCT client_id FROM public.nutrition_plans
  UNION SELECT DISTINCT client_id FROM public.daily_nutrition_logs
  UNION SELECT DISTINCT client_id FROM public.workout_programs
  UNION SELECT DISTINCT client_id FROM public.workout_plans
  UNION SELECT id FROM public.clients
  UNION SELECT NULL::uuid;                    -- el caso nulo importa: el gate lo acepta

CREATE TEMP TABLE _d(uid uuid, difs bigint, trues bigint) ON COMMIT DROP;

DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN (SELECT id FROM auth.users) LOOP     -- TODOS. No "los 30 mas nuevos".
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', u::text, 'role','authenticated')::text, true);
    INSERT INTO _d
    SELECT u,
           count(*) FILTER (WHERE viejo IS DISTINCT FROM nuevo),
           count(*) FILTER (WHERE viejo)
    FROM (
      -- comparar como evalua RLS, no el booleano crudo: sin coalesce, FALSE OR NULL = NULL
      -- y el test marca ~1.041 falsos positivos
      SELECT coalesce(private.student_data_read_gate(i.client_id), false) AS viejo,
             COALESCE(
               i.client_id IS NULL
               OR i.client_id = (SELECT private.student_self_client_id())
               OR i.client_id = ANY(ARRAY(SELECT private.student_readable_client_ids()))
             , false) AS nuevo
        FROM _ids i
    ) x;
  END LOOP;
END $do$;

SELECT sum(difs)                        AS veredictos_distintos,
       count(*) FILTER (WHERE difs > 0) AS usuarios_afectados,
       sum(trues) - count(*)            AS positivos_no_triviales,
       count(*) * (SELECT count(*) FROM _ids) AS comparaciones
  FROM _d;

ROLLBACK;
