-- Excel Client Importer — audit table for bulk import jobs (enterprise-aware)
-- Tracks each import attempt: filename, counts, errors jsonb, consent timestamp.
-- Supports standalone coaches (coach_id) and org admins (org_id).
-- Exactly one of coach_id or org_id must be non-null per row.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.client_imports;

CREATE TABLE IF NOT EXISTS public.client_imports (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- standalone coach: coach_id IS NOT NULL, org_id IS NULL
    coach_id              uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
    -- org import: org_id IS NOT NULL, coach_id IS NULL
    org_id                uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    filename              text NOT NULL,
    total_rows            integer NOT NULL DEFAULT 0,
    success_count         integer NOT NULL DEFAULT 0,
    error_count           integer NOT NULL DEFAULT 0,
    errors                jsonb NOT NULL DEFAULT '[]'::jsonb,
    status                text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    consent_confirmed_at  timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    completed_at          timestamptz,
    CONSTRAINT client_imports_owner_chk CHECK (
        (coach_id IS NOT NULL AND org_id IS NULL)
        OR (org_id IS NOT NULL AND coach_id IS NULL)
    )
);

ALTER TABLE public.client_imports ENABLE ROW LEVEL SECURITY;

-- Standalone coach: owner-only access.
DROP POLICY IF EXISTS client_imports_coach_all ON public.client_imports;
CREATE POLICY client_imports_coach_all ON public.client_imports
    FOR ALL
    USING (coach_id IS NOT NULL AND coach_id = auth.uid())
    WITH CHECK (coach_id IS NOT NULL AND coach_id = auth.uid());

-- Org admins/owners: access to their org's imports.
DROP POLICY IF EXISTS client_imports_org_all ON public.client_imports;
CREATE POLICY client_imports_org_all ON public.client_imports
    FOR ALL
    USING (
        org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = client_imports.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('org_owner', 'org_admin')
              AND om.status = 'active'
              AND om.deleted_at IS NULL
        )
    )
    WITH CHECK (
        org_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.org_id = client_imports.org_id
              AND om.user_id = auth.uid()
              AND om.role IN ('org_owner', 'org_admin')
              AND om.status = 'active'
              AND om.deleted_at IS NULL
        )
    );

CREATE INDEX IF NOT EXISTS client_imports_coach_created_idx
    ON public.client_imports (coach_id, created_at DESC)
    WHERE coach_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS client_imports_org_created_idx
    ON public.client_imports (org_id, created_at DESC)
    WHERE org_id IS NOT NULL;

COMMENT ON TABLE public.client_imports IS
    'Audit log of bulk client imports from Excel/CSV. consent_confirmed_at records explicit Ley 19.628/21.719 consent confirmation.';
