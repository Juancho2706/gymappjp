-- F2/B-9 fix — proxy branding for enterprise alumnos.
--
-- The proxy (middleware) checks whether a client's coach is an ACTIVE member of the
-- client's org to decide between org white-label vs the B-9 orphan (neutral EVA) branding.
-- It ran that check with the alumno's RLS-scoped client, but `organization_members` only
-- exposes rows to active org members (policy `org_members_see_peers = is_active_org_member`).
-- An enterprise *alumno* is NOT an org member, so the lookup always returned NULL and EVERY
-- enterprise alumno was mis-detected as orphaned → shown neutral EVA branding instead of their
-- org's white-label. This SECURITY DEFINER helper answers the boolean membership question
-- without leaking any row data, so the proxy can brand enterprise alumnos correctly.
--
-- Read-only, returns only a boolean. Additive + reversible.
-- Rollback: DROP FUNCTION IF EXISTS public.is_coach_active_org_member(uuid, uuid);

CREATE OR REPLACE FUNCTION public.is_coach_active_org_member(p_org_id uuid, p_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE org_id = p_org_id
      AND coach_id = p_coach_id
      AND status = 'active'
      AND deleted_at IS NULL
  );
$$;

-- Narrow grant: middleware runs as the authenticated alumno. No anon/PUBLIC execute.
REVOKE ALL ON FUNCTION public.is_coach_active_org_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_coach_active_org_member(uuid, uuid) TO authenticated;

-- Second RLS wall: `organizations` is also gated to active org members
-- (policy `org_members_see_own_org`), so the proxy's org white-label read returned NULL for
-- enterprise alumnos too and they fell back to their coach's branding instead of the org's.
-- This gated SECURITY DEFINER reader returns ONLY the white-label branding fields, and ONLY to
-- callers with a legit tie to the org (an active member, or a client whose org_id matches).
-- Rollback: DROP FUNCTION IF EXISTS public.get_org_branding(uuid);
CREATE OR REPLACE FUNCTION public.get_org_branding(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', o.name,
    'primary_color', o.primary_color,
    'logo_url', o.logo_url,
    'loader_text', o.loader_text,
    'use_custom_loader', o.use_custom_loader,
    'loader_text_color', o.loader_text_color,
    'loader_icon_mode', o.loader_icon_mode,
    'accent_light', o.accent_light,
    'accent_dark', o.accent_dark,
    'logo_url_dark', o.logo_url_dark,
    'neutral_tint', o.neutral_tint
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.org_id = o.id AND m.user_id = auth.uid()
          AND m.status = 'active' AND m.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = auth.uid() AND c.org_id = o.id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_org_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_branding(uuid) TO authenticated;
