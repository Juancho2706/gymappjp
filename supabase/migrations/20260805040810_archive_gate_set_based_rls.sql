-- Fase 2 del runbook de correccion RLS (2026-08-05): convertir el gate escalar por-fila
-- (private.student_data_read_gate, evaluado 1 vez POR FILA por ser SECURITY DEFINER no
-- inlineable) en un conjunto evaluado UNA vez por consulta via = ANY(ARRAY(SELECT ...)).
--
-- Evidencia (todo medido contra LIVE, tx+ROLLBACK, antes de aplicar):
--   Equivalencia: 12.408 comparaciones (141 usuarios x 88 ids), 0 diferencias,
--     162 positivos no triviales + fixture de organizacion 8/8 (ramas org sin datos reales).
--   Rendimiento: coach dashboard 30d 11.278ms -> 11,7ms; alumno 7d 2,987ms -> 1,49ms
--     (InitPlan del conjunto "never executed" en el camino del alumno: corto-circuito por PK).
--
-- NO se borra private.student_data_read_gate: las 13 policies derivadas (wrappers _for_*)
-- la siguen usando y es la referencia de supabase/tests/student_gate_equivalence.sql.
--
-- FRAGILIDAD DOCUMENTADA: esto depende de que public.clients NO tenga
-- FORCE ROW LEVEL SECURITY. El owner (postgres) de las funciones SECURITY DEFINER
-- bypassea RLS solo por eso; si alguien lo activa, vuelve la recursion 42P17.
--
-- INVARIANTE PERMANENTE: ninguna policy de clients puede contener una subconsulta
-- a public.clients (42P17 en UPDATE/DELETE). Chequeo:
--   SELECT c.relname, p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--    WHERE c.relname = 'clients'
--      AND (coalesce(pg_get_expr(p.polqual,p.polrelid),'')
--           || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) LIKE '%FROM public.clients%';
--   -- debe dar 0 filas.
--
-- Reversion completa: supabase/tests/archive_gate_set_based_rollback.sql

SET LOCAL lock_timeout = '2s';

-- 2.1: las dos funciones
CREATE OR REPLACE FUNCTION private.student_self_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT c.id FROM public.clients c
   WHERE c.id = auth.uid() AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
$fn$;

CREATE OR REPLACE FUNCTION private.student_readable_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' ROWS 30 AS $fn$
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

REVOKE ALL ON FUNCTION private.student_self_client_id()      FROM PUBLIC;
REVOKE ALL ON FUNCTION private.student_readable_client_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.student_self_client_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_readable_client_ids() TO authenticated;

COMMENT ON FUNCTION private.student_self_client_id() IS
  'Corto-circuito del archive gate: id del propio alumno activo, sin RLS (SECURITY DEFINER). Depende de que clients NO tenga FORCE ROW LEVEL SECURITY; si se activa, recursion 42P17.';
COMMENT ON FUNCTION private.student_readable_client_ids() IS
  'Conjunto de client_ids legibles por auth.uid() (6 ramas UNION, equivalente a student_data_read_gate). Se evalua 1 vez por query via = ANY(ARRAY(SELECT ...)). ROWS 30 para el planner. Techo ~10K ids.';

-- 2.2: las 25 policies directas, USING y WITH CHECK juntos, EXCLUYENDO clients
DO $$
DECLARE r record; col text; n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, p.polname,
           pg_get_expr(p.polqual, p.polrelid) AS expr,
           p.polwithcheck IS NOT NULL AS tiene_check
      FROM pg_policy p
      JOIN pg_class c      ON c.oid  = p.polrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE pg_get_expr(p.polqual, p.polrelid)
           ~ '^private\.student_data_read_gate\(\w+\)$'
       AND ns.nspname = 'public'
       AND c.relname <> 'clients'   -- sin esto: 42P17 en UPDATE y DELETE de clients
  LOOP
    col := (regexp_match(r.expr, '^private\.student_data_read_gate\((\w+)\)$'))[1];
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (COALESCE('
      || '  %I IS NULL'
      || '  OR %I = (SELECT private.student_self_client_id())'
      || '  OR %I = ANY(ARRAY(SELECT private.student_readable_client_ids()))'
      || ', false))'
      || CASE WHEN r.tiene_check THEN format(
           ' WITH CHECK (COALESCE(%I IS NULL'
           || '   OR %I = (SELECT private.student_self_client_id())'
           || '   OR %I = ANY(ARRAY(SELECT private.student_readable_client_ids())), false))',
           col, col, col) ELSE '' END,
      r.polname, r.tbl, col, col, col);
    n := n + 1;
  END LOOP;
  IF n <> 25 THEN
    RAISE EXCEPTION 'esperaba 25 policies, reescribi % -- el inventario cambio, revisar', n;
  END IF;
END $$;

-- 2.3: las tres policies de clients, a mano. NINGUNA contiene subconsulta a clients.
-- El termino coach_id = auth.uid() del SELECT es mas amplio que el gate y se preserva
-- textual: es lo que deja al coach ver a sus alumnos archivados.
ALTER POLICY archive_gate_clients_select ON public.clients
  USING (id = (SELECT auth.uid())
         OR coach_id = (SELECT auth.uid())
         OR id = ANY(ARRAY(SELECT private.student_readable_client_ids())));

ALTER POLICY archive_gate_clients_update ON public.clients
  USING      (id = (SELECT private.student_self_client_id())
              OR id = ANY(ARRAY(SELECT private.student_readable_client_ids())))
  WITH CHECK (id = (SELECT private.student_self_client_id())
              OR id = ANY(ARRAY(SELECT private.student_readable_client_ids())));

ALTER POLICY archive_gate_clients_delete ON public.clients
  USING (id = (SELECT private.student_self_client_id())
         OR id = ANY(ARRAY(SELECT private.student_readable_client_ids())));
