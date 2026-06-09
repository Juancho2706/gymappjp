-- TEAM FOUNDATION — RLS isolation + trigger tests (seed + 13 tests en UNA transaccion)
-- Corre TODO en una transaccion y hace ROLLBACK al final: NO persiste datos (apto para prod o branch).
-- Resultado esperado: una fila 'ALL 13 TESTS PASSED'. Un FAIL hace RAISE EXCEPTION (aborta).
-- Ejecutar via: MCP execute_sql, o psql contra el connection string del proyecto.
-- Cubre: AC1-AC5 (aislamiento + escritura + standalone intacto) + helpers + templates
--        + triggers (owner-only owner/seat_limit, anti-escalacion can_manage, owner-row, seat_limit, audit self-attribution).
-- Aplicado/validado en prod 2026-06-09 (13/13 PASS). Spec: specs/movida-team/.

BEGIN;

-- ===== SEED (efimero) =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('a0000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA1+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('a0000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA2+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('a0000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA3+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachB1+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('c0000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachS1+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoAalpha+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoAbeta+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('b1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoBgamma+teamtest@example.test','x',now(),now(),now(),'{}','{}'),
  ('c1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoSsolo+teamtest@example.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code)
VALUES
  ('a0000000-0000-0000-0000-0000000000a1','teamtest-coach-a1','Coach A1 (owner)','Brand A1','TEAMTEST-A1'),
  ('a0000000-0000-0000-0000-0000000000a2','teamtest-coach-a2','Coach A2 (mgr)','Brand A2','TEAMTEST-A2'),
  ('a0000000-0000-0000-0000-0000000000a3','teamtest-coach-a3','Coach A3','Brand A3','TEAMTEST-A3'),
  ('b0000000-0000-0000-0000-0000000000b1','teamtest-coach-b1','Coach B1 (owner)','Brand B1','TEAMTEST-B1'),
  ('c0000000-0000-0000-0000-0000000000c1','teamtest-coach-s1','Coach S1 (standalone)','Brand S1','TEAMTEST-S1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_accounts (id) VALUES
  ('a1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000001'),('c1000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules)
VALUES
  ('a0000000-0000-0000-0000-00000000aaaa','Team A (teamtest)','teamtest-a','a0000000-0000-0000-0000-0000000000a1',10,'{"workouts":true,"nutrition":true}'::jsonb),
  ('b0000000-0000-0000-0000-00000000bbbb','Team B (teamtest)','teamtest-b','b0000000-0000-0000-0000-0000000000b1',10,'{"workouts":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status)
VALUES
  ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1','Owner',true,'active'),
  ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2','Manager',true,'active'),
  ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3','Coach',false,'active'),
  ('b0000000-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-0000000000b1','Owner',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email)
VALUES
  ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1',NULL,'a0000000-0000-0000-0000-00000000aaaa','Alumno A-alpha','alumnoAalpha+teamtest@example.test'),
  ('a1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000a2',NULL,'a0000000-0000-0000-0000-00000000aaaa','Alumno A-beta','alumnoAbeta+teamtest@example.test'),
  ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-0000000000b1',NULL,'b0000000-0000-0000-0000-00000000bbbb','Alumno B-gamma','alumnoBgamma+teamtest@example.test'),
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1',NULL,NULL,'Alumno S-solo','alumnoSsolo+teamtest@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_memberships (account_id, client_id, scope, coach_id, org_id, team_id, status)
VALUES
  ('a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','team','a0000000-0000-0000-0000-0000000000a1',NULL,'a0000000-0000-0000-0000-00000000aaaa','active'),
  ('a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','team','a0000000-0000-0000-0000-0000000000a2',NULL,'a0000000-0000-0000-0000-00000000aaaa','active'),
  ('b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','team','b0000000-0000-0000-0000-0000000000b1',NULL,'b0000000-0000-0000-0000-00000000bbbb','active'),
  ('c1000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','standalone','c0000000-0000-0000-0000-0000000000c1',NULL,NULL,'active')
ON CONFLICT DO NOTHING;

INSERT INTO public.check_ins (id, client_id, date, notes)
VALUES
  ('a2000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001',now(),'checkin A-alpha'),
  ('c2000000-0000-0000-0000-0000000000c2','c1000000-0000-0000-0000-000000000001',now(),'checkin S-solo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workout_plans (id, client_id, coach_id, title)
VALUES
  ('a3000000-0000-0000-0000-000000000ff1','a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a3','Plan A-alpha by A3'),
  ('a3000000-0000-0000-0000-000000000ff2',NULL,'a0000000-0000-0000-0000-0000000000a2','TEMPLATE pool A by A2')
ON CONFLICT (id) DO NOTHING;

-- ===== TESTS =====
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v_n int; v_b bool; v_s bool; BEGIN
  SELECT count(*) INTO v_n FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa';
  SELECT EXISTS(SELECT 1 FROM public.clients WHERE id='b1000000-0000-0000-0000-000000000001') INTO v_b;
  SELECT EXISTS(SELECT 1 FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000001') INTO v_s;
  IF NOT (v_n=2 AND NOT v_b AND NOT v_s) THEN RAISE EXCEPTION 'TEST1 FAIL pool=% b=% s=%',v_n,v_b,v_s; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v_a int; v_b int; BEGIN
  SELECT count(*) INTO v_a FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa';
  SELECT count(*) INTO v_b FROM public.clients WHERE team_id='b0000000-0000-0000-0000-00000000bbbb';
  IF NOT (v_a=0 AND v_b=1) THEN RAISE EXCEPTION 'TEST2 FAIL seesA=% ownB=%',v_a,v_b; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000001') INTO v;
  IF v THEN RAISE EXCEPTION 'TEST3a FAIL A3 ve standalone'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE v bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000001') INTO v;
  IF NOT v THEN RAISE EXCEPTION 'TEST3b FAIL S1 no ve su cliente'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v_u int; v_i int; BEGIN
  UPDATE public.clients SET full_name=full_name WHERE id='a1000000-0000-0000-0000-000000000002'; GET DIAGNOSTICS v_u=ROW_COUNT;
  INSERT INTO public.check_ins (client_id,date,notes) VALUES ('a1000000-0000-0000-0000-000000000002',now(),'write by A3'); GET DIAGNOSTICS v_i=ROW_COUNT;
  IF NOT (v_u=1 AND v_i=1) THEN RAISE EXCEPTION 'TEST4 FAIL u=% i=%',v_u,v_i; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN INSERT INTO public.check_ins (client_id,date,notes) VALUES ('a1000000-0000-0000-0000-000000000001',now(),'illegal'); RAISE EXCEPTION 'TEST5 FAIL insert cross-team permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'TEST5 FAIL'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE m bool; g bool; mb bool; BEGIN
  m:=public.is_team_member('a0000000-0000-0000-0000-00000000aaaa');
  g:=public.is_team_manager('a0000000-0000-0000-0000-00000000aaaa');
  mb:=public.is_team_member('b0000000-0000-0000-0000-00000000bbbb');
  IF NOT (m AND NOT g AND NOT mb) THEN RAISE EXCEPTION 'TEST6a FAIL m=% g=% mb=%',m,g,mb; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE g bool; BEGIN
  g:=public.is_team_manager('a0000000-0000-0000-0000-00000000aaaa');
  IF NOT g THEN RAISE EXCEPTION 'TEST6b FAIL A2 no es manager'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE t bool; a bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.workout_plans WHERE id='a3000000-0000-0000-0000-000000000ff2' AND client_id IS NULL) INTO t;
  SELECT EXISTS(SELECT 1 FROM public.workout_plans WHERE id='a3000000-0000-0000-0000-000000000ff1') INTO a;
  IF NOT (t AND a) THEN RAISE EXCEPTION 'TEST7 FAIL t=% a=%',t,a; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE t bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.workout_plans WHERE id='a3000000-0000-0000-0000-000000000ff2') INTO t;
  IF t THEN RAISE EXCEPTION 'TEST8 FAIL B1 ve template de A'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE ob bool:=false; sb bool:=false; BEGIN
  BEGIN UPDATE public.teams SET owner_coach_id='a0000000-0000-0000-0000-0000000000a2' WHERE id='a0000000-0000-0000-0000-00000000aaaa'; EXCEPTION WHEN others THEN ob:=true; END;
  BEGIN UPDATE public.teams SET seat_limit=999 WHERE id='a0000000-0000-0000-0000-00000000aaaa'; EXCEPTION WHEN others THEN sb:=true; END;
  IF NOT (ob AND sb) THEN RAISE EXCEPTION 'TEST9 FAIL ownerBlocked=% seatBlocked=%',ob,sb; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.teams SET seat_limit=12 WHERE id='a0000000-0000-0000-0000-00000000aaaa'; GET DIAGNOSTICS u=ROW_COUNT;
  IF u<>1 THEN RAISE EXCEPTION 'TEST9b FAIL u=%',u; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN UPDATE public.team_members SET can_manage=true WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a3'; EXCEPTION WHEN others THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'TEST10 FAIL A2 promovio A3'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE ub bool:=false; db bool:=false; BEGIN
  BEGIN UPDATE public.team_members SET status='revoked' WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a1'; EXCEPTION WHEN others THEN ub:=true; END;
  BEGIN DELETE FROM public.team_members WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a1'; EXCEPTION WHEN others THEN db:=true; END;
  IF NOT (ub AND db) THEN RAISE EXCEPTION 'TEST11 FAIL ub=% db=%',ub,db; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  UPDATE public.teams SET seat_limit=3 WHERE id='a0000000-0000-0000-0000-00000000aaaa';
  BEGIN INSERT INTO public.team_members (team_id,coach_id,display_role,can_manage,status) VALUES ('a0000000-0000-0000-0000-00000000aaaa','b0000000-0000-0000-0000-0000000000b1','Extra',false,'active'); EXCEPTION WHEN others THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'TEST12 FAIL 4to miembro agregado'; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE s int:=0; sb bool:=false; BEGIN
  INSERT INTO public.team_audit_logs (team_id,actor_coach_id,action) VALUES ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3','test.self'); GET DIAGNOSTICS s=ROW_COUNT;
  BEGIN INSERT INTO public.team_audit_logs (team_id,actor_coach_id,action) VALUES ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2','test.spoof'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN sb:=true; END;
  IF NOT (s=1 AND sb) THEN RAISE EXCEPTION 'TEST13 FAIL self=% spoofBlocked=%',s,sb; END IF;
END $$;

RESET ROLE;
SELECT 'ALL 13 TESTS PASSED' AS result;
ROLLBACK;
