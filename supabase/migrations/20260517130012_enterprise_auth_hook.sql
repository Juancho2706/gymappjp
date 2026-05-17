-- JWT custom claims: inyecta coach_id, org_id, org_role en cada token
-- Activar en: Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- coaches.id = auth.uid() — no hay columna user_id separada
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  uid       uuid := (event->>'user_id')::uuid;
  is_coach  boolean;
  org_rec   record;
  claims    jsonb;
BEGIN
  claims := event->'claims';

  -- coaches.id = auth.users.id
  SELECT EXISTS(SELECT 1 FROM coaches WHERE id = uid) INTO is_coach;

  IF is_coach THEN
    claims := jsonb_set(claims, '{coach_id}', to_jsonb(uid));

    -- Usa active_org_id si el coach eligió una org via org-switcher
    -- Fallback: org más reciente por joined_at
    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.coach_id = uid
      AND om.org_id = COALESCE(
        (SELECT active_org_id FROM coaches WHERE id = uid),
        (SELECT org_id FROM organization_members
          WHERE coach_id = uid AND status = 'active' AND deleted_at IS NULL
          ORDER BY joined_at DESC NULLS LAST LIMIT 1)
      )
      AND om.status = 'active'
      AND om.deleted_at IS NULL
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
