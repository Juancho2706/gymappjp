-- F3 — one-shot context resolver for the enterprise alumno area (`/e/[org_slug]/*`).
--
-- The proxy serves `/e/[org_slug]/*` by rewriting to `/c/[coach_slug]/*` with org white-label +
-- a base-path header. To do that in middleware it needs, for the authenticated alumno: the org id
-- + branding, whether they're an active enterprise member of THIS org, their assigned coach slug
-- (and whether that coach is still an active org member), and the account-state flags that drive
-- the force-password / onboarding / suspended guards — all gated to the caller's own context.
--
-- SECURITY DEFINER so the alumno (who has no RLS read on organizations / organization_members)
-- gets exactly this, and nothing else. Returns NULL when the org slug doesn't exist.
-- Branding is white-label (already shown on the public login page) so it is not member-gated;
-- `is_member` gates actual access (the proxy redirects non-members to the org login).
--
-- Rollback: DROP FUNCTION IF EXISTS public.get_enterprise_alumno_context(text);

CREATE OR REPLACE FUNCTION public.get_enterprise_alumno_context(p_org_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'org_id', o.id,
    'org_slug', o.slug,
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
    'neutral_tint', o.neutral_tint,
    'migrated', (o.alumno_area_migrated_at IS NOT NULL),
    'is_member', (m.client_id IS NOT NULL OR c.id IS NOT NULL),
    'coach_id', COALESCE(m.coach_id, c.coach_id),
    'coach_slug', co.slug,
    'coach_active', (co.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = o.id AND om.coach_id = co.id
        AND om.status = 'active' AND om.deleted_at IS NULL
    )),
    'is_active', COALESCE(c.is_active, true),
    'is_archived', COALESCE(c.is_archived, false),
    'force_password_change', COALESCE(c.force_password_change, false),
    'onboarding_completed', COALESCE(c.onboarding_completed, false)
  )
  FROM (SELECT * FROM public.organizations WHERE slug = p_org_slug) o
  LEFT JOIN public.client_memberships m
    ON m.org_id = o.id AND m.account_id = auth.uid()
   AND m.scope = 'enterprise' AND m.status = 'active' AND m.deleted_at IS NULL
  LEFT JOIN public.clients c
    ON c.id = auth.uid() AND c.org_id = o.id
  LEFT JOIN public.coaches co
    ON co.id = COALESCE(m.coach_id, c.coach_id);
$$;

REVOKE ALL ON FUNCTION public.get_enterprise_alumno_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_enterprise_alumno_context(text) TO authenticated;
