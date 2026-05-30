-- Custom Exercise Creator — Migration 1: add soft-delete, source, org_id columns
-- ADDITIVE only. No data changes, no RLS yet.
-- Adds:
--   deleted_at  soft-delete marker
--   source      origin tracking: 'manual'|'system'|'coach'|'org'
--   org_id      enterprise org-scoped exercises (NULL = standalone coach or system)
--
-- Rollback:
--   DROP INDEX IF EXISTS exercises_coach_id_active_idx;
--   DROP INDEX IF EXISTS exercises_org_id_active_idx;
--   ALTER TABLE public.exercises DROP COLUMN IF EXISTS deleted_at;
--   ALTER TABLE public.exercises DROP COLUMN IF EXISTS source;
--   ALTER TABLE public.exercises DROP COLUMN IF EXISTS org_id;

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS exercises_coach_id_active_idx
    ON public.exercises (coach_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS exercises_org_id_active_idx
    ON public.exercises (org_id)
    WHERE deleted_at IS NULL;
