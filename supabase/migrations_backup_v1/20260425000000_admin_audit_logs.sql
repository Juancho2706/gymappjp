-- Admin audit logging: tracks every destructive/mutating action in the admin panel.
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_email text NOT NULL,
    action text NOT NULL,
    target_table text NOT NULL,
    target_id text,
    payload jsonb,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
    ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action
    ON public.admin_audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_email
    ON public.admin_audit_logs (admin_email);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (admin panel uses createAdminClient/service_role)
CREATE POLICY admin_audit_logs_service_role_select
    ON public.admin_audit_logs
    FOR SELECT
    TO service_role
    USING (true);

CREATE POLICY admin_audit_logs_service_role_insert
    ON public.admin_audit_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);
