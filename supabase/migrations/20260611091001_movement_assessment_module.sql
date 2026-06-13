-- Migration — MOVEMENT ASSESSMENT MODULE (Screening de Movimiento de Ingreso).
-- Spec: specs/movida-screening/SPEC.md · Plan: specs/movida-screening/PLAN.md §Modelo de datos.
-- Modulo toggleable `movement_assessment` (MODULE_KEYS, OFF por defecto). Greenfield: 2 tablas
-- FRIAS nuevas (~2-4 filas/alumno/anio), 1 helper set-returning, RLS 3-vias (team pool /
-- standalone / alumno self read-only) + service_role.
-- Aditiva / idempotente / forward-only. NO toca tablas existentes ni hot tables.
-- Leccion 2026-06-09: via team con helper set-returning `col IN (SELECT helper())` (InitPlan,
-- jamas SECURITY DEFINER per-row). Standalone usa EXISTS correlacionado JUSTIFICADO por tabla
-- fria (mismo patron que client_consents, migr. 20260609054748) — validar con EXPLAIN ANALYZE
-- en el branch efimero igual (AC8).
-- GOTCHA default-priv (ALL incl TRUNCATE a authenticated/anon en tablas nuevas):
-- REVOKE ALL + GRANT minimo (patron exacto migr. 20260609062017_workout_section_templates).

-- (1) Tabla principal (FRIA: ~2-4 filas/alumno/anio; 300 alumnos => <1.5k filas/anio)
CREATE TABLE IF NOT EXISTS public.movement_assessments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id             uuid REFERENCES public.coaches(id) ON DELETE SET NULL,  -- evaluador original
  team_id              uuid REFERENCES public.teams(id) ON DELETE SET NULL,    -- denormalizado del client al crear
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  protocol_version     text NOT NULL DEFAULT 'v1',
  assessed_at          timestamptz NOT NULL DEFAULT now(),
  composite_score      smallint CHECK (composite_score BETWEEN 0 AND 21),
  has_pain             boolean NOT NULL DEFAULT false,
  has_asymmetry        boolean NOT NULL DEFAULT false,
  risk_band            text CHECK (risk_band IN ('low','moderate','high')),
  consent_confirmed_at timestamptz,  -- finalize lo estampa SIEMPRE (team y standalone; AC7) — el CHECK de abajo lo exige para 'final'
  notes                text,
  last_edited_by       uuid REFERENCES public.coaches(id) ON DELETE SET NULL,  -- awareness LOCKED #4 (seteado en service, NO trigger)
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movement_assessments_final_complete CHECK (
    status <> 'final'
    OR (composite_score IS NOT NULL AND risk_band IS NOT NULL AND consent_confirmed_at IS NOT NULL)
  )
);
COMMENT ON TABLE public.movement_assessments IS
  'Screening de Movimiento de Ingreso (modulo movement_assessment, specs/movida-screening). Protocolo clean-room v1 de 7 patrones, compuesto /21, banda de prioridad de trabajo correctivo. Final inmutable (corregir = delete + re-evaluar). Datos de salud: consentimiento obligatorio (AC7) + bitacora team_access_logs (AC9).';
COMMENT ON COLUMN public.movement_assessments.risk_band IS
  'Banda de prioridad de trabajo correctivo (copy visible = "prioridad", NUNCA "riesgo de lesion" — AC5). high: pain || composite <= 14; moderate: 15-16 || asimetria; low: >= 17 sin banderas.';
COMMENT ON COLUMN public.movement_assessments.consent_confirmed_at IS
  'Timestamp de verificacion del consentimiento health_data_processing (team) o de la atestacion del coach (standalone). NOT NULL obligatorio para status=final (CHECK movement_assessments_final_complete).';

-- 1 borrador por alumno (los finales son N)
CREATE UNIQUE INDEX IF NOT EXISTS movement_assessments_one_draft_per_client
  ON public.movement_assessments (client_id) WHERE status = 'draft';
-- Indices: FK client_id cubierta por el compuesto (client_id primero); resto de FKs explicitas
CREATE INDEX IF NOT EXISTS idx_movement_assessments_client_assessed
  ON public.movement_assessments (client_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_movement_assessments_team_id ON public.movement_assessments (team_id);
CREATE INDEX IF NOT EXISTS idx_movement_assessments_coach_id ON public.movement_assessments (coach_id);
-- last_edited_by tambien es FK nueva -> indexada (regla: indices en TODAS las FKs nuevas;
-- el plan no la listaba — ajuste objetivo para advisor unindexed_foreign_keys)
CREATE INDEX IF NOT EXISTS idx_movement_assessments_last_edited_by
  ON public.movement_assessments (last_edited_by);

-- (2) Items (7 por evaluacion; catalogo de patrones hardcodeado en packages/calc — YAGNI tabla)
CREATE TABLE IF NOT EXISTS public.movement_assessment_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id     uuid NOT NULL REFERENCES public.movement_assessments(id) ON DELETE CASCADE,
  pattern           text NOT NULL CHECK (pattern IN (
                      'deep_squat','hurdle_step','inline_lunge','shoulder_mobility',
                      'active_straight_leg_raise','trunk_stability_pushup','rotary_stability')),
  is_per_side       boolean NOT NULL,
  score_left        smallint CHECK (score_left  BETWEEN 0 AND 3),
  score_right       smallint CHECK (score_right BETWEEN 0 AND 3),
  score_single      smallint CHECK (score_single BETWEEN 0 AND 3),
  final_score       smallint NOT NULL CHECK (final_score BETWEEN 0 AND 3),
  pain              boolean NOT NULL DEFAULT false,
  clearing_positive boolean,            -- NULL = el patron no tiene prueba de descarte
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT movement_assessment_items_unique UNIQUE (assessment_id, pattern)
);
COMMENT ON TABLE public.movement_assessment_items IS
  'Items del screening (1 por patron, max 7; protocol_version v1). final_score = (clearing_positive || pain) ? 0 : (is_per_side ? min(L,R) : single) — recalculado SIEMPRE en server via packages/calc (specs/movida-screening AC1/AC2).';
CREATE INDEX IF NOT EXISTS idx_movement_assessment_items_assessment
  ON public.movement_assessment_items (assessment_id);

-- (3) updated_at via trigger existente (public.handle_updated_at, baseline)
DROP TRIGGER IF EXISTS handle_updated_at ON public.movement_assessments;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.movement_assessments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS handle_updated_at ON public.movement_assessment_items;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.movement_assessment_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- (4) GOTCHA repo: ALTER DEFAULT PRIVILEGES otorga ALL (incl. TRUNCATE) a toda tabla nueva
--     -> REVOKE + GRANT minimo (patron migr. 20260609054748 / 20260609062017)
REVOKE ALL ON public.movement_assessments      FROM anon, authenticated;
REVOKE ALL ON public.movement_assessment_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_assessments      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movement_assessment_items TO authenticated;
GRANT ALL ON public.movement_assessments      TO service_role;
GRANT ALL ON public.movement_assessment_items TO service_role;
ALTER TABLE public.movement_assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_assessment_items ENABLE ROW LEVEL SECURITY;

-- (5) Helper set-returning para los items del pool (patron 20260609160000; SIN parametro de
--     fila => el planner lo evalua UNA vez por query: InitPlan / hashed SubPlan)
CREATE OR REPLACE FUNCTION public.current_user_pool_movement_assessment_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ma.id FROM public.movement_assessments ma
  WHERE ma.client_id IN (SELECT public.current_user_pool_client_ids())
$$;
REVOKE EXECUTE ON FUNCTION public.current_user_pool_movement_assessment_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_pool_movement_assessment_ids() TO authenticated, service_role;

-- (6) Policies RLS (3 vias + self + service) — specs/movida-screening AC8

-- TEAM (pool plano full-access): InitPlan via helper, jamas per-row
DROP POLICY IF EXISTS team_movement_assessments_member_all ON public.movement_assessments;
CREATE POLICY team_movement_assessments_member_all ON public.movement_assessments FOR ALL TO authenticated
  USING (client_id IN (SELECT public.current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT public.current_user_pool_client_ids()));

DROP POLICY IF EXISTS team_movement_assessment_items_member_all ON public.movement_assessment_items;
CREATE POLICY team_movement_assessment_items_member_all ON public.movement_assessment_items FOR ALL TO authenticated
  USING (assessment_id IN (SELECT public.current_user_pool_movement_assessment_ids()))
  WITH CHECK (assessment_id IN (SELECT public.current_user_pool_movement_assessment_ids()));

-- STANDALONE (coach dueno; tabla fria -> patron client_consents con EXISTS justificado;
-- validar con EXPLAIN ANALYZE igual en el branch efimero)
DROP POLICY IF EXISTS movement_assessments_standalone_coach_all ON public.movement_assessments;
CREATE POLICY movement_assessments_standalone_coach_all ON public.movement_assessments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = movement_assessments.client_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = movement_assessments.client_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL));

DROP POLICY IF EXISTS movement_assessment_items_standalone_coach_all ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_standalone_coach_all ON public.movement_assessment_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.movement_assessments ma JOIN public.clients c ON c.id = ma.client_id
                 WHERE ma.id = movement_assessment_items.assessment_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL))
  WITH CHECK (EXISTS (SELECT 1 FROM public.movement_assessments ma JOIN public.clients c ON c.id = ma.client_id
                 WHERE ma.id = movement_assessment_items.assessment_id
                 AND c.coach_id = (SELECT auth.uid()) AND c.org_id IS NULL AND c.team_id IS NULL));

-- ALUMNO: solo SELECT de las propias y FINALES (cubre cuenta legacy id=auth.uid y split memberships)
DROP POLICY IF EXISTS movement_assessments_client_self_select ON public.movement_assessments;
CREATE POLICY movement_assessments_client_self_select ON public.movement_assessments FOR SELECT TO authenticated
  USING (status = 'final' AND (
    client_id = (SELECT auth.uid())
    OR client_id IN (SELECT cm.client_id FROM public.client_memberships cm
                     WHERE cm.account_id = (SELECT auth.uid()) AND cm.status = 'active' AND cm.deleted_at IS NULL)));

DROP POLICY IF EXISTS movement_assessment_items_client_self_select ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_client_self_select ON public.movement_assessment_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.movement_assessments ma
                 WHERE ma.id = movement_assessment_items.assessment_id AND ma.status = 'final'
                 AND (ma.client_id = (SELECT auth.uid())
                      OR ma.client_id IN (SELECT cm.client_id FROM public.client_memberships cm
                          WHERE cm.account_id = (SELECT auth.uid()) AND cm.status = 'active' AND cm.deleted_at IS NULL))));

-- service_role total (purge, soporte)
DROP POLICY IF EXISTS movement_assessments_service ON public.movement_assessments;
CREATE POLICY movement_assessments_service ON public.movement_assessments FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
DROP POLICY IF EXISTS movement_assessment_items_service ON public.movement_assessment_items;
CREATE POLICY movement_assessment_items_service ON public.movement_assessment_items FOR ALL TO service_role
  USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
