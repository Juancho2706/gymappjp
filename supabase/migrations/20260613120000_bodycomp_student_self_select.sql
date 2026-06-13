-- Migration — BODY COMPOSITION: rama de SELECT del ALUMNO (vista read-only del titular del dato).
-- ⚠️ NO APLICAR AUTOMATICAMENTE: esta migracion toca una policy de SEGURIDAD de una tabla de
--    DATOS DE SALUD (Ley 21.719). Va con dry-run + test tx-rollback del dueno ANTES del merge
--    (read-own ✓, read-others = 0 filas, INSERT/UPDATE del alumno FALLA). Modelo del test:
--    tests/team/bodycomp-isolation.sql.
--
-- Que cambia: la policy `bcm_select` hoy cubre dos ramas — pool (cualquier miembro del team del
-- cliente) ∪ standalone (dueno del registro). Falta la rama del ALUMNO: que el propio alumno lea
-- SUS mediciones (identidad legacy clients.id = auth.uid(), mismo criterio que dashboard/check-in
-- y la vista de movimiento del alumno, migr. movement self-select).
--
-- Solo SELECT cambia. Las policies de escritura (bcm_insert/bcm_update, ambas coach-shaped:
-- coach_id = (select auth.uid()) o pool) quedan INTACTAS — el alumno NO matchea ninguna rama de
-- escritura, asi que la vista es read-only A NIVEL DB (no depende de la app).
--
-- Aditiva / idempotente / forward-only (merge_branch re-ejecuta TODO el historial): DROP ... IF
-- EXISTS + CREATE re-define la policy completa con las 3 ramas. (select auth.uid()) envuelto =
-- InitPlan (regla dura del incidente 2026-06-09: sin per-row, sin EXISTS correlacionado en el
-- USING de SELECT de una tabla hot). client_id esta indexado (idx_bcm_client_method_measured,
-- columna lider). El repo ya filtra deleted_at IS NULL en las lecturas de negocio.

DROP POLICY IF EXISTS bcm_select ON public.body_composition_measurements;
CREATE POLICY bcm_select ON public.body_composition_measurements FOR SELECT TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())                  -- pool: helper set-returning (InitPlan)
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))    -- standalone: dueno del registro
  OR client_id = (select auth.uid())                                           -- NEW: el alumno lee SUS propias mediciones (titular del dato)
);

COMMENT ON POLICY bcm_select ON public.body_composition_measurements IS
  'SELECT: pool (miembro del team del cliente) ∪ standalone (dueno del registro) ∪ alumno (client_id = auth.uid(), vista read-only del titular, Ley 21.719). Escritura sigue coach-shaped (bcm_insert/bcm_update): el alumno NO puede escribir.';
