-- ============================================================
-- EVA Enterprise — Test Seeds
-- Apply with: npx supabase db reset --local
-- Password for all test users: TestPass123!
-- ============================================================

DO $$
DECLARE
  -- Coach IDs
  owner_a  uuid := '00000000-0000-0000-0001-000000000001';
  coach_a1 uuid := '00000000-0000-0000-0001-000000000002';
  coach_a2 uuid := '00000000-0000-0000-0001-000000000003';
  owner_b  uuid := '00000000-0000-0000-0001-000000000004';
  coach_b1 uuid := '00000000-0000-0000-0001-000000000005';
  coach_both uuid := '00000000-0000-0000-0001-000000000006';
  coach_solo uuid := '00000000-0000-0000-0001-000000000007';
  coach_inv  uuid := '00000000-0000-0000-0001-000000000008';
  -- Org IDs
  org_a uuid := '00000000-0000-0000-0002-000000000001';
  org_b uuid := '00000000-0000-0000-0002-000000000002';
  -- Client IDs org_a
  ca1 uuid := '00000000-0000-0000-0003-000000000001';
  ca2 uuid := '00000000-0000-0000-0003-000000000002';
  ca3 uuid := '00000000-0000-0000-0003-000000000003';
  ca4 uuid := '00000000-0000-0000-0003-000000000004';
  ca5 uuid := '00000000-0000-0000-0003-000000000005';
  -- Client IDs org_b
  cb1 uuid := '00000000-0000-0000-0004-000000000001';
  cb2 uuid := '00000000-0000-0000-0004-000000000002';
  cb3 uuid := '00000000-0000-0000-0004-000000000003';
  cb4 uuid := '00000000-0000-0000-0004-000000000004';
  cb5 uuid := '00000000-0000-0000-0004-000000000005';
  -- Client IDs standalone
  cs1 uuid := '00000000-0000-0000-0005-000000000001';
  cs2 uuid := '00000000-0000-0000-0005-000000000002';
  cs3 uuid := '00000000-0000-0000-0005-000000000003';
  pw  text := crypt('TestPass123!', gen_salt('bf'));
BEGIN

  -- ============================================================
  -- 1. Auth users
  -- ============================================================
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    created_at, updated_at, role, aud, is_super_admin, instance_id,
    confirmation_token, recovery_token, email_change_token_new, email_change_token_current,
    email_change
  )
  VALUES
    (owner_a,   'coach-owner-a@eva-test.cl',   pw, now(), '{"full_name":"Owner A"}'::jsonb,       '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_a1,  'coach-member-a1@eva-test.cl',  pw, now(), '{"full_name":"Coach A1"}'::jsonb,      '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_a2,  'coach-member-a2@eva-test.cl',  pw, now(), '{"full_name":"Coach A2"}'::jsonb,      '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (owner_b,   'coach-owner-b@eva-test.cl',    pw, now(), '{"full_name":"Owner B"}'::jsonb,       '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_b1,  'coach-member-b1@eva-test.cl',  pw, now(), '{"full_name":"Coach B1"}'::jsonb,      '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_both,'coach-both@eva-test.cl',        pw, now(), '{"full_name":"Coach Both"}'::jsonb,    '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_solo,'coach-solo@eva-test.cl',        pw, now(), '{"full_name":"Coach Solo"}'::jsonb,    '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_inv, 'coach-invited@eva-test.cl',     pw, now(), '{"full_name":"Coach Invited"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (ca1, 'client-a1@eva-test.cl', pw, now(), '{"full_name":"Client A1"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (ca2, 'client-a2@eva-test.cl', pw, now(), '{"full_name":"Client A2"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (ca3, 'client-a3@eva-test.cl', pw, now(), '{"full_name":"Client A3"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (ca4, 'client-a4@eva-test.cl', pw, now(), '{"full_name":"Client A4"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (ca5, 'client-a5@eva-test.cl', pw, now(), '{"full_name":"Client A5"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cb1, 'client-b1@eva-test.cl', pw, now(), '{"full_name":"Client B1"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cb2, 'client-b2@eva-test.cl', pw, now(), '{"full_name":"Client B2"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cb3, 'client-b3@eva-test.cl', pw, now(), '{"full_name":"Client B3"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cb4, 'client-b4@eva-test.cl', pw, now(), '{"full_name":"Client B4"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cb5, 'client-b5@eva-test.cl', pw, now(), '{"full_name":"Client B5"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cs1, 'client-solo1@eva-test.cl', pw, now(), '{"full_name":"Client Solo1"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cs2, 'client-solo2@eva-test.cl', pw, now(), '{"full_name":"Client Solo2"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (cs3, 'client-solo3@eva-test.cl', pw, now(), '{"full_name":"Client Solo3"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 2. Coaches
  -- ============================================================
  -- Stable invite codes for mobile/manual QA.
  INSERT INTO coaches (id, slug, full_name, brand_name, subscription_status, max_clients, invite_code)
  VALUES
    (owner_a,    'owner-a-test',    'Owner A',       'Owner A Fitness',  'org_managed', 100, 'OWNA1'),
    (coach_a1,   'coach-a1-test',   'Coach A1',      'A1 Fitness',       'org_managed', 100, 'A1FIT'),
    (coach_a2,   'coach-a2-test',   'Coach A2',      'A2 Fitness',       'org_managed', 100, 'A2FIT'),
    (owner_b,    'owner-b-test',    'Owner B',       'Owner B Fitness',  'org_managed', 100, 'OWNB1'),
    (coach_b1,   'coach-b1-test',   'Coach B1',      'B1 Fitness',       'org_managed', 100, 'B1FIT'),
    (coach_both, 'coach-both-test', 'Coach Both',    'Both Fitness',     'org_managed', 100, 'BOTH1'),
    (coach_solo, 'coach-solo-test', 'Coach Solo',    'Solo Fitness',     'active',      10,  'SOLO1'),
    (coach_inv,  'coach-inv-test',  'Coach Invited', 'Invited Fitness',  'active',      10,  'INVIT')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 3. Organizations
  -- ============================================================
  INSERT INTO organizations (id, slug, name, owner_user_id, status, seats_included, plan, billing_cycle, onboarding_step)
  VALUES
    (org_a, 'crossfit-test-norte', 'CrossFit Test Norte', owner_a, 'active', 5, 'enterprise', 'monthly', 5),
    (org_b, 'box-test-sur',        'Box Test Sur',        owner_b, 'trial',  3, 'enterprise', 'monthly', 5)
  ON CONFLICT (id) DO NOTHING;

  UPDATE coaches SET active_org_id = org_a WHERE id IN (owner_a, coach_a1, coach_a2, coach_both);
  UPDATE coaches SET active_org_id = org_b WHERE id IN (owner_b, coach_b1);

  -- ============================================================
  -- 4. Organization members
  -- ============================================================
  INSERT INTO organization_members (org_id, coach_id, role, status, joined_at)
  VALUES
    (org_a, owner_a,    'org_owner', 'active',  now()),
    (org_a, coach_a1,   'coach',     'active',  now()),
    (org_a, coach_a2,   'coach',     'active',  now()),
    (org_a, coach_both, 'coach',     'active',  now()),
    (org_b, owner_b,    'org_owner', 'active',  now()),
    (org_b, coach_b1,   'coach',     'active',  now()),
    (org_b, coach_both, 'coach',     'active',  now()),
    (org_b, coach_inv,  'coach',     'invited', now())
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 5. Clients
  -- ============================================================
  -- coach_id = actual assigned coach (mirrors assignClientToCoach behavior)
  -- cb5 defaults to owner_b (unassigned pool client)
  -- onboarding_completed=true para todos los E2E: el middleware redirige a /onboarding si es false/null
  INSERT INTO clients (id, coach_id, org_id, email, full_name, is_active, force_password_change, age_confirmed_at, onboarding_completed)
  VALUES
    -- Org A
    (ca1, coach_a1,   org_a, 'client-a1@eva-test.cl', 'Client A1', true, false, now(), true),
    (ca2, coach_a2,   org_a, 'client-a2@eva-test.cl', 'Client A2', true, false, now(), true),
    (ca3, coach_a2,   org_a, 'client-a3@eva-test.cl', 'Client A3', true, false, now(), true),
    (ca4, coach_both, org_a, 'client-a4@eva-test.cl', 'Client A4', true, false, now(), true),
    (ca5, coach_both, org_a, 'client-a5@eva-test.cl', 'Client A5', true, false, now(), true),
    -- Org B (cb5 queda sin asignar a coach — pool del owner)
    (cb1, coach_b1,   org_b, 'client-b1@eva-test.cl', 'Client B1', true, false, now(), true),
    (cb2, coach_b1,   org_b, 'client-b2@eva-test.cl', 'Client B2', true, false, now(), true),
    (cb3, coach_both, org_b, 'client-b3@eva-test.cl', 'Client B3', true, false, now(), true),
    (cb4, coach_both, org_b, 'client-b4@eva-test.cl', 'Client B4', true, false, now(), true),
    (cb5, owner_b,    org_b, 'client-b5@eva-test.cl', 'Client B5', true, false, now(), true),
    -- Standalone
    (cs1, coach_solo, NULL, 'client-solo1@eva-test.cl', 'Client Solo1', true, false, now(), true),
    (cs2, coach_solo, NULL, 'client-solo2@eva-test.cl', 'Client Solo2', true, false, now(), true),
    (cs3, coach_solo, NULL, 'client-solo3@eva-test.cl', 'Client Solo3', true, false, now(), true)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 6. Coach-client assignments
  -- ============================================================
  INSERT INTO coach_client_assignments (org_id, coach_id, client_id, assigned_by)
  VALUES
    (org_a, coach_a1,   ca1, owner_a),
    (org_a, coach_a2,   ca2, owner_a),
    (org_a, coach_a2,   ca3, owner_a),
    (org_a, coach_both, ca4, owner_a),
    (org_a, coach_both, ca5, owner_a),
    (org_b, coach_b1,   cb1, owner_b),
    (org_b, coach_b1,   cb2, owner_b),
    (org_b, coach_both, cb3, owner_b),
    (org_b, coach_both, cb4, owner_b)
    -- cb5 sin asignar
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 7. Organization invites
  -- ============================================================
  INSERT INTO organization_invites (org_id, email, role, token_hash, expires_at, created_by)
  VALUES
    (org_a, 'new-coach-a@eva-test.cl', 'coach',
     encode(sha256('pending-invite-token-org-a'::bytea), 'hex'),
     now() + interval '7 days', owner_a),
    (org_b, 'expired-coach@eva-test.cl', 'coach',
     encode(sha256('expired-invite-token-org-b'::bytea), 'hex'),
     now() - interval '1 day', owner_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO organization_invites (org_id, email, role, token_hash, expires_at, used_at, created_by)
  VALUES
    (org_a, 'used-coach@eva-test.cl', 'coach',
     encode(sha256('used-invite-token-org-a'::bytea), 'hex'),
     now() + interval '6 days', now() - interval '1 hour', owner_a)
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 8. Auth identities (required for signInWithPassword)
  -- ============================================================
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    id,
    jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true, 'phone_verified', false),
    'email',
    email,
    now(), now(), now()
  FROM auth.users
  WHERE email LIKE '%@eva-test.cl'
  ON CONFLICT DO NOTHING;

END;
$$;
