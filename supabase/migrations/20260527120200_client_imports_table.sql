-- Excel Client Importer — audit table for bulk import jobs
-- Tracks each import attempt: filename, counts, errors jsonb, consent timestamp.
-- New table only; no impact on existing tables or queries.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.client_imports;

CREATE TABLE IF NOT EXISTS public.client_imports (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id              uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    filename              text NOT NULL,
    total_rows            integer NOT NULL DEFAULT 0,
    success_count         integer NOT NULL DEFAULT 0,
    error_count           integer NOT NULL DEFAULT 0,
    errors                jsonb NOT NULL DEFAULT '[]'::jsonb,
    status                text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    consent_confirmed_at  timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    completed_at          timestamptz
);

ALTER TABLE public.client_imports ENABLE ROW LEVEL SECURITY;

-- Owner-only access for all operations. Service role bypasses for backend.
CREATE POLICY client_imports_owner_all ON public.client_imports
    FOR ALL
    USING (coach_id = auth.uid())
    WITH CHECK (coach_id = auth.uid());

CREATE INDEX IF NOT EXISTS client_imports_coach_created_idx
    ON public.client_imports (coach_id, created_at DESC);

COMMENT ON TABLE public.client_imports IS
    'Audit log of bulk client imports from Excel/CSV. consent_confirmed_at records explicit Ley 19.628/21.719 consent confirmation.';
