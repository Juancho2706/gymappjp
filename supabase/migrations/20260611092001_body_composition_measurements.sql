-- Migration — BODY COMPOSITION MEASUREMENTS (composicion corporal dual BIA + ISAK 5C). Fase EXPAND.
-- Spec: specs/movida-bodycomp/SPEC.md · Plan: specs/movida-bodycomp/PLAN.md (DDL transcrita del PLAN, review adversarial OK).
-- Modulo (entitlement): body_composition. Tabla UNICA con discriminador `method` ('bia'|'isak');
-- payload por metodo en jsonb validado por Zod server-side (packages/schemas/bodycomp.ts). NO toca check_ins (el peso sigue ahi).
-- Aditiva / idempotente / forward-only (merge_branch re-ejecuta TODO el historial). Soft-delete via deleted_at (patron wst_*).
-- Aislamiento validado en gate: tests/team/bodycomp-isolation.sql.

CREATE TABLE IF NOT EXISTS public.body_composition_measurements (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coach_id               uuid REFERENCES public.coaches(id) ON DELETE SET NULL,        -- actor/dueno del registro
  team_id                uuid REFERENCES public.teams(id) ON DELETE SET NULL,          -- pool (NULL = standalone)
  org_id                 uuid REFERENCES public.organizations(id) ON DELETE SET NULL,  -- enterprise-aware (NULL hoy; sin rama org en RLS v1, ver PLAN "Decision v1")
  method                 text NOT NULL CHECK (method IN ('bia','isak')),
  measured_at            timestamptz NOT NULL DEFAULT now(),
  weight_kg              numeric(6,2),
  height_cm              numeric(6,2),
  device_brand           text,
  device_model           text,
  equation_used          text,             -- ISAK: 'kerr+heath_carter+durnin_womersley' etc.
  metrics                jsonb NOT NULL DEFAULT '{}'::jsonb,   -- derivados (ISAK) o capturados (BIA), Zod-validados
  raw_input              jsonb NOT NULL DEFAULT '{}'::jsonb,   -- pliegues/perimetros/diametros/segmental crudos
  measurement_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,   -- BIA: ayuno/hidratacion/hora
  source                 text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv_import','api')),
  is_validated           boolean NOT NULL DEFAULT false,       -- calculo ISAK validado vs ficha real (SPEC AC7: label "preliminar" mientras false)
  consent_confirmed_at   timestamptz,
  notes                  text,
  created_by             uuid,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz                            -- soft-delete (patron wst_*); exclusion en lecturas = capa app (repository)
);

-- Indices: TODAS las FKs nuevas indexadas (client_id cubierto como columna lider del compuesto).
CREATE INDEX IF NOT EXISTS idx_bcm_client_method_measured
  ON public.body_composition_measurements (client_id, method, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_bcm_team   ON public.body_composition_measurements (team_id);
CREATE INDEX IF NOT EXISTS idx_bcm_coach  ON public.body_composition_measurements (coach_id);
-- org_id siempre NULL en v1 (rama enterprise diferida) -> indice parcial para no almacenar entradas vacias
CREATE INDEX IF NOT EXISTS idx_bcm_org    ON public.body_composition_measurements (org_id) WHERE org_id IS NOT NULL;

-- updated_at via trigger existente (convencion del repo; mismo patron que screening/baseline)
DROP TRIGGER IF EXISTS handle_updated_at ON public.body_composition_measurements;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.body_composition_measurements
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- GOTCHA repo (bitacora 2026-06-09, migr. 20260609054917 team_tables_harden_grants):
-- el ALTER DEFAULT PRIVILEGES del proyecto otorga ALL (incl. TRUNCATE, que RLS NO filtra) a
-- anon/authenticated en TODA tabla nueva. Esta es una tabla de DATOS DE SALUD -> REVOKE + GRANT minimo.
-- SIN DELETE para authenticated: el borrado es SOFT (UPDATE de deleted_at); el hard-delete solo via service_role.
REVOKE ALL ON public.body_composition_measurements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.body_composition_measurements TO authenticated;  -- sin DELETE
GRANT ALL                    ON public.body_composition_measurements TO service_role;

ALTER TABLE public.body_composition_measurements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS (regla dura del incidente 2026-06-09 — set-returning, sin per-row):
-- * Solo helpers set-returning STABLE YA existentes en prod (current_user_pool_client_ids(),
--   migr. 20260609160000) como `col IN (SELECT helper())` (InitPlan, 1 eval por query).
-- * (select auth.uid()) envuelto (no auth.uid() per-row).
-- * PROHIBIDO is_team_member(<col fila>) o EXISTS correlacionado en el USING de SELECT (hot table).
-- * El EXISTS sobre clients aparece SOLO en WITH CHECK de INSERT/UPDATE (patron hardening
--   20260609180000 / team_access_logs_member_insert): amarra client_id/team_id al scope del actor
--   (se evalua por fila ESCRITA, no por fila leida) — sin esto un coach podria estampar una medicion
--   de salud sobre un client_id ajeno o falsear team_id.
-- * Sin rama org en v1: el helper org no existe y la pertenencia plana violaria el modelo enterprise
--   1 coach<->alumno (coach_client_assignments). Invariante v1 (forzado por RLS, no solo convencion):
--   NINGUNA via authenticated puede producir filas con org_id IS NOT NULL — AMBAS ramas (pool y
--   standalone) de los WITH CHECK de INSERT/UPDATE exigen org_id IS NULL. Solo service_role podria
--   escribir org_id; asi la futura policy enterprise org se agrega sin riesgo de exponer filas de salud
--   forjadas con org_id ajeno. Ver PLAN §RLS "Decision v1 — sin rama enterprise (org)".
-- * Sin policy ni grant DELETE para authenticated: borrado de negocio = SOFT (UPDATE deleted_at,
--   cubierto por bcm_update); hard-delete (purga/soporte) = service_role (bcm_service).
-- ============================================================================

-- SELECT: pool (cualquier miembro del team del cliente) ∪ standalone (dueno del registro). (select auth.uid()) envuelto.
DROP POLICY IF EXISTS bcm_select ON public.body_composition_measurements;
CREATE POLICY bcm_select ON public.body_composition_measurements FOR SELECT TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())                  -- pool: helper set-returning (InitPlan)
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))    -- standalone: dueno, columna indexada
);

-- INSERT: WITH CHECK amarra client_id/team_id al scope, coach_id al actor (self-atribucion) y org_id IS NULL
-- (EXISTS sobre clients SOLO en WITH CHECK — patron hardening).
DROP POLICY IF EXISTS bcm_insert ON public.body_composition_measurements;
CREATE POLICY bcm_insert ON public.body_composition_measurements FOR INSERT TO authenticated
WITH CHECK (
  -- pool: el cliente es del pool del coach, el team_id estampado = team real del cliente (no se puede falsear),
  -- org_id IS NULL (invariante v1: la FK validaria CUALQUIER organizations.id sin necesitar SELECT) y
  -- coach_id = actor (dato de salud Ley 21.719: la autoria no es spoofeable, ni siquiera dentro del pool)
  (
    team_id IS NOT NULL
    AND org_id IS NULL
    AND coach_id = (select auth.uid())
    AND client_id IN (SELECT public.current_user_pool_client_ids())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.team_id = body_composition_measurements.team_id)
  )
  OR
  -- standalone: registro self-attribuido Y el cliente es del coach (sin team/org)
  (
    team_id IS NULL AND org_id IS NULL
    AND coach_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.coach_id = (select auth.uid())
                 AND c.team_id IS NULL AND c.org_id IS NULL)
  )
);

-- UPDATE: cubre edicion y soft-delete (set deleted_at). USING = scope visible; WITH CHECK = mismo amarre que
-- INSERT salvo coach_id en la rama pool: pool full-access — cualquier miembro edita/soft-deletea filas del pool
-- sin re-atribuirse la autoria (amarrar coach_id aqui romperia ese modelo). org_id IS NULL SI se exige tambien
-- en UPDATE: nadie puede "migrar" una fila existente a una org via update.
DROP POLICY IF EXISTS bcm_update ON public.body_composition_measurements;
CREATE POLICY bcm_update ON public.body_composition_measurements FOR UPDATE TO authenticated
USING (
  client_id IN (SELECT public.current_user_pool_client_ids())
  OR (team_id IS NULL AND org_id IS NULL AND coach_id = (select auth.uid()))
)
WITH CHECK (
  (
    team_id IS NOT NULL
    AND org_id IS NULL
    AND client_id IN (SELECT public.current_user_pool_client_ids())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.team_id = body_composition_measurements.team_id)
  )
  OR (
    team_id IS NULL AND org_id IS NULL
    AND coach_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.clients c
               WHERE c.id = body_composition_measurements.client_id
                 AND c.coach_id = (select auth.uid())
                 AND c.team_id IS NULL AND c.org_id IS NULL)
  )
);

-- service_role total (purge, soporte, hard-delete). authenticated NO tiene DELETE (grant ni policy).
DROP POLICY IF EXISTS bcm_service ON public.body_composition_measurements;
CREATE POLICY bcm_service ON public.body_composition_measurements FOR ALL TO service_role
  USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

COMMENT ON TABLE public.body_composition_measurements IS
  'Mediciones de composicion corporal (datos de salud, Ley 21.719). method=bia (captura de dispositivo) | isak (crudos en raw_input, derivados Kerr/Heath-Carter/%grasa en metrics). Soft-delete via deleted_at (hard-delete solo service_role). Spec: specs/movida-bodycomp/.';
