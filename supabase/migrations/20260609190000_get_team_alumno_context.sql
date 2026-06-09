-- get_team_alumno_context — RPC SECURITY DEFINER para el app del alumno de pool /t/[team_slug].
-- Espejo de get_enterprise_alumno_context (migr. 20260608230000): dado auth.uid() (el alumno) y un
-- team_slug, devuelve branding del team + is_member + coach (creador) para el rewrite a /c/[coach].
-- is_member resuelve por client_memberships scope='team' O por clients.team_id (compat legacy).
-- Gated a authenticated; STABLE; search_path fijo. Aditiva / idempotente.
CREATE OR REPLACE FUNCTION public.get_team_alumno_context(p_team_slug text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'team_id', t.id,
    'team_slug', t.slug,
    'name', t.name,
    'primary_color', t.primary_color,
    'logo_url', t.logo_url,
    'is_member', (m.client_id IS NOT NULL OR c.id IS NOT NULL),
    'coach_id', COALESCE(m.coach_id, c.coach_id),
    'coach_slug', co.slug,
    'coach_active', (co.id IS NOT NULL AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = t.id AND tm.coach_id = co.id
        AND tm.status = 'active' AND tm.deleted_at IS NULL
    )),
    'is_active', COALESCE(c.is_active, true),
    'is_archived', COALESCE(c.is_archived, false),
    'force_password_change', COALESCE(c.force_password_change, false),
    'onboarding_completed', COALESCE(c.onboarding_completed, false)
  )
  FROM (SELECT * FROM public.teams WHERE slug = p_team_slug AND deleted_at IS NULL) t
  LEFT JOIN public.client_memberships m
    ON m.team_id = t.id AND m.account_id = auth.uid()
   AND m.scope = 'team' AND m.status = 'active' AND m.deleted_at IS NULL
  LEFT JOIN public.clients c
    ON c.id = auth.uid() AND c.team_id = t.id
  LEFT JOIN public.coaches co
    ON co.id = COALESCE(m.coach_id, c.coach_id);
$$;
REVOKE ALL ON FUNCTION public.get_team_alumno_context(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_alumno_context(text) TO authenticated;
