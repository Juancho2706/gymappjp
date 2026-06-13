-- Migration 4 — WORKOUT SECTION TEMPLATES (areas custom del builder). Fase EXPAND.
-- Reemplaza el enum legacy warmup/main/cooldown de workout_blocks.section por "areas"
-- configurables (system + custom por coach / por team). Aplicada a prod 2026-06-09 via MCP.
-- Spec: specs/movida-areas/. Validada: 9 asserts (tests/team/areas-isolation.sql) + backfill 4004/4004, 0 huerfanas.
-- NO dropea el CHECK de section ni la columna (fase CONTRACT futura). Reads prefieren section_template_id, fallback section.
-- GOTCHA default-priv (ALL incl TRUNCATE a authenticated/anon): REVOKE ALL + GRANT minimo. anon sin nada.
-- Helpers reusados: is_team_member / is_team_manager.

CREATE TABLE IF NOT EXISTS public.workout_section_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    slug        text NOT NULL,
    coach_id    uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
    team_id     uuid REFERENCES public.teams(id)   ON DELETE CASCADE,
    sort_order  integer NOT NULL DEFAULT 0,
    is_system   boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    CONSTRAINT workout_section_templates_ownership_chk CHECK (
        (is_system = true  AND coach_id IS NULL     AND team_id IS NULL)
     OR (is_system = false AND coach_id IS NOT NULL AND team_id IS NULL)
     OR (is_system = false AND team_id  IS NOT NULL AND coach_id IS NULL)
    )
);
-- UNIQUE parciales (unicidad solo entre filas vivas; slug reusable tras soft-delete)
CREATE UNIQUE INDEX IF NOT EXISTS workout_section_templates_system_slug_uidx ON public.workout_section_templates (slug) WHERE deleted_at IS NULL AND is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS workout_section_templates_coach_slug_uidx ON public.workout_section_templates (coach_id, slug) WHERE deleted_at IS NULL AND coach_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workout_section_templates_team_slug_uidx ON public.workout_section_templates (team_id, slug) WHERE deleted_at IS NULL AND team_id IS NOT NULL;
-- Indices FK COMPLETOS (el advisor unindexed_foreign_keys no reconoce indices parciales)
CREATE INDEX IF NOT EXISTS workout_section_templates_coach_idx ON public.workout_section_templates (coach_id);
CREATE INDEX IF NOT EXISTS workout_section_templates_team_idx ON public.workout_section_templates (team_id);

-- Seed system (UUIDs fijos; 3 primeros mapean a section legacy). Idempotente.
INSERT INTO public.workout_section_templates (id, name, slug, sort_order, is_system) VALUES
  ('0000a5ec-0000-0000-0000-000000000001', 'Calentamiento',            'warmup',          0,  true),
  ('0000a5ec-0000-0000-0000-000000000010', 'Principal',                'main',            10, true),
  ('0000a5ec-0000-0000-0000-000000000020', 'Enfriamiento',             'cooldown',        20, true),
  ('0000a5ec-0000-0000-0000-000000000005', 'Movilidad',                'mobility',        5,  true),
  ('0000a5ec-0000-0000-0000-000000000006', 'Activacion pilar central', 'core_activation', 6,  true),
  ('0000a5ec-0000-0000-0000-000000000008', 'Potencia',                 'power',           8,  true),
  ('0000a5ec-0000-0000-0000-000000000030', 'Acondicionamiento',        'conditioning',    30, true)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, sort_order=EXCLUDED.sort_order, is_system=true, coach_id=NULL, team_id=NULL, deleted_at=NULL;

REVOKE ALL ON public.workout_section_templates FROM anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.workout_section_templates TO authenticated;
GRANT  ALL ON public.workout_section_templates TO service_role;

ALTER TABLE public.workout_section_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wst_select ON public.workout_section_templates;
CREATE POLICY wst_select ON public.workout_section_templates FOR SELECT USING (
   deleted_at IS NULL AND (is_system = true OR (coach_id IS NOT NULL AND coach_id = (select auth.uid())) OR (team_id IS NOT NULL AND public.is_team_member(team_id)))
);
DROP POLICY IF EXISTS wst_insert ON public.workout_section_templates;
CREATE POLICY wst_insert ON public.workout_section_templates FOR INSERT WITH CHECK (
   is_system = false AND ((coach_id IS NOT NULL AND coach_id = (select auth.uid()) AND team_id IS NULL) OR (team_id IS NOT NULL AND public.is_team_manager(team_id) AND coach_id IS NULL))
);
DROP POLICY IF EXISTS wst_update ON public.workout_section_templates;
CREATE POLICY wst_update ON public.workout_section_templates FOR UPDATE USING (
   is_system = false AND ((coach_id IS NOT NULL AND coach_id = (select auth.uid())) OR (team_id IS NOT NULL AND public.is_team_manager(team_id)))
) WITH CHECK (
   is_system = false AND ((coach_id IS NOT NULL AND coach_id = (select auth.uid()) AND team_id IS NULL) OR (team_id IS NOT NULL AND public.is_team_manager(team_id) AND coach_id IS NULL))
);
DROP POLICY IF EXISTS wst_delete ON public.workout_section_templates;
CREATE POLICY wst_delete ON public.workout_section_templates FOR DELETE USING (
   is_system = false AND ((coach_id IS NOT NULL AND coach_id = (select auth.uid())) OR (team_id IS NOT NULL AND public.is_team_manager(team_id)))
);
DROP POLICY IF EXISTS wst_service ON public.workout_section_templates;
CREATE POLICY wst_service ON public.workout_section_templates FOR ALL USING ((select auth.role()) = 'service_role') WITH CHECK ((select auth.role()) = 'service_role');

-- workout_blocks.section_template_id (expand-contract sobre el CHECK section)
ALTER TABLE public.workout_blocks ADD COLUMN IF NOT EXISTS section_template_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_blocks_section_template_id_fkey') THEN
    ALTER TABLE public.workout_blocks ADD CONSTRAINT workout_blocks_section_template_id_fkey FOREIGN KEY (section_template_id) REFERENCES public.workout_section_templates(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS workout_blocks_section_template_id_idx ON public.workout_blocks (section_template_id);

-- BACKFILL idempotente: section -> system template uuid.
UPDATE public.workout_blocks
   SET section_template_id = CASE section
        WHEN 'warmup'   THEN '0000a5ec-0000-0000-0000-000000000001'::uuid
        WHEN 'main'     THEN '0000a5ec-0000-0000-0000-000000000010'::uuid
        WHEN 'cooldown' THEN '0000a5ec-0000-0000-0000-000000000020'::uuid
       END
 WHERE section_template_id IS NULL AND section IN ('warmup', 'main', 'cooldown');

DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.workout_blocks WHERE section_template_id IS NULL AND section IN ('warmup', 'main', 'cooldown');
  IF v_orphans <> 0 THEN RAISE EXCEPTION 'backfill incompleto: % workout_blocks con section conocido sin section_template_id', v_orphans; END IF;
END $$;
