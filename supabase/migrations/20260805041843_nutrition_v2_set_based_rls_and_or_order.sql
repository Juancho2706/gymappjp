-- Fase 3 del runbook de correccion RLS (2026-08-05): nutricion v2 sin RLS por-fila.
-- Convierte en conjuntos (InitPlan, 1 eval/query):
--   1. El wrapper RESTRICTIVE student_data_read_gate_for_nutrition_v2_version (4 tablas).
--   2. Las PERMISSIVE nutrition_v2_can_read_version / can_edit_version (5 tablas)
--      -- el ensayo en tx demostro que el wrapper solo no bastaba: las permissive eran
--      el costo dominante (items seguia en 217ms tras convertir solo la restrictive).
--   3. Invierte el OR de nutrition_plans_v2_select (rama barata del alumno primero;
--      conmutativo, logicamente identico).
--
-- Equivalencia probada en tx+ROLLBACK contra LIVE (141 usuarios x 79 version_ids):
--   archive-set: 11.139 comparaciones, 0 difs, 153 positivos
--   read-set:    11.139 comparaciones, 0 difs, 152 positivos
--   edit-set:    11.139 comparaciones, 0 difs, 1 positivo (fixture draft tx-local;
--                al aplicar habia 0 drafts reales: 56 published + 22 superseded)
-- Rendimiento medido (RLS activa): items alumno 254->9,8ms; slots 59,5->5,0ms;
--   plan 1 fila 8,4->0,24ms; items coach 576->5,0ms.
--
-- NO se tocan: nutrition_plan_versions_v2 (78 filas, lecturas por PK, costo negligible),
--   las policies *_service, ni las funciones escalares originales (referencia de
--   supabase/tests/nutrition_v2_sets_equivalence.sql).
-- Semantica preservada: read = manage OR (self-activo AND status published/superseded);
--   edit = draft AND manage; client_id NULL (plantillas) NO legible via estas permissive
--   (igual que hoy: el server las lee con service_role); manage NO filtra is_archived.
-- Techo: el conjunto de versiones crece con el historial (hoy 78 total, max 35 por coach);
--   si supera unos miles, desnormalizar client_id en las tablas de detalle.
-- Reversion completa: supabase/tests/nutrition_v2_set_based_rollback.sql

SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE FUNCTION private.student_readable_nutrition_v2_version_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' ROWS 40 AS $fn$
  SELECT v.id
    FROM public.nutrition_plan_versions_v2 v
    JOIN public.nutrition_plans_v2 p ON p.id = v.plan_id
   WHERE p.client_id IS NULL
      OR p.client_id = (SELECT private.student_self_client_id())
      OR p.client_id = ANY(ARRAY(SELECT private.student_readable_client_ids()))
$fn$;

CREATE OR REPLACE FUNCTION private.nutrition_v2_manageable_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' ROWS 30 AS $fn$
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

CREATE OR REPLACE FUNCTION private.nutrition_v2_readable_version_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' ROWS 40 AS $fn$
  SELECT v.id
    FROM public.nutrition_plan_versions_v2 v
    JOIN public.nutrition_plans_v2 p ON p.id = v.plan_id
   WHERE (v.status IN ('published','superseded')
          AND p.client_id = (SELECT private.student_self_client_id()))
      OR p.client_id = ANY(ARRAY(SELECT private.nutrition_v2_manageable_client_ids()))
$fn$;

CREATE OR REPLACE FUNCTION private.nutrition_v2_editable_version_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' ROWS 20 AS $fn$
  SELECT v.id
    FROM public.nutrition_plan_versions_v2 v
    JOIN public.nutrition_plans_v2 p ON p.id = v.plan_id
   WHERE v.status = 'draft'
     AND p.client_id = ANY(ARRAY(SELECT private.nutrition_v2_manageable_client_ids()))
$fn$;

REVOKE ALL ON FUNCTION private.student_readable_nutrition_v2_version_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.nutrition_v2_manageable_client_ids()        FROM PUBLIC;
REVOKE ALL ON FUNCTION private.nutrition_v2_readable_version_ids()         FROM PUBLIC;
REVOKE ALL ON FUNCTION private.nutrition_v2_editable_version_ids()         FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.student_readable_nutrition_v2_version_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION private.nutrition_v2_manageable_client_ids()        TO authenticated;
GRANT EXECUTE ON FUNCTION private.nutrition_v2_readable_version_ids()         TO authenticated;
GRANT EXECUTE ON FUNCTION private.nutrition_v2_editable_version_ids()         TO authenticated;

COMMENT ON FUNCTION private.nutrition_v2_manageable_client_ids() IS
  'Conjunto de client_ids gestionables (4 ramas de nutrition_v2_can_manage_client). Sin filtro is_archived (coach ve archivados). 1 eval/query via = ANY(ARRAY(SELECT ...)).';
COMMENT ON FUNCTION private.nutrition_v2_readable_version_ids() IS
  'Versiones v2 legibles: manage OR (self-activo AND published/superseded). Equivale a nutrition_v2_can_read_version. Plantillas (client_id NULL) excluidas, igual que la funcion original.';
COMMENT ON FUNCTION private.nutrition_v2_editable_version_ids() IS
  'Versiones v2 editables: status draft AND manage. Equivale a nutrition_v2_can_edit_version.';
COMMENT ON FUNCTION private.student_readable_nutrition_v2_version_ids() IS
  'Versiones v2 que pasan el archive gate (client NULL = plantilla legible, self activo, o conjunto legible). Equivale a student_data_read_gate_for_nutrition_v2_version.';

-- permissive de las 5 tablas de detalle
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nutrition_prescription_items_v2','nutrition_meal_slots_v2','nutrition_day_variants_v2','nutrition_item_substitutions_v2','nutrition_slot_exchange_targets_v2'] LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (version_id = ANY(ARRAY(SELECT private.nutrition_v2_readable_version_ids())))', t || '_select', t);
    EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (version_id = ANY(ARRAY(SELECT private.nutrition_v2_editable_version_ids())))', t || '_insert', t);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (version_id = ANY(ARRAY(SELECT private.nutrition_v2_editable_version_ids()))) WITH CHECK (version_id = ANY(ARRAY(SELECT private.nutrition_v2_editable_version_ids())))', t || '_update', t);
    EXECUTE format('ALTER POLICY %I ON public.%I USING (version_id = ANY(ARRAY(SELECT private.nutrition_v2_editable_version_ids())))', t || '_delete', t);
  END LOOP;
END $$;

-- restrictive archive gate de las 4 tablas que lo tienen
ALTER POLICY archive_gate_nutrition_v2_items ON public.nutrition_prescription_items_v2
  USING (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false))
  WITH CHECK (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false));
ALTER POLICY archive_gate_nutrition_v2_slots ON public.nutrition_meal_slots_v2
  USING (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false))
  WITH CHECK (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false));
ALTER POLICY archive_gate_nutrition_v2_variants ON public.nutrition_day_variants_v2
  USING (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false))
  WITH CHECK (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false));
ALTER POLICY archive_gate_nutrition_v2_subs ON public.nutrition_item_substitutions_v2
  USING (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false))
  WITH CHECK (COALESCE(version_id = ANY(ARRAY(SELECT private.student_readable_nutrition_v2_version_ids())), false));

-- OR invertido: rama barata del alumno primero (conmutativo, logicamente identico)
ALTER POLICY nutrition_plans_v2_select ON public.nutrition_plans_v2
  USING (((auth.uid() = client_id) AND (current_published_version_id IS NOT NULL))
         OR private.nutrition_v2_can_manage_client(client_id));
