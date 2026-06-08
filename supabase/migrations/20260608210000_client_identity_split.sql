-- P1.1 — Identity split for the "hybrid by email" alumno model (D2).
-- ADDITIVE + reversible. Nothing reads these tables yet (P1.2 wires dual-read with fallback),
-- so existing alumnos keep working unchanged.
--
--   client_accounts    : one per auth.users.id — the PERSON identity.
--   client_memberships : the contexts a person participates in (standalone / per-org).
-- The existing `clients` row keeps the training data (plans, check-ins); membership/world moves
-- to client_memberships. For now 1 account = 1 clients row = 1 membership (1:1:1); the layer
-- lets a future person have a standalone AND an enterprise membership without a 2nd clients row
-- (which the global email unique index forbids).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.client_memberships;
--   DROP TABLE IF EXISTS public.client_accounts;

CREATE TABLE IF NOT EXISTS public.client_accounts (
    id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_memberships (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
    client_id  uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    scope      text NOT NULL CHECK (scope IN ('standalone','enterprise')),
    coach_id   uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
    org_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CHECK ((scope = 'enterprise' AND org_id IS NOT NULL) OR (scope = 'standalone' AND org_id IS NULL))
);

-- one standalone membership per account; one enterprise membership per (account, org)
CREATE UNIQUE INDEX IF NOT EXISTS client_memberships_standalone_uidx
    ON public.client_memberships (account_id) WHERE deleted_at IS NULL AND scope = 'standalone';
CREATE UNIQUE INDEX IF NOT EXISTS client_memberships_org_uidx
    ON public.client_memberships (account_id, org_id) WHERE deleted_at IS NULL AND org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS client_memberships_account_idx ON public.client_memberships (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS client_memberships_org_idx ON public.client_memberships (org_id) WHERE deleted_at IS NULL AND org_id IS NOT NULL;

ALTER TABLE public.client_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_accounts_self ON public.client_accounts FOR SELECT USING (id = auth.uid());
CREATE POLICY client_accounts_service ON public.client_accounts FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY client_memberships_self ON public.client_memberships FOR SELECT USING (account_id = auth.uid());
CREATE POLICY client_memberships_org_admin ON public.client_memberships FOR SELECT
    USING (org_id IS NOT NULL AND public.is_active_org_member(org_id));
CREATE POLICY client_memberships_service ON public.client_memberships FOR ALL USING (auth.role() = 'service_role');

-- Backfill: one account + one membership per existing client, derived from its current world.
INSERT INTO public.client_accounts (id)
SELECT id FROM public.clients
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_memberships (account_id, client_id, scope, coach_id, org_id, status)
SELECT c.id, c.id,
       CASE WHEN c.org_id IS NOT NULL THEN 'enterprise' ELSE 'standalone' END,
       c.coach_id, c.org_id, 'active'
FROM public.clients c
WHERE NOT EXISTS (
    SELECT 1 FROM public.client_memberships m
    WHERE m.account_id = c.id AND m.deleted_at IS NULL
      AND ((c.org_id IS NOT NULL AND m.org_id = c.org_id) OR (c.org_id IS NULL AND m.scope = 'standalone'))
);
