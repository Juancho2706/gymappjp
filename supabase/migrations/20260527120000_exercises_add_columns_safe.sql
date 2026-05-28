-- Custom Exercise Creator — Migration 1 of 2 for exercises table
-- ADDITIVE: adds nullable columns + index. No data changes, no RLS yet.
-- Safe to deploy with running app. Existing queries continue to work.
--
-- Columns:
--   deleted_at  - soft-delete marker so coach can remove an exercise from
--                 the picker without breaking workout_blocks that reference it.
--   source      - tracking origin: 'manual' (legacy), 'system' (seed),
--                 'coach' (custom), 'org' (future enterprise share).
--
-- Index: partial on coach_id WHERE deleted_at IS NULL — accelerates the
--        builder picker query (coach_id.is.null OR coach_id.eq.user.id).
--
-- Rollback (if needed):
--   DROP INDEX IF EXISTS public.exercises_coach_id_active_idx;
--   ALTER TABLE public.exercises DROP COLUMN IF EXISTS deleted_at;
--   ALTER TABLE public.exercises DROP COLUMN IF EXISTS source;

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Plain CREATE INDEX (not CONCURRENTLY) because Supabase wraps migrations
-- in a transaction. exercises is small enough (<10k rows expected) that
-- the brief lock is acceptable. If table grows large, run CONCURRENTLY
-- manually via psql outside migration system.
CREATE INDEX IF NOT EXISTS exercises_coach_id_active_idx
    ON public.exercises (coach_id)
    WHERE deleted_at IS NULL;
