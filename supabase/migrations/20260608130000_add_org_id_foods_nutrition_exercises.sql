-- F8 + F14 (Phase 2, step A — ADDITIVE, zero behavior change):
-- foods / saved_meals / food_swap_groups / exercises had NO org_id in prod, so org-scoped
-- catalogs were impossible and a dual coach saw their standalone catalog inside the org
-- workspace. Add a nullable org_id (FK -> organizations, cascade on org delete) so org
-- catalogs become representable. NO backfill: every existing row stays org_id NULL =
-- standalone/system, preserving the invariant "pre-existing standalone stays standalone".
--
-- The org-scoped RLS + the query updates that consume org_id ship in the NEXT migration/PR
-- (step B), so this column is inert until then.
--
-- Note: exercises already had org_id in the migration FILES but NOT in prod (drift); this
-- reconciles prod to match the intended schema. Regenerate database.types.ts after applying.
--
-- Rollback:
--   ALTER TABLE public.foods            DROP COLUMN IF EXISTS org_id;
--   ALTER TABLE public.saved_meals      DROP COLUMN IF EXISTS org_id;
--   ALTER TABLE public.food_swap_groups DROP COLUMN IF EXISTS org_id;
--   ALTER TABLE public.exercises        DROP COLUMN IF EXISTS org_id;

ALTER TABLE public.foods            ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.saved_meals      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.food_swap_groups ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.exercises        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS foods_org_id_idx            ON public.foods(org_id)            WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS saved_meals_org_id_idx      ON public.saved_meals(org_id)      WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS food_swap_groups_org_id_idx ON public.food_swap_groups(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exercises_org_id_idx        ON public.exercises(org_id)        WHERE org_id IS NOT NULL;
