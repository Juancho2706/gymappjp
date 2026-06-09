-- WITH CHECK ownership hardening — valida la migracion 20260609180000.
-- nutrition_plans / workout_plans / workout_programs / nutrition_plan_cycles / nutrition_plan_history:
-- un coach SOLO puede INSERTAR un recurso top-level para un cliente que gestiona (propio standalone,
-- o pool via team policy, o org-admin/asignado en enterprise). Templates (client_id NULL) permitidos.
-- tx + ROLLBACK (no persiste; apto prod). Esperado: 'HARDENING VALIDATED'. FAIL = RAISE EXCEPTION.
-- Requiere la migracion 20260609180000 aplicada. Validado en prod 2026-06-09.
BEGIN;
INSERT INTO auth.users (id) VALUES
 ('c0000000-0000-0000-0000-0000000000c1'),('a0000000-0000-0000-0000-0000000000a1'),('a0000000-0000-0000-0000-0000000000a3'),
 ('e0000000-0000-0000-0000-0000000000ea'),('e0000000-0000-0000-0000-0000000000ec'),
 ('c1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000001'),('e1000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('c0000000-0000-0000-0000-0000000000c1','hd-s1','S1','S1','HD-S1'),
 ('a0000000-0000-0000-0000-0000000000a1','hd-a1','A1','A1','HD-A1'),
 ('a0000000-0000-0000-0000-0000000000a3','hd-a3','A3','A3','HD-A3'),
 ('e0000000-0000-0000-0000-0000000000ea','hd-ea','E-admin','EA','HD-EA'),
 ('e0000000-0000-0000-0000-0000000000ec','hd-ec','E-coach','EC','HD-EC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_accounts (id) VALUES
 ('c1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000001'),('e1000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, slug, name, owner_user_id) VALUES
 ('e0000000-0000-0000-0000-0000000000f0','hd-org','HD Org','e0000000-0000-0000-0000-0000000000ea') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (org_id, user_id, coach_id, role, status) VALUES
 ('e0000000-0000-0000-0000-0000000000f0','e0000000-0000-0000-0000-0000000000ea','e0000000-0000-0000-0000-0000000000ea','org_owner','active'),
 ('e0000000-0000-0000-0000-0000000000f0','e0000000-0000-0000-0000-0000000000ec','e0000000-0000-0000-0000-0000000000ec','coach','active')
ON CONFLICT DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','HD TeamA','hd-team-a','a0000000-0000-0000-0000-0000000000a1',10) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
 ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1',NULL,NULL,'S-solo','hd-ss@t.local'),
 ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1',NULL,'a0000000-0000-0000-0000-00000000aaaa','A-alpha','hd-aa@t.local'),
 ('e1000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000ec','e0000000-0000-0000-0000-0000000000f0',NULL,'E-client','hd-ec@t.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coach_client_assignments (org_id, coach_id, client_id) VALUES
 ('e0000000-0000-0000-0000-0000000000f0','e0000000-0000-0000-0000-0000000000ec','e1000000-0000-0000-0000-0000000000c1') ON CONFLICT DO NOTHING;
INSERT INTO public.nutrition_plans (id, client_id, coach_id, name) VALUES
 ('d4000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','np_s seed') ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
-- STANDALONE S1: propio OK + ajeno BLOCK
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE i int; blk boolean; BEGIN
  INSERT INTO public.nutrition_plans (client_id,coach_id,name) VALUES ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','np own'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H1 np own=%',i; END IF;
  INSERT INTO public.workout_programs (coach_id,client_id,name) VALUES ('c0000000-0000-0000-0000-0000000000c1','c1000000-0000-0000-0000-000000000001','wp own'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H2 wprog own=%',i; END IF;
  INSERT INTO public.workout_programs (coach_id,client_id,name) VALUES ('c0000000-0000-0000-0000-0000000000c1',NULL,'wp tmpl'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H3 wprog tmpl=%',i; END IF;
  INSERT INTO public.workout_plans (coach_id,client_id,title) VALUES ('c0000000-0000-0000-0000-0000000000c1','c1000000-0000-0000-0000-000000000001','wpl own'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H4 wplan own=%',i; END IF;
  INSERT INTO public.workout_plans (coach_id,client_id,title) VALUES ('c0000000-0000-0000-0000-0000000000c1',NULL,'wpl tmpl'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H5 wplan tmpl=%',i; END IF;
  INSERT INTO public.nutrition_plan_cycles (coach_id,client_id,name,start_date) VALUES ('c0000000-0000-0000-0000-0000000000c1','c1000000-0000-0000-0000-000000000001','cyc',current_date); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H6 cyc own=%',i; END IF;
  INSERT INTO public.nutrition_plan_history (coach_id,client_id,nutrition_plan_id,snapshot) VALUES ('c0000000-0000-0000-0000-0000000000c1','c1000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','{}'::jsonb); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H7 hist own=%',i; END IF;
  blk:=false; BEGIN INSERT INTO public.nutrition_plans (client_id,coach_id,name) VALUES ('a1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','hack'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'H8 np other NO bloqueado'; END IF;
  blk:=false; BEGIN INSERT INTO public.workout_programs (coach_id,client_id,name) VALUES ('c0000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001','hack'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'H9 wprog other NO bloqueado'; END IF;
  blk:=false; BEGIN INSERT INTO public.workout_plans (coach_id,client_id,title) VALUES ('c0000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001','hack'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'H10 wplan other NO bloqueado'; END IF;
  blk:=false; BEGIN INSERT INTO public.nutrition_plan_cycles (coach_id,client_id,name,start_date) VALUES ('c0000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001','hack',current_date); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'H11 cyc other NO bloqueado'; END IF;
  blk:=false; BEGIN INSERT INTO public.nutrition_plan_history (coach_id,client_id,nutrition_plan_id,snapshot) VALUES ('c0000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001','d4000000-0000-0000-0000-000000000001','{}'::jsonb); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'H12 hist other NO bloqueado'; END IF;
END $$;
-- POOL A3 (team): puede crear plan/wplan para el alumno del pool
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE i int; BEGIN
  INSERT INTO public.nutrition_plans (client_id,coach_id,name) VALUES ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a3','np pool'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H13 np pool=%',i; END IF;
  INSERT INTO public.workout_plans (coach_id,client_id,title) VALUES ('a0000000-0000-0000-0000-0000000000a3','a1000000-0000-0000-0000-000000000001','wpl pool'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H14 wplan pool=%',i; END IF;
END $$;
-- ENTERPRISE coach asignado + admin: OK (ramas org intactas)
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000ec","role":"authenticated"}';
DO $$ DECLARE i int; BEGIN
  INSERT INTO public.nutrition_plans (client_id,coach_id,org_id,name) VALUES ('e1000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000ec','e0000000-0000-0000-0000-0000000000f0','np ent'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H15 np ent coach=%',i; END IF;
  INSERT INTO public.workout_plans (coach_id,client_id,title) VALUES ('e0000000-0000-0000-0000-0000000000ec','e1000000-0000-0000-0000-0000000000c1','wpl ent'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H16 wplan ent coach=%',i; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000ea","role":"authenticated"}';
DO $$ DECLARE i int; BEGIN
  INSERT INTO public.nutrition_plans (client_id,coach_id,org_id,name) VALUES ('e1000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000ea','e0000000-0000-0000-0000-0000000000f0','np ent admin'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'H17 np ent admin=%',i; END IF;
END $$;
RESET ROLE;
SELECT 'HARDENING VALIDATED' AS result;
ROLLBACK;
