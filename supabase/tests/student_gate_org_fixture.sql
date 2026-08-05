-- Fixture de organizacion para el archive gate (fase 0.2 del runbook RLS, 2026-08-05).
-- Las ramas 4 y 5 del conjunto (dueño de organizacion, coach con alumno asignado) no se pueden
-- probar con datos reales: hay 0 clientes con org_id. Este script monta una organizacion
-- sintetica y la derriba en la misma transaccion (ROLLBACK).
--
-- CRITERIO DE PASO: 8 filas, todas con equivalente = true Y semantica_ok = true.
-- Resultado de referencia (2026-08-05): 8/8.
--
-- Gotchas de FK que costaron dos intentos:
--   organization_members.coach_id -> public.coaches (no auth.users)
--   clients.id -> auth.users
BEGIN;
SET LOCAL statement_timeout = '120s';

-- (las mismas dos funciones de student_gate_equivalence.sql; en produccion ya existen,
--  el CREATE OR REPLACE con cuerpo identico es un no-op que mantiene el script autocontenido)
CREATE OR REPLACE FUNCTION private.student_self_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT c.id FROM public.clients c
   WHERE c.id = auth.uid() AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
$fn$;

CREATE OR REPLACE FUNCTION private.student_readable_client_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT c.id FROM public.clients c
   WHERE c.id = auth.uid() AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
  UNION
  SELECT c.id FROM public.clients c
   JOIN public.client_memberships cm ON cm.client_id = c.id
   WHERE cm.account_id = auth.uid() AND cm.deleted_at IS NULL AND cm.status = 'active'
     AND c.is_archived IS NOT TRUE AND c.is_active IS NOT FALSE
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NULL AND c.team_id IS NULL AND c.coach_id = auth.uid()
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.organization_members om
      WHERE om.org_id = c.org_id AND om.user_id = auth.uid()
        AND om.role IN ('org_owner','org_admin')
        AND om.status = 'active' AND om.deleted_at IS NULL)
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.org_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.coach_client_assignments cca
      JOIN public.organization_members om
        ON om.org_id = cca.org_id AND om.coach_id = cca.coach_id
      WHERE cca.client_id = c.id AND cca.org_id = c.org_id AND cca.deleted_at IS NULL
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.deleted_at IS NULL)
  UNION
  SELECT c.id FROM public.clients c
   WHERE c.team_id IS NOT NULL AND EXISTS (
     SELECT 1 FROM public.teams t
      WHERE t.id = c.team_id AND t.deleted_at IS NULL AND (
        t.owner_coach_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.team_members tm
           WHERE tm.team_id = t.id AND tm.coach_id = auth.uid()
             AND tm.status = 'active' AND tm.deleted_at IS NULL)))
$fn$;

CREATE TEMP TABLE _fx(k text, v uuid) ON COMMIT DROP;
DO $do$
DECLARE org uuid := gen_random_uuid(); u_owner uuid; u_coach uuid; u_ajeno uuid; c_a uuid; c_b uuid;
BEGIN
  SELECT co.id INTO u_owner FROM public.coaches co
   WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id=co.id)
   ORDER BY co.id LIMIT 1;
  SELECT co.id INTO u_coach FROM public.coaches co
   WHERE co.id <> u_owner
     AND NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id=co.id)
   ORDER BY co.id OFFSET 1 LIMIT 1;
  SELECT co.id INTO u_ajeno FROM public.coaches co
   WHERE co.id NOT IN (u_owner,u_coach) ORDER BY co.id OFFSET 2 LIMIT 1;
  SELECT au.id INTO c_a FROM auth.users au
   WHERE au.id NOT IN (u_owner,u_coach,u_ajeno)
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=au.id)
   ORDER BY au.created_at LIMIT 1;
  SELECT au.id INTO c_b FROM auth.users au
   WHERE au.id NOT IN (u_owner,u_coach,u_ajeno,c_a)
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=au.id)
   ORDER BY au.created_at OFFSET 1 LIMIT 1;

  INSERT INTO public.organizations (id,name,slug,owner_user_id)
    VALUES (org,'_audit_fixture','_audit_fixture_rollback',u_owner);
  INSERT INTO public.organization_members (id,org_id,user_id,role,status)
    VALUES (gen_random_uuid(),org,u_owner,'org_owner','active');
  INSERT INTO public.organization_members (id,org_id,user_id,role,status,coach_id)
    VALUES (gen_random_uuid(),org,u_coach,'coach','active',u_coach);
  INSERT INTO public.clients (id,email,full_name,org_id) VALUES
    (c_a,'_fx_a@audit.invalid','Fixture A sin asignar',org),
    (c_b,'_fx_b@audit.invalid','Fixture B asignada',org);
  INSERT INTO public.coach_client_assignments (id,org_id,coach_id,client_id)
    VALUES (gen_random_uuid(),org,u_coach,c_b);

  INSERT INTO _fx VALUES ('1_org_owner',u_owner),('2_org_coach',u_coach),
    ('3_coach_ajeno',u_ajeno),('4_alumno_c_a',c_a),('A_sin_asignar',c_a),('B_asignada',c_b);
END $do$;

CREATE TEMP TABLE _res(actor text, target text, viejo bool, nuevo bool) ON COMMIT DROP;
DO $do$
DECLARE a record; t record;
BEGIN
  FOR a IN (SELECT k, v FROM _fx WHERE k ~ '^[0-9]') LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', a.v::text,'role','authenticated')::text, true);
    FOR t IN (SELECT k, v FROM _fx WHERE k IN ('A_sin_asignar','B_asignada')) LOOP
      INSERT INTO _res
      SELECT a.k, t.k,
             coalesce(private.student_data_read_gate(t.v), false),
             COALESCE(t.v IS NULL
               OR t.v = (SELECT private.student_self_client_id())
               OR t.v = ANY(ARRAY(SELECT private.student_readable_client_ids()))
             , false);
    END LOOP;
  END LOOP;
END $do$;

-- comparar gate viejo vs expresion nueva Y contra lo que la semantica DEBERIA dar:
-- el dueño ve a los dos, el coach org solo al asignado, el ajeno a ninguno, el alumno a si mismo
SELECT r.actor, r.target, r.viejo, r.nuevo,
       (r.viejo = r.nuevo) AS equivalente,
       e.esperado,
       (r.nuevo = e.esperado) AS semantica_ok
  FROM _res r
  JOIN (VALUES
    ('1_org_owner','A_sin_asignar',true),
    ('1_org_owner','B_asignada',true),
    ('2_org_coach','A_sin_asignar',false),
    ('2_org_coach','B_asignada',true),
    ('3_coach_ajeno','A_sin_asignar',false),
    ('3_coach_ajeno','B_asignada',false),
    ('4_alumno_c_a','A_sin_asignar',true),
    ('4_alumno_c_a','B_asignada',false)
  ) e(actor,target,esperado) ON e.actor = r.actor AND e.target = r.target
 ORDER BY r.actor, r.target;

ROLLBACK;
