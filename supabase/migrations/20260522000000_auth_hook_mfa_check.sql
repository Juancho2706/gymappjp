-- Add requires_mfa_setup claim for org_owner/org_admin without TOTP enrolled.
-- Middleware reads this claim and redirects to /org/[slug]/setup-mfa.

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
  has_totp  boolean;
BEGIN
  claims := event->'claims';

  SELECT EXISTS(SELECT 1 FROM coaches WHERE id = uid) INTO is_coach;

  IF is_coach THEN
    claims := jsonb_set(claims, '{coach_id}', to_jsonb(uid));

    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.user_id = uid
      AND om.org_id = COALESCE(
        (SELECT active_org_id FROM coaches WHERE id = uid),
        (SELECT org_id FROM organization_members
          WHERE user_id = uid AND status = 'active' AND deleted_at IS NULL
          ORDER BY joined_at DESC NULLS LAST LIMIT 1)
      )
      AND om.status = 'active'
      AND om.deleted_at IS NULL
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
    END IF;
  ELSE
    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.user_id = uid
      AND om.coach_id IS NULL
      AND om.status = 'active'
      AND om.deleted_at IS NULL
      AND om.role IN ('org_owner', 'org_admin')
    ORDER BY om.joined_at DESC NULLS LAST
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
      claims := jsonb_set(claims, '{is_org_user}', 'true'::jsonb);

      -- Require TOTP for org_owner and org_admin
      SELECT EXISTS(
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = uid AND factor_type = 'totp' AND status = 'verified'
      ) INTO has_totp;

      IF NOT has_totp THEN
        claims := jsonb_set(claims, '{requires_mfa_setup}', 'true'::jsonb);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
