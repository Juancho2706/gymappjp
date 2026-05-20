-- EVA Enterprise local demo: Gimnasio Movida
-- Ambiente esperado: esta rama + Supabase local Docker + seed enterprise.
-- Password seed para usuarios demo: TestPass123!

BEGIN;

-- Org A seed -> Movida
UPDATE organizations
SET
  name = 'MOVIDA',
  slug = 'movida',
  primary_color = '#00B4D8',
  logo_url = '/logomovida.png',
  status = 'active',
  plan = 'enterprise',
  billing_cycle = 'monthly',
  seats_included = 5,
  client_limit = 500,
  onboarding_step = 5,
  last_health_score = 82,
  last_health_score_at = now()
WHERE id = '00000000-0000-0000-0002-000000000001';

-- Owner/admin Movida
UPDATE coaches
SET
  full_name = 'Eduardo Villegas (Admin Movida)',
  brand_name = 'Movida Corporativo',
  primary_color = '#00B4D8',
  logo_url = '/logomovida.png',
  subscription_status = 'org_managed',
  active_org_id = '00000000-0000-0000-0002-000000000001'
WHERE id = '00000000-0000-0000-0001-000000000001';

-- Staff enterprise Movida
UPDATE coaches
SET
  full_name = 'Coach Carlos (Movida Sede Norte)',
  brand_name = 'Movida Fitness',
  primary_color = '#00B4D8',
  logo_url = '/logomovida.png',
  subscription_status = 'org_managed',
  active_org_id = '00000000-0000-0000-0002-000000000001'
WHERE id = '00000000-0000-0000-0001-000000000002';

UPDATE coaches
SET
  full_name = 'Coach Daniela (Movida Sede Sur)',
  brand_name = 'Movida Performance',
  primary_color = '#00B4D8',
  logo_url = '/logomovida.png',
  subscription_status = 'org_managed',
  active_org_id = '00000000-0000-0000-0002-000000000001'
WHERE id = '00000000-0000-0000-0001-000000000003';

-- Alumnos demo Movida
UPDATE clients
SET
  full_name = 'Martin Silva (Alumno Movida Sede Norte)',
  org_id = '00000000-0000-0000-0002-000000000001',
  coach_id = '00000000-0000-0000-0001-000000000002',
  is_active = true
WHERE id = '00000000-0000-0000-0003-000000000001';

UPDATE clients
SET
  full_name = 'Sofia Castro (Alumna Movida Sede Sur)',
  org_id = '00000000-0000-0000-0002-000000000001',
  coach_id = '00000000-0000-0000-0001-000000000003',
  is_active = true
WHERE id = '00000000-0000-0000-0003-000000000002';

-- Mantener asignaciones consistentes.
INSERT INTO coach_client_assignments (org_id, coach_id, client_id, assigned_by)
VALUES
  (
    '00000000-0000-0000-0002-000000000001',
    '00000000-0000-0000-0001-000000000002',
    '00000000-0000-0000-0003-000000000001',
    '00000000-0000-0000-0001-000000000001'
  ),
  (
    '00000000-0000-0000-0002-000000000001',
    '00000000-0000-0000-0001-000000000003',
    '00000000-0000-0000-0003-000000000002',
    '00000000-0000-0000-0001-000000000001'
  )
ON CONFLICT (org_id, client_id)
DO UPDATE SET
  coach_id = EXCLUDED.coach_id,
  assigned_by = EXCLUDED.assigned_by,
  assigned_at = now();

INSERT INTO org_audit_logs (org_id, actor_id, action, target_type, target_id, metadata)
VALUES (
  '00000000-0000-0000-0002-000000000001',
  '00000000-0000-0000-0001-000000000001',
  'demo_movida_prepared',
  'organization',
  '00000000-0000-0000-0002-000000000001',
  '{"source":"docs/MOVIDA_LOCAL_DEMO.sql","environment":"local_supabase_docker"}'::jsonb
);

COMMIT;
