-- Plan 2 Movida (entrenamiento) F1 — RLS catalogo exercises (tipo + ownership team). tx + ROLLBACK (no persiste).
-- Requiere migracion 20260611090001_exercise_types_team_catalog aplicada. Esperado: 'ALL PASSED'.
-- Asserts (SPEC AC6 + PLAN F1): team A no ve B; standalone no ve team; alumno del pool lee su team;
-- system intacto (visible a todos, NO editable ni insertable por authenticated); UPDATE re-apuntando
-- team_id A->B RECHAZADO por WITH CHECK; UPDATE re-apuntando a una ORG (team_id=NULL, org_id=X)
-- RECHAZADO con 42501 (hueco cross-policy de exercises_org_update cerrado en M1); CHECK
-- single-owner; CHECK exercise_type.
-- Full-access plano: el assert de escritura team usa un miembro SIN can_manage (c2).
-- Correr en el gate autorizado (branch efimero), NUNCA como service_role.
BEGIN;

-- ───── seed sintetico (superuser, pre-identidades) ─────
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('ecca0000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exiso_c1@e.test','x',now(),now(),now(),'{}','{}'),
  ('ecca0000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exiso_c2@e.test','x',now(),now(),now(),'{}','{}'),
  ('ecca0000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exiso_c3@e.test','x',now(),now(),now(),'{}','{}'),
  ('ecca0000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exiso_c4@e.test','x',now(),now(),now(),'{}','{}'),
  ('ecca0000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exiso_a1@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('ecca0000-0000-0000-0000-0000000000c1','exiso-c1','C1 owner A','B1','EXISO-C1'),
  ('ecca0000-0000-0000-0000-0000000000c2','exiso-c2','C2 member A','B2','EXISO-C2'),
  ('ecca0000-0000-0000-0000-0000000000c3','exiso-c3','C3 standalone','B3','EXISO-C3'),
  ('ecca0000-0000-0000-0000-0000000000c4','exiso-c4','C4 owner B','B4','EXISO-C4')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
  ('ecca0000-0000-0000-0000-00000000aaaa','EXISO Team A','exiso-team-a','ecca0000-0000-0000-0000-0000000000c1',10),
  ('ecca0000-0000-0000-0000-00000000bbbb','EXISO Team B','exiso-team-b','ecca0000-0000-0000-0000-0000000000c4',10)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
  ('ecca0000-0000-0000-0000-00000000aaaa','ecca0000-0000-0000-0000-0000000000c1',true,'active'),
  ('ecca0000-0000-0000-0000-00000000aaaa','ecca0000-0000-0000-0000-0000000000c2',false,'active'),
  ('ecca0000-0000-0000-0000-00000000bbbb','ecca0000-0000-0000-0000-0000000000c4',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
-- org sintetica ajena a c2 (owner = c4): target del vector de inyeccion TEAM->ORG (T2f).
-- Existe en organizations para que el FK exercises.org_id no enmascare el assert (el bloqueo
-- esperado es RLS 42501, no 23503).
INSERT INTO public.organizations (id, slug, name, owner_user_id) VALUES
  ('ecca0000-0000-0000-0000-00000000ee99','exiso-org','EXISO Org ajena','ecca0000-0000-0000-0000-0000000000c4')
ON CONFLICT (id) DO NOTHING;
-- alumno del pool A (sin coach_id: pool plano)
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
  ('ecca0000-0000-0000-0000-0000000000a1', NULL, NULL, 'ecca0000-0000-0000-0000-00000000aaaa', 'Alumno pool A', 'exiso-a1@t.local')
ON CONFLICT (id) DO NOTHING;
-- catalogo: system (3 owners NULL), team A, team B, personal de c3
INSERT INTO public.exercises (id, name, muscle_group, exercise_type) VALUES
  ('ecca0000-0000-0000-0000-00000000e000','EXISO system row','full_body','strength') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.exercises (id, name, muscle_group, exercise_type, team_id) VALUES
  ('ecca0000-0000-0000-0000-00000000e0aa','EXISO team A row','full_body','mobility','ecca0000-0000-0000-0000-00000000aaaa'),
  ('ecca0000-0000-0000-0000-00000000e0bb','EXISO team B row','full_body','cardio','ecca0000-0000-0000-0000-00000000bbbb')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.exercises (id, name, muscle_group, coach_id) VALUES
  ('ecca0000-0000-0000-0000-00000000e0c3','EXISO c3 personal','full_body','ecca0000-0000-0000-0000-0000000000c3')
ON CONFLICT (id) DO NOTHING;

-- ───── T0 (superuser): CHECKs de dominio y single-owner ─────
DO $t0$ BEGIN
  BEGIN
    INSERT INTO public.exercises (name, muscle_group, exercise_type) VALUES ('EXISO bad type','full_body','yoga');
    RAISE EXCEPTION 'T0a FAIL exercise_type invalido acepto';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.exercises (name, muscle_group, coach_id, team_id)
      VALUES ('EXISO dual owner','full_body','ecca0000-0000-0000-0000-0000000000c2','ecca0000-0000-0000-0000-00000000aaaa');
    RAISE EXCEPTION 'T0b FAIL dual owner (coach+team) acepto';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $t0$;

-- ───── T1-T3 como c2 (miembro team A SIN can_manage: full-access plano) ─────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ecca0000-0000-0000-0000-0000000000c2","role":"authenticated"}',true);
DO $t1$ DECLARE v_sys bool; v_ta bool; v_tb bool; v_c3 bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e000') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0aa') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0bb') INTO v_tb;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0c3') INTO v_c3;
  IF NOT (v_sys AND v_ta AND NOT v_tb AND NOT v_c3) THEN
    RAISE EXCEPTION 'T1 FAIL c2 sys=% teamA=% teamB=% c3own=%', v_sys, v_ta, v_tb, v_c3;
  END IF;
END $t1$;
DO $t2$ DECLARE v_upd int; v_ins int; BEGIN
  -- miembro (no manager) edita la fila del team: full-access plano
  UPDATE public.exercises SET name='EXISO team A row v2' WHERE id='ecca0000-0000-0000-0000-00000000e0aa';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T2a FAIL miembro no edito fila team rows=%', v_upd; END IF;
  -- re-apuntar team_id A->B: WITH CHECK lo rechaza (inyeccion cross-team, AC6)
  BEGIN
    UPDATE public.exercises SET team_id='ecca0000-0000-0000-0000-00000000bbbb' WHERE id='ecca0000-0000-0000-0000-00000000e0aa';
    RAISE EXCEPTION 'T2b FAIL re-apuntar team_id A->B acepto';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- alta system por authenticated: prohibida (system intacto, decision #11)
  BEGIN
    INSERT INTO public.exercises (name, muscle_group) VALUES ('EXISO fake system','full_body');
    RAISE EXCEPTION 'T2c FAIL insert system por authenticated acepto';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- alta en team ajeno: prohibida
  BEGIN
    INSERT INTO public.exercises (name, muscle_group, team_id) VALUES ('EXISO inject B','full_body','ecca0000-0000-0000-0000-00000000bbbb');
    RAISE EXCEPTION 'T2d FAIL insert en team ajeno acepto';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- alta en team propio con tipo: permitida
  INSERT INTO public.exercises (id, name, muscle_group, exercise_type, team_id)
    VALUES ('ecca0000-0000-0000-0000-00000000e0a2','EXISO team A cardio','full_body','cardio','ecca0000-0000-0000-0000-00000000aaaa');
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T2e FAIL insert team propio rows=%', v_ins; END IF;
  -- re-apuntar fila team a una ORG ajena (team_id=NULL, org_id=X): el USING de exercises_team_update
  -- pasa (fila vieja es del team A), pero NINGUN WITH CHECK acepta el row nuevo — exercises_org_update
  -- ahora exige is_org_admin_member(org_id). Debe fallar EXACTAMENTE con 42501 (inyeccion TEAM->ORG).
  BEGIN
    UPDATE public.exercises SET team_id=NULL, org_id='ecca0000-0000-0000-0000-00000000ee99'
      WHERE id='ecca0000-0000-0000-0000-00000000e0aa';
    RAISE EXCEPTION 'T2f FAIL re-apuntar fila team a org ajena acepto';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t2$;
DO $t3$ DECLARE v_upd int; BEGIN
  UPDATE public.exercises SET name='hacked' WHERE id='ecca0000-0000-0000-0000-00000000e000';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T3 FAIL authenticated edito fila system rows=%', v_upd; END IF;
END $t3$;
RESET role;

-- ───── T4 como c3 (coach standalone, ajeno a ambos teams) ─────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ecca0000-0000-0000-0000-0000000000c3","role":"authenticated"}',true);
DO $t4$ DECLARE v_sys bool; v_ta bool; v_tb bool; v_own bool; v_upd int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e000') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0aa') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0bb') INTO v_tb;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0c3') INTO v_own;
  IF NOT (v_sys AND NOT v_ta AND NOT v_tb AND v_own) THEN
    RAISE EXCEPTION 'T4a FAIL c3 sys=% teamA=% teamB=% own=%', v_sys, v_ta, v_tb, v_own;
  END IF;
  UPDATE public.exercises SET name='x' WHERE id='ecca0000-0000-0000-0000-00000000e0aa';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T4b FAIL standalone edito fila team rows=%', v_upd; END IF;
  BEGIN
    INSERT INTO public.exercises (name, muscle_group, team_id) VALUES ('EXISO inject A','full_body','ecca0000-0000-0000-0000-00000000aaaa');
    RAISE EXCEPTION 'T4c FAIL standalone inserto en team ajeno';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t4$;
RESET role;

-- ───── T5 como a1 (alumno del pool team A) ─────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ecca0000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
DO $t5$ DECLARE v_sys bool; v_ta bool; v_tb bool; v_c3 bool; v_upd int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e000') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0aa') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0bb') INTO v_tb;
  SELECT EXISTS(SELECT 1 FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e0c3') INTO v_c3;
  IF NOT (v_sys AND v_ta AND NOT v_tb AND NOT v_c3) THEN
    RAISE EXCEPTION 'T5a FAIL alumno sys=% teamA=% teamB=% c3own=%', v_sys, v_ta, v_tb, v_c3;
  END IF;
  UPDATE public.exercises SET name='x' WHERE id='ecca0000-0000-0000-0000-00000000e0aa';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T5b FAIL alumno edito catalogo team rows=%', v_upd; END IF;
END $t5$;
RESET role;

-- ───── T6 (superuser): system intacto al cierre ─────
DO $t6$ DECLARE v_name text; BEGIN
  SELECT name INTO v_name FROM public.exercises WHERE id='ecca0000-0000-0000-0000-00000000e000';
  IF v_name IS DISTINCT FROM 'EXISO system row' THEN RAISE EXCEPTION 'T6 FAIL system row mutada name=%', v_name; END IF;
END $t6$;

SELECT 'ALL PASSED' AS status;
ROLLBACK;
