-- Kill-switch de plataforma (Plan 1): flag de OPERADOR (CEO) además del entitlement.
-- Team suspendido = invisible: el RPC del alumno no lo resuelve (proxy /t cae en el holding
-- existente de slug inexistente) y los workspaces del coach lo excluyen (app-level).
-- Aditivo/idempotente; reversible (suspended_at = NULL).
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- RPC v4: idéntico a v3 + el team suspendido no existe para el shell del alumno.
CREATE OR REPLACE FUNCTION public.get_team_alumno_context(p_team_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'team_id', t.id, 'team_slug', t.slug, 'name', t.name,
    'primary_color', t.primary_color, 'logo_url', t.logo_url,
    'logo_url_dark', t.logo_url_dark, 'accent_light', t.accent_light, 'accent_dark', t.accent_dark,
    'neutral_tint', t.neutral_tint, 'splash_bg_color', t.splash_bg_color,
    'loader_text', t.loader_text, 'loader_text_color', t.loader_text_color,
    'loader_icon_mode', t.loader_icon_mode, 'use_custom_loader', t.use_custom_loader,
    'is_member', (m.client_id IS NOT NULL OR c.id IS NOT NULL),
    'coach_id', COALESCE(m.coach_id, c.coach_id),
    'coach_slug', co.slug,
    'coach_active', (co.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.coach_id = co.id
        AND tm.status = 'active' AND tm.deleted_at IS NULL)),
    'is_active', COALESCE(c.is_active, true),
    'is_archived', COALESCE(c.is_archived, false),
    'force_password_change', COALESCE(c.force_password_change, false),
    'onboarding_completed', COALESCE(c.onboarding_completed, false),
    'has_pool_consent', EXISTS (
      SELECT 1 FROM client_consents cc
      WHERE cc.client_id = COALESCE(m.client_id, c.id)
        AND cc.team_id = t.id
        AND cc.purpose = 'pool_multidisciplinary_access'
        AND cc.revoked_at IS NULL)
  )
  FROM (SELECT * FROM public.teams WHERE slug = p_team_slug AND deleted_at IS NULL AND suspended_at IS NULL) t
  LEFT JOIN public.client_memberships m
    ON m.team_id = t.id AND m.account_id = auth.uid() AND m.scope = 'team' AND m.status = 'active' AND m.deleted_at IS NULL
  LEFT JOIN public.clients c ON c.id = auth.uid() AND c.team_id = t.id
  LEFT JOIN public.coaches co ON co.id = COALESCE(m.coach_id, c.coach_id);
$$;
