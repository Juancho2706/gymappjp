-- Drift fix: client_imports in prod is coach-only (coach_id NOT NULL, no org_id), but the
-- coach-side CSV import action (coach/clients/import/import.actions.ts) already writes an
-- org-scoped import row (org_id set, coach_id null) when an enterprise coach imports. That
-- path is broken in prod today. Reconcile the schema to match the code's intent.
--
-- Additive + nullable relaxation: add org_id, allow coach_id NULL, add an org RLS policy.
-- Existing coach rows are unaffected (coach_id stays set; coach policy still applies).
--
-- Rollback:
--   DROP POLICY IF EXISTS client_imports_org_all ON public.client_imports;
--   DROP INDEX IF EXISTS public.client_imports_org_id_idx;
--   ALTER TABLE public.client_imports ALTER COLUMN coach_id SET NOT NULL;  -- only if no NULLs exist
--   ALTER TABLE public.client_imports DROP COLUMN IF EXISTS org_id;

ALTER TABLE public.client_imports ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.client_imports ALTER COLUMN coach_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS client_imports_org_id_idx ON public.client_imports(org_id) WHERE org_id IS NOT NULL;

-- Active org members manage org-scoped import rows (coach rows keep client_imports_owner_all).
DROP POLICY IF EXISTS client_imports_org_all ON public.client_imports;
CREATE POLICY client_imports_org_all ON public.client_imports
  FOR ALL
  USING (org_id IS NOT NULL AND public.is_active_org_member(org_id))
  WITH CHECK (org_id IS NOT NULL AND public.is_active_org_member(org_id));
