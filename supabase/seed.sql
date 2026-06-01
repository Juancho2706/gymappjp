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
  org_owner_nocoach uuid := '00000000-0000-0000-0001-000000000009';
  coach_susp uuid := '00000000-0000-0000-0001-000000000010';
  -- Enterprise staff (non-coach roles for multi-role tests)
  staff_ops    uuid := '00000000-0000-0000-0001-000000000011';
  staff_analyst uuid := '00000000-0000-0000-0001-000000000012';
  staff_brand  uuid := '00000000-0000-0000-0001-000000000013';
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
    (coach_inv,  'coach-invited@eva-test.cl',    pw, now(), '{"full_name":"Coach Invited"}'::jsonb,   '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (coach_susp, 'coach-suspended@eva-test.cl', pw, now(), '{"full_name":"Coach Suspended"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (org_owner_nocoach, 'org-owner-nocoach@eva-test.cl', pw, now(), '{"full_name":"Org Owner No Coach"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
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
    (cs3, 'client-solo3@eva-test.cl', pw, now(), '{"full_name":"Client Solo3"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    -- Enterprise staff with non-coach roles (for multi-role tests)
    (staff_ops,     'staff-ops-a@eva-test.cl',     pw, now(), '{"full_name":"Staff Ops A"}'::jsonb,     '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (staff_analyst, 'staff-analyst-a@eva-test.cl', pw, now(), '{"full_name":"Staff Analyst A"}'::jsonb, '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', ''),
    (staff_brand,   'staff-brand-a@eva-test.cl',   pw, now(), '{"full_name":"Staff Brand A"}'::jsonb,   '{"provider":"email","providers":["email"]}'::jsonb, now(), now(), 'authenticated', 'authenticated', false, '00000000-0000-0000-0000-000000000000', '', '', '', '', '')
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
    (coach_inv,  'coach-inv-test',   'Coach Invited',   'Invited Fitness',   'active', 10, 'INVIT'),
    (coach_susp, 'coach-susp-test', 'Coach Suspended', 'Suspended Fitness', 'active', 10, 'SUSP1')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 3. Organizations
  -- ============================================================
  INSERT INTO organizations (id, slug, name, owner_user_id, status, seats_included, plan, billing_cycle, onboarding_step)
  VALUES
    (org_a, 'crossfit-test-norte', 'CrossFit Test Norte', owner_a, 'active', 6, 'enterprise', 'monthly', 5),
    (org_b, 'box-test-sur',        'Box Test Sur',        owner_b, 'trial',  3, 'enterprise', 'monthly', 5)
  ON CONFLICT (id) DO NOTHING;

  UPDATE coaches SET active_org_id = org_a WHERE id IN (owner_a, coach_a1, coach_a2, coach_both);
  UPDATE coaches SET active_org_id = org_b WHERE id IN (owner_b, coach_b1);

  -- ============================================================
  -- 4. Organization members
  -- ============================================================
  INSERT INTO organization_members (org_id, user_id, coach_id, role, status, joined_at)
  VALUES
    (org_a, owner_a,           owner_a,    'org_owner', 'active',  now()),
    (org_a, coach_a1,          coach_a1,   'coach',     'active',  now()),
    (org_a, coach_a2,          coach_a2,   'coach',     'active',  now()),
    (org_a, coach_both,        coach_both, 'coach',     'active',  now()),
    (org_a, org_owner_nocoach, NULL,       'org_admin',      'active',  now()),
    (org_a, staff_ops,         NULL,       'ops',            'active',  now()),
    (org_a, staff_analyst,     NULL,       'analyst',        'active',  now()),
    (org_a, staff_brand,       NULL,       'brand_manager',  'active',  now()),
    (org_b, owner_b,           owner_b,    'org_owner', 'active',  now()),
    (org_b, coach_b1,          coach_b1,   'coach',     'active',  now()),
    (org_b, coach_both,        coach_both, 'coach',     'active',  now()),
    (org_b, coach_inv,         coach_inv,  'coach',     'invited',   now()),
    (org_b, coach_susp,        coach_susp, 'coach',     'suspended', now())
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

  -- organization_invites removed — superseded by direct organization_members creation

  -- ============================================================
  -- 7a. Client payment for ca1 (RLS isolation fixture)
  -- ============================================================
  INSERT INTO client_payments (id, client_id, coach_id, amount, service_description, payment_date, status)
  VALUES (
    '00000000-0000-0000-000a-000000000001',
    ca1, coach_a1, 50000, 'Mensualidad RLS test', current_date, 'paid'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 7b. Check-ins (RLS isolation fixtures — sensitive health data)
  -- ca1 = org_a/coach_a1; cs1 = standalone coach_solo.
  -- Used to assert no cross-client/cross-coach leak of weight/photos/notes.
  -- ============================================================
  INSERT INTO check_ins (id, client_id, date, weight, energy_level, notes)
  VALUES
    ('00000000-0000-0000-0009-000000000001', ca1, current_date, 80.5, 4, 'Org A check-in privado'),
    ('00000000-0000-0000-0009-000000000002', cs1, current_date, 72.0, 5, 'Standalone check-in privado')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 8. Nutrition plan for client-a1 (E2E fixtures)
  -- ============================================================
  INSERT INTO nutrition_plans (id, client_id, coach_id, name, daily_calories, protein_g, carbs_g, fats_g, is_active)
  VALUES (
    '00000000-0000-0000-0006-000000000001',
    ca1, coach_a1,
    'Plan Base E2E',
    2000, 150, 200, 65,
    true
  )
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- 9. Exercises — RLS isolation fixtures
  -- exercise_coach_a1: coach-scoped (coach_a1, org_id=null) — only coach_a1 can see
  -- exercise_org_a:    org-scoped   (org_id=org_a, coach_id=null) — all org_a members
  -- exercise_solo:     standalone   (coach_solo, org_id=null) — only coach_solo
  -- ============================================================
  INSERT INTO exercises (
    id, name, muscle_group, coach_id, org_id, source, instructions, equipment, body_part, difficulty, gender_focus
  )
  VALUES
    (
      '00000000-0000-0000-0007-000000000001',
      'Sentadilla Goblet E2E',
      'Piernas',
      coach_a1, NULL, 'coach',
      ARRAY['Sostén la carga frente al pecho.', 'Baja controlado.', 'Sube empujando el piso.'],
      'Mancuerna', 'Piernas', 'Principiante', 'Neutro'
    ),
    (
      '00000000-0000-0000-0007-000000000002',
      'Remo Org A E2E',
      'Espalda',
      NULL, org_a, 'org',
      ARRAY['Activa espalda.', 'Codo atrás.'],
      'Mancuerna', 'Espalda', 'Intermedio', 'Neutro'
    ),
    (
      '00000000-0000-0000-0007-000000000003',
      'Press Solo E2E',
      'Pecho',
      coach_solo, NULL, 'coach',
      ARRAY['Empuja hacia arriba.'],
      'Barra', 'Pecho', 'Intermedio', 'Neutro'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO workout_programs (
    id, client_id, coach_id, org_id, created_by_coach_id, name, weeks_to_repeat, start_date, is_active,
    duration_type, program_structure_type, start_date_flexible, ab_mode
  )
  VALUES (
    '00000000-0000-0000-0008-000000000001',
    ca1, coach_a1, org_a, coach_a1,
    'Programa Base E2E',
    4,
    current_date,
    true,
    'weeks',
    'weekly',
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO workout_plans (
    id, client_id, coach_id, title, assigned_date, group_name, program_id, day_of_week, week_variant
  )
  VALUES (
    '00000000-0000-0000-0009-000000000001',
    ca1, coach_a1,
    'Rutina Base E2E',
    current_date,
    'Día 1',
    '00000000-0000-0000-0008-000000000001',
    extract(isodow from current_date)::int,
    'A'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO workout_blocks (
    id, plan_id, exercise_id, order_index, sets, reps, rir, rest_time, notes, target_weight_kg, tempo, section
  )
  VALUES (
    '00000000-0000-0000-0010-000000000001',
    '00000000-0000-0000-0009-000000000001',
    '00000000-0000-0000-0007-000000000001',
    0,
    1,
    '8',
    '2',
    '60s',
    'Fixture E2E',
    40,
    '2-0-2',
    'main'
  )
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 10. Auth identities (required for signInWithPassword)
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
