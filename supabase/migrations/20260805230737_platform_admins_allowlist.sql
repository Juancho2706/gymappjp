-- F4 acceso (auditoria panel CEO 08-05): la autorizacion admin vivia SOLO en la env var
-- ADMIN_EMAILS (sin rastro de altas/bajas, typo = lockout silencioso). Esta tabla es la
-- allowlist persistente y auditable; la env var queda como bootstrap/fallback y el gate
-- resuelve la UNION de ambas (nunca lockout por tabla vacia o DB caida).
-- Aplicada en LIVE via MCP apply_migration; este archivo es el espejo local.
CREATE TABLE IF NOT EXISTS public.platform_admins (
    email       text PRIMARY KEY CHECK (email = lower(btrim(email))),
    note        text,
    created_by  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    revoked_at  timestamptz
);

COMMENT ON TABLE public.platform_admins IS
    'Allowlist del panel CEO. Gate = union(env ADMIN_EMAILS, filas con revoked_at IS NULL). Solo service_role lee/escribe.';

-- Sin policies a proposito: RLS activo + cero policies = solo service_role (bypass) accede.
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
