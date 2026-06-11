-- Migration — NUTRICION POR INTERCAMBIOS (modulo `nutrition_exchanges`). Fase EXPAND.
-- Spec: specs/movida-intercambios/SPEC.md · Plan: specs/movida-intercambios/PLAN.md §Modelo de datos
-- (DDL transcrita del PLAN, ya pasada por review adversarial). Seed aparte:
-- _POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql. Tests: tests/team/exchanges-isolation.sql.
--
-- Aditiva / idempotente / forward-only: cero DROP/rename de columnas existentes; `merge_branch`
-- re-ejecuta TODO el historial. `plan_mode` default 'grams' deja todo plan/template existente
-- byte-identical (AC1). `food_swap_groups` NO se toca (frontera documentada en el PLAN).
--
-- GOTCHA default-priv del repo (bitacora M3 + 20260609054917_team_tables_harden_grants.sql):
-- el ALTER DEFAULT PRIVILEGES del baseline otorga ALL — incluido TRUNCATE, que RLS NO filtra —
-- a anon y authenticated sobre TODA tabla nueva => bloque REVOKE/GRANT minimo obligatorio
-- (patron canonico: 20260609062017_workout_section_templates.sql).
--
-- RLS (leccion incidente 2026-06-09): helpers set-returning STABLE SECURITY DEFINER sin parametro
-- de fila usados como `col IN (SELECT helper())`; `(select auth.uid())` siempre (InitPlan);
-- PROHIBIDO SECURITY DEFINER per-row y EXISTS correlacionado (la forma de food_items en baseline
-- NO se copia). Helpers reusados (ya en prod): current_user_team_ids(),
-- current_user_managed_team_ids(), current_user_pool_meal_ids(),
-- current_user_pool_nutrition_plan_ids() (migraciones 20260609160000 / 20260609170000).
--
-- OWNERSHIP de nutrition_plan_templates (DECISION para F7 — documentada aqui y en
-- specs/movida-intercambios/PLAN.md §RLS para que F7 no se estrelle con un check_violation):
-- coach_id = AUTOR SIEMPRE y team_id es solo MARCADOR de scope para la libreria 3-vias de F7
-- (mio / team / org). NO existe ownership puro por team (coach_id NULL + team_id NOT NULL):
-- el pool comparte POR AUTOR (team_nutrition_plan_templates_member_all, 20260609160000 —
-- coach_id IN current_user_pool_coach_ids) y el CHECK chk_nutrition_template_owner
-- (20260601000100: coach_id IS NOT NULL OR org_id IS NOT NULL) queda INTACTO y sigue correcto.
-- F7 JAMAS debe insertar templates con coach_id NULL + team_id NOT NULL.
-- Guard de tenant sobre team_id: policies RESTRICTIVE npt_team_id_guard /
-- npt_team_id_guard_upd (seccion 7) — sin ellas, las permissive vigentes (que no miran
-- team_id) permitirian forjar team_id de un team ajeno.

-- ============ 1) Catalogo de grupos de intercambio ============
-- Ownership calcado de workout_section_templates: system + custom por coach o por team,
-- soft-delete, slugs unicos parciales entre filas vivas. SPEC §Alcance: 8 grupos system
-- (C, P, F, V, LAC, ARL, SP, G) + compuesto LEG via composed_of (el seed los crea).
CREATE TABLE IF NOT EXISTS public.exchange_groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  code             text NOT NULL,        -- 'C','P','F','V','LAC','ARL','SP','G','LEG' (render del chip)
  name             text NOT NULL,        -- 'Carbohidratos/Cereales', 'Proteinas (bajo grasa)', ...
  coach_id         uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  team_id          uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  is_system        boolean NOT NULL DEFAULT false,
  ref_calories     numeric NOT NULL DEFAULT 0 CHECK (ref_calories >= 0),
  ref_protein_g    numeric NOT NULL DEFAULT 0 CHECK (ref_protein_g >= 0),
  ref_carbs_g      numeric NOT NULL DEFAULT 0 CHECK (ref_carbs_g >= 0),
  ref_fats_g       numeric NOT NULL DEFAULT 0 CHECK (ref_fats_g >= 0),
  color            text,                 -- hex del badge; NULL = paleta derivada por sort_order
  sort_order       integer NOT NULL DEFAULT 100,
  composed_of      jsonb,                -- grupo compuesto: [{"code":"P","portions":1},{"code":"C","portions":1}]
  macros_confirmed boolean NOT NULL DEFAULT false,  -- false hasta validar ref_* con Fran (badge "referencial", AC3)
  deleted_at       timestamptz,          -- soft-delete (patron workout_section_templates)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_groups_owner_chk CHECK (
    (is_system AND coach_id IS NULL AND team_id IS NULL)
    OR (NOT is_system AND ((coach_id IS NULL) <> (team_id IS NULL)))
  )
);
-- UNIQUE parciales: unicidad solo entre filas vivas (slug reusable tras soft-delete)
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_system_slug_uq
  ON public.exchange_groups (slug) WHERE is_system AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_coach_slug_uq
  ON public.exchange_groups (coach_id, slug) WHERE coach_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exchange_groups_team_slug_uq
  ON public.exchange_groups (team_id, slug) WHERE team_id IS NOT NULL AND deleted_at IS NULL;
-- Indices FK COMPLETOS (el advisor unindexed_foreign_keys no reconoce indices parciales —
-- nota canonica de 20260609062017)
CREATE INDEX IF NOT EXISTS exchange_groups_team_id_idx ON public.exchange_groups (team_id);
CREATE INDEX IF NOT EXISTS exchange_groups_coach_id_idx ON public.exchange_groups (coach_id);

-- updated_at automatico (convencion del repo: public.handle_updated_at(), baseline + 20260517120000)
DROP TRIGGER IF EXISTS handle_updated_at ON public.exchange_groups;
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.exchange_groups
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============ 2) Equivalencias en foods (aditivo, nullable — modo gramos intacto) ============
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_group_id uuid REFERENCES public.exchange_groups(id);
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_portion_grams numeric;
ALTER TABLE public.foods ADD COLUMN IF NOT EXISTS exchange_portion_label text;  -- medida casera: '3/4 taza', '1 unidad chica'
-- Indice FK COMPLETO (el PLAN proponia parcial WHERE NOT NULL; se usa completo por la nota
-- canonica del advisor unindexed_foreign_keys — mismo costo de plan, advisor en verde)
CREATE INDEX IF NOT EXISTS foods_exchange_group_id_idx ON public.foods (exchange_group_id);

-- ============ 3) Modo de plan (default 'grams' preserva TODO lo existente — AC1) ============
ALTER TABLE public.nutrition_plans ADD COLUMN IF NOT EXISTS plan_mode text NOT NULL DEFAULT 'grams';
ALTER TABLE public.nutrition_plan_templates ADD COLUMN IF NOT EXISTS plan_mode text NOT NULL DEFAULT 'grams';
-- Templates compartidos en el pool (decision 2.1 del director): team_id es MARCADOR de scope
-- para las queries 3-vias de F7 — coach_id sigue siendo el autor (ver header §OWNERSHIP).
ALTER TABLE public.nutrition_plan_templates ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);
CREATE INDEX IF NOT EXISTS nutrition_plan_templates_team_id_idx ON public.nutrition_plan_templates (team_id);
-- CHECK con guard de idempotencia (ADD CONSTRAINT no soporta IF NOT EXISTS):
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_plans_plan_mode_chk') THEN
    ALTER TABLE public.nutrition_plans
      ADD CONSTRAINT nutrition_plans_plan_mode_chk CHECK (plan_mode IN ('grams','exchanges')) NOT VALID;
    ALTER TABLE public.nutrition_plans VALIDATE CONSTRAINT nutrition_plans_plan_mode_chk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_plan_templates_plan_mode_chk') THEN
    ALTER TABLE public.nutrition_plan_templates
      ADD CONSTRAINT nutrition_plan_templates_plan_mode_chk CHECK (plan_mode IN ('grams','exchanges')) NOT VALID;
    ALTER TABLE public.nutrition_plan_templates VALIDATE CONSTRAINT nutrition_plan_templates_plan_mode_chk;
  END IF;
END $$;

-- ============ 4) Variantes de dia (NULL = aplica a todas => planes viejos intactos) ============
-- Variante por TIPO de dia ('Descanso' | 'Entreno AM' | 'Entreno PM', presets editables);
-- coexiste con day_of_week (que NO se toca).
CREATE TABLE IF NOT EXISTS public.nutrition_plan_day_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid NOT NULL REFERENCES public.nutrition_plans(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nutrition_plan_day_variants_plan_id_idx
  ON public.nutrition_plan_day_variants (plan_id);
ALTER TABLE public.nutrition_meals ADD COLUMN IF NOT EXISTS day_variant_id uuid
  REFERENCES public.nutrition_plan_day_variants(id) ON DELETE SET NULL;
-- Indice FK COMPLETO (idem nota advisor; el PLAN proponia parcial)
CREATE INDEX IF NOT EXISTS nutrition_meals_day_variant_id_idx ON public.nutrition_meals (day_variant_id);

-- ============ 5) Porciones por grupo por comida (targets — el corazon del modo exchanges) ============
-- Targets POR COMIDA (no por dia): la pauta real de Fran asigna porciones por comida; los
-- totales diarios se derivan en packages/calc (los campos daily_* de nutrition_plans siguen
-- siendo el objetivo que fija la nutri, igual que hoy).
CREATE TABLE IF NOT EXISTS public.meal_exchange_targets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id           uuid NOT NULL REFERENCES public.nutrition_meals(id) ON DELETE CASCADE,
  exchange_group_id uuid NOT NULL REFERENCES public.exchange_groups(id),
  portions          numeric NOT NULL CHECK (portions > 0 AND portions <= 99),  -- numeric: permite 0.5 (pendiente Fran)
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_id, exchange_group_id)
);
CREATE INDEX IF NOT EXISTS meal_exchange_targets_meal_id_idx ON public.meal_exchange_targets (meal_id);
CREATE INDEX IF NOT EXISTS meal_exchange_targets_group_id_idx ON public.meal_exchange_targets (exchange_group_id);

-- ============ 6) Hardening de grants (OBLIGATORIO en toda tabla nueva del proyecto) ============
-- Sin este bloque, anon nace con ALL — incluido TRUNCATE, que RLS NO filtra — sobre las 3 tablas.
-- Patron canonico: 20260609062017_workout_section_templates.sql lineas 44-46.
REVOKE ALL ON public.exchange_groups             FROM anon, authenticated;
REVOKE ALL ON public.nutrition_plan_day_variants FROM anon, authenticated;
REVOKE ALL ON public.meal_exchange_targets       FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exchange_groups             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plan_day_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_exchange_targets       TO authenticated;

GRANT ALL ON public.exchange_groups             TO service_role;
GRANT ALL ON public.nutrition_plan_day_variants TO service_role;
GRANT ALL ON public.meal_exchange_targets       TO service_role;
-- anon queda SIN privilegios (RLS es techo de filas, no de privilegios de tabla).

-- ============ 7) RLS (PLAN §RLS — policies por operacion, nombres nuevos, sin tocar existentes) ============

-- ---- exchange_groups (catalogo chico, baja cardinalidad) ----
ALTER TABLE public.exchange_groups ENABLE ROW LEVEL SECURITY;

-- Lectura: system para todo authenticated; custom solo del dueno (coach) o de los teams del
-- usuario. El ALUMNO no recibe policy para el catalogo del team: la app resuelve los grupos
-- REFERENCIADOS por su plan via createServiceRoleClient() acotado + filtro de tenant (patron F5
-- de movida-areas; gotcha createRawAdminClient NO bypasea RLS con cookies).
DROP POLICY IF EXISTS xg_select ON public.exchange_groups;
CREATE POLICY xg_select ON public.exchange_groups FOR SELECT USING (
  deleted_at IS NULL AND (
    is_system
    OR coach_id = (select auth.uid())
    OR team_id IN (SELECT public.current_user_team_ids())
  )
);

-- Writes solo sobre custom: coach sobre las suyas; team SOLO gestores
-- (current_user_managed_team_ids(), helper set-returning ya en prod — 20260609170000).
-- System inmutable: NOT is_system en toda policy de write => negado.
DROP POLICY IF EXISTS xg_insert ON public.exchange_groups;
CREATE POLICY xg_insert ON public.exchange_groups FOR INSERT WITH CHECK (
  NOT is_system AND (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()) AND team_id IS NULL)
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()) AND coach_id IS NULL)
  )
);
DROP POLICY IF EXISTS xg_update ON public.exchange_groups;
CREATE POLICY xg_update ON public.exchange_groups FOR UPDATE USING (
  NOT is_system AND (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()))
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()))
  )
) WITH CHECK (
  NOT is_system AND (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()) AND team_id IS NULL)
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()) AND coach_id IS NULL)
  )
);
DROP POLICY IF EXISTS xg_delete ON public.exchange_groups;
CREATE POLICY xg_delete ON public.exchange_groups FOR DELETE USING (
  NOT is_system AND (
    (coach_id IS NOT NULL AND coach_id = (select auth.uid()))
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.current_user_managed_team_ids()))
  )
);
-- Espejo del patron canonico wst_service (belt-and-suspenders; service_role ya bypasea RLS).
DROP POLICY IF EXISTS xg_service ON public.exchange_groups;
CREATE POLICY xg_service ON public.exchange_groups FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ---- meal_exchange_targets (ligada al hot path del alumno) ----
-- Mismo ALCANCE que food_items (coach dueno del plan / alumno del plan / pool) pero NO su forma:
-- las policies de food_items del baseline (food_items_access / _client_select / _coach_all,
-- lineas 3038-3061) son EXISTS CORRELACIONADO — el anti-patron del incidente 2026-06-09.
-- Formas finales NO correlacionadas (subquery autocontenida, sin referencia a la fila externa).
ALTER TABLE public.meal_exchange_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS met_coach_all ON public.meal_exchange_targets;
CREATE POLICY met_coach_all ON public.meal_exchange_targets FOR ALL
  USING (meal_id IN (
    SELECT m.id FROM public.nutrition_meals m
    JOIN public.nutrition_plans p ON p.id = m.plan_id
    WHERE p.coach_id = (select auth.uid())
  ))
  WITH CHECK (meal_id IN (
    SELECT m.id FROM public.nutrition_meals m
    JOIN public.nutrition_plans p ON p.id = m.plan_id
    WHERE p.coach_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS met_client_select ON public.meal_exchange_targets;
CREATE POLICY met_client_select ON public.meal_exchange_targets FOR SELECT
  USING (meal_id IN (
    SELECT m.id FROM public.nutrition_meals m
    JOIN public.nutrition_plans p ON p.id = m.plan_id
    WHERE p.client_id = (select auth.uid())
  ));

-- Pool full-access: helper YA en prod (20260609160000_team_rls_optimized.sql).
DROP POLICY IF EXISTS team_met_member_all ON public.meal_exchange_targets;
CREATE POLICY team_met_member_all ON public.meal_exchange_targets FOR ALL
  USING (meal_id IN (SELECT public.current_user_pool_meal_ids()))
  WITH CHECK (meal_id IN (SELECT public.current_user_pool_meal_ids()));

DROP POLICY IF EXISTS met_service ON public.meal_exchange_targets;
CREATE POLICY met_service ON public.meal_exchange_targets FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ---- nutrition_plan_day_variants (mismo alcance espejo, por plan_id) ----
ALTER TABLE public.nutrition_plan_day_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS npdv_coach_all ON public.nutrition_plan_day_variants;
CREATE POLICY npdv_coach_all ON public.nutrition_plan_day_variants FOR ALL
  USING (plan_id IN (
    SELECT p.id FROM public.nutrition_plans p WHERE p.coach_id = (select auth.uid())
  ))
  WITH CHECK (plan_id IN (
    SELECT p.id FROM public.nutrition_plans p WHERE p.coach_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS npdv_client_select ON public.nutrition_plan_day_variants;
CREATE POLICY npdv_client_select ON public.nutrition_plan_day_variants FOR SELECT
  USING (plan_id IN (
    SELECT p.id FROM public.nutrition_plans p WHERE p.client_id = (select auth.uid())
  ));

-- Pool full-access: helper YA en prod (20260609160000_team_rls_optimized.sql).
DROP POLICY IF EXISTS npdv_pool_all ON public.nutrition_plan_day_variants;
CREATE POLICY npdv_pool_all ON public.nutrition_plan_day_variants FOR ALL
  USING (plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids()))
  WITH CHECK (plan_id IN (SELECT public.current_user_pool_nutrition_plan_ids()));

DROP POLICY IF EXISTS npdv_service ON public.nutrition_plan_day_variants;
CREATE POLICY npdv_service ON public.nutrition_plan_day_variants FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ---- nutrition_plan_templates (guard RESTRICTIVE de tenant sobre el team_id nuevo) ----
-- Las permissive vigentes NO miran team_id (standalone: coach_id = auth.uid();
-- pool: team_nutrition_plan_templates_member_all valida solo coach_id IN
-- current_user_pool_coach_ids) => sin este guard, un coach autenticado podria INSERT/UPDATE
-- un template con team_id de un team AJENO (uuid adivinado/filtrado). Hoy nada lee por
-- team_id, pero F7 agrega queries 3-vias por team => filas pre-plantadas con team_id forjado
-- aflorarian en la libreria del otro team. RESTRICTIVE = se AND-ea con las permissive; todos
-- los flujos existentes escriben team_id NULL => cero impacto. service_role tiene BYPASSRLS
-- (los flujos admin/seed no pasan por aca). Assert: T10 en tests/team/exchanges-isolation.sql.
DROP POLICY IF EXISTS npt_team_id_guard ON public.nutrition_plan_templates;
CREATE POLICY npt_team_id_guard ON public.nutrition_plan_templates
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (team_id IS NULL OR team_id IN (SELECT public.current_user_team_ids()));

DROP POLICY IF EXISTS npt_team_id_guard_upd ON public.nutrition_plan_templates;
CREATE POLICY npt_team_id_guard_upd ON public.nutrition_plan_templates
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (team_id IS NULL OR team_id IN (SELECT public.current_user_team_ids()));
