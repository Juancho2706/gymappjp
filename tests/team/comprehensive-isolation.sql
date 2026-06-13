-- COMPREHENSIVE team/standalone/enterprise isolation — TODO el trabajo Movida hasta 2026-06-09.
-- tx + ROLLBACK (no persiste; apto prod). Esperado: fila 'ALL COMPREHENSIVE PASSED'. FAIL = RAISE EXCEPTION.
-- Cubre: deep child-data (nutrition_plans/meals/food_items, daily_nutrition_logs/meal_logs, workout_blocks,
--        check_ins, client_food_preferences, daily_habits, client_payments, client_intake) con WITH CHECK
--        adversarial; STANDALONE regresion (coach sin team intacto); ENTERPRISE aislamiento; helpers
--        optimizados (current_user_*_ids); APP-QUERY-SHAPES (replica exacta del WHERE de la app); revocacion.
-- Actores: A1(owner TeamA), A2(mgr can_manage), A3(member), B1(owner TeamB), S1(standalone), E1(enterprise org).
--
-- NOTA: habia un gap PRE-EXISTENTE (baseline) en el WITH CHECK standalone de nutrition_plans /
-- workout_plans / workout_programs / nutrition_plan_cycles / nutrition_plan_history (coach_id=auth.uid()
-- sin verificar propiedad del cliente). CERRADO por la migracion 20260609180000_harden_standalone_
-- withcheck_client_ownership (exige EXISTS clients del coach). G3.6 ahora asserta el bloqueo.
-- Tablas hijas (nutrition_meals/food_items/daily_logs/blocks) ya estaban encadenadas (seguras).
BEGIN;

-- ===================== SEED =====================
INSERT INTO auth.users (id) VALUES
 ('a0000000-0000-0000-0000-0000000000a1'),('a0000000-0000-0000-0000-0000000000a2'),('a0000000-0000-0000-0000-0000000000a3'),
 ('b0000000-0000-0000-0000-0000000000b1'),('c0000000-0000-0000-0000-0000000000c1'),('e0000000-0000-0000-0000-0000000000e1'),
 ('a1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000002'),
 ('b1000000-0000-0000-0000-000000000001'),('c1000000-0000-0000-0000-000000000001'),('e1000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('a0000000-0000-0000-0000-0000000000a1','cmp-a1','Coach A1','BA1','CMP-A1'),
 ('a0000000-0000-0000-0000-0000000000a2','cmp-a2','Coach A2','BA2','CMP-A2'),
 ('a0000000-0000-0000-0000-0000000000a3','cmp-a3','Coach A3','BA3','CMP-A3'),
 ('b0000000-0000-0000-0000-0000000000b1','cmp-b1','Coach B1','BB1','CMP-B1'),
 ('c0000000-0000-0000-0000-0000000000c1','cmp-s1','Coach S1','BS1','CMP-S1'),
 ('e0000000-0000-0000-0000-0000000000e1','cmp-e1','Coach E1','BE1','CMP-E1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, slug, name, owner_user_id) VALUES
 ('e0000000-0000-0000-0000-0000000000f0','cmp-org','CMP Org','e0000000-0000-0000-0000-0000000000e1') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','TeamA','cmp-team-a','a0000000-0000-0000-0000-0000000000a1',10,'{"cardio":true,"body_composition":true}'::jsonb),
 ('b0000000-0000-0000-0000-00000000bbbb','TeamB','cmp-team-b','b0000000-0000-0000-0000-0000000000b1',10,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1','Owner',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2','Mgr',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3','Coach',false,'active'),
 ('b0000000-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-0000000000b1','Owner',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

INSERT INTO public.client_accounts (id) VALUES
 ('a1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000002'),
 ('b1000000-0000-0000-0000-000000000001'),('c1000000-0000-0000-0000-000000000001'),('e1000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email, is_archived) VALUES
 ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1',NULL,'a0000000-0000-0000-0000-00000000aaaa','A-alpha','cmp-aa@t.local',false),
 ('a1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-0000000000a2',NULL,'a0000000-0000-0000-0000-00000000aaaa','A-beta','cmp-ab@t.local',false),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-0000000000b1',NULL,'b0000000-0000-0000-0000-00000000bbbb','B-gamma','cmp-bg@t.local',false),
 ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1',NULL,NULL,'S-solo','cmp-ss@t.local',false),
 ('e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000e1','e0000000-0000-0000-0000-0000000000f0',NULL,'E-ent','cmp-ee@t.local',false)
ON CONFLICT (id) DO NOTHING;

-- nutrition chains (plan -> meal -> food_item ; daily_log -> meal_log) para A-alpha (TeamA), B-gamma (TeamB), S-solo (standalone)
INSERT INTO public.nutrition_plans (id, client_id, coach_id, name) VALUES
 ('a4000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1','NP A-alpha'),
 ('b4000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-0000000000b1','NP B-gamma'),
 ('c4000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','NP S-solo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_meals (id, plan_id, name) VALUES
 ('a4000000-0000-0000-0000-000000000010','a4000000-0000-0000-0000-000000000001','Meal A'),
 ('b4000000-0000-0000-0000-000000000010','b4000000-0000-0000-0000-000000000001','Meal B')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.food_items (id, meal_id, food_id, quantity) VALUES
 ('a4000000-0000-0000-0000-000000000100','a4000000-0000-0000-0000-000000000010',(SELECT id FROM public.foods LIMIT 1),100),
 ('b4000000-0000-0000-0000-000000000100','b4000000-0000-0000-0000-000000000010',(SELECT id FROM public.foods LIMIT 1),100)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.daily_nutrition_logs (id, client_id, plan_id, log_date) VALUES
 ('a4000000-0000-0000-0000-000000001000','a1000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',current_date),
 ('b4000000-0000-0000-0000-000000001000','b1000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001',current_date)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_meal_logs (id, daily_log_id, meal_id) VALUES
 ('a4000000-0000-0000-0000-000000001100','a4000000-0000-0000-0000-000000001000','a4000000-0000-0000-0000-000000000010'),
 ('b4000000-0000-0000-0000-000000001100','b4000000-0000-0000-0000-000000001000','b4000000-0000-0000-0000-000000000010')
ON CONFLICT (id) DO NOTHING;

-- workout plan + block para A-alpha (autor A3) y template pool por A2
INSERT INTO public.workout_plans (id, client_id, coach_id, title) VALUES
 ('a3000000-0000-0000-0000-000000000ff1','a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a3','Plan A-alpha'),
 ('a3000000-0000-0000-0000-000000000ff2',NULL,'a0000000-0000-0000-0000-0000000000a2','TEMPLATE pool A')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workout_blocks (id, plan_id, exercise_id, order_index, section) VALUES
 ('a3000000-0000-0000-0000-00000000bbb1','a3000000-0000-0000-0000-000000000ff1',(SELECT id FROM public.exercises LIMIT 1),0,'main')
ON CONFLICT (id) DO NOTHING;

-- tablas hijas directas para A-alpha
INSERT INTO public.check_ins (id, client_id, date, notes) VALUES ('a2000000-0000-0000-0000-0000000000c1','a1000000-0000-0000-0000-000000000001',now(),'ci A-alpha') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_food_preferences (client_id, food_id, preference_type) VALUES ('a1000000-0000-0000-0000-000000000001',(SELECT id FROM public.foods LIMIT 1),'dislike') ON CONFLICT DO NOTHING;
INSERT INTO public.daily_habits (id, client_id, log_date) VALUES ('a2000000-0000-0000-0000-0000000000d1','a1000000-0000-0000-0000-000000000001',current_date) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_payments (id, client_id, coach_id, amount, service_description) VALUES ('a2000000-0000-0000-0000-0000000000e2','a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000a1',100,'plan') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_intake (id, client_id, weight_kg, height_cm, goals, experience_level, availability) VALUES ('a2000000-0000-0000-0000-0000000000a5','a1000000-0000-0000-0000-000000000001',70,175,'fuerza','intermedio','3x') ON CONFLICT (id) DO NOTHING;

-- ===================== TESTS =====================
SET LOCAL ROLE authenticated;

-- ---------- GRUPO 1: DEEP CHILD-DATA (member A3 ve TODO de A-alpha; outsiders NO) ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.nutrition_plans WHERE id='a4000000-0000-0000-0000-000000000001'; IF v<>1 THEN RAISE EXCEPTION 'G1.1 np A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.nutrition_meals WHERE id='a4000000-0000-0000-0000-000000000010'; IF v<>1 THEN RAISE EXCEPTION 'G1.2 meal A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.food_items WHERE id='a4000000-0000-0000-0000-000000000100'; IF v<>1 THEN RAISE EXCEPTION 'G1.3 food_item A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.daily_nutrition_logs WHERE id='a4000000-0000-0000-0000-000000001000'; IF v<>1 THEN RAISE EXCEPTION 'G1.4 dnl A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.nutrition_meal_logs WHERE id='a4000000-0000-0000-0000-000000001100'; IF v<>1 THEN RAISE EXCEPTION 'G1.5 nml A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.workout_blocks WHERE id='a3000000-0000-0000-0000-00000000bbb1'; IF v<>1 THEN RAISE EXCEPTION 'G1.6 block A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.check_ins WHERE id='a2000000-0000-0000-0000-0000000000c1'; IF v<>1 THEN RAISE EXCEPTION 'G1.7 checkin A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.client_food_preferences WHERE client_id='a1000000-0000-0000-0000-000000000001'; IF v<>1 THEN RAISE EXCEPTION 'G1.8 foodpref A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.daily_habits WHERE id='a2000000-0000-0000-0000-0000000000d1'; IF v<>1 THEN RAISE EXCEPTION 'G1.9 habit A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.client_payments WHERE id='a2000000-0000-0000-0000-0000000000e2'; IF v<>1 THEN RAISE EXCEPTION 'G1.10 payment A3 ve=%',v; END IF;
  SELECT count(*) INTO v FROM public.client_intake WHERE id='a2000000-0000-0000-0000-0000000000a5'; IF v<>1 THEN RAISE EXCEPTION 'G1.11 intake A3 ve=%',v; END IF;
END $$;

-- ---------- GRUPO 2: CROSS-TEAM (B1 NO ve nada de A-alpha) ----------
SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.nutrition_plans WHERE id='a4000000-0000-0000-0000-000000000001'; IF v<>0 THEN RAISE EXCEPTION 'G2.1 B1 ve np A=%',v; END IF;
  SELECT count(*) INTO v FROM public.food_items WHERE id='a4000000-0000-0000-0000-000000000100'; IF v<>0 THEN RAISE EXCEPTION 'G2.2 B1 ve food A=%',v; END IF;
  SELECT count(*) INTO v FROM public.nutrition_meal_logs WHERE id='a4000000-0000-0000-0000-000000001100'; IF v<>0 THEN RAISE EXCEPTION 'G2.3 B1 ve nml A=%',v; END IF;
  SELECT count(*) INTO v FROM public.workout_blocks WHERE id='a3000000-0000-0000-0000-00000000bbb1'; IF v<>0 THEN RAISE EXCEPTION 'G2.4 B1 ve block A=%',v; END IF;
  SELECT count(*) INTO v FROM public.check_ins WHERE id='a2000000-0000-0000-0000-0000000000c1'; IF v<>0 THEN RAISE EXCEPTION 'G2.5 B1 ve checkin A=%',v; END IF;
  -- B1 SI ve lo suyo (B-gamma)
  SELECT count(*) INTO v FROM public.food_items WHERE id='b4000000-0000-0000-0000-000000000100'; IF v<>1 THEN RAISE EXCEPTION 'G2.6 B1 no ve su food=%',v; END IF;
END $$;

-- ---------- GRUPO 3: WITH CHECK adversarial (insert deep) ----------
-- A3 (member) INSERTA food_item/meal_log/block para A-alpha (permitido); UPDATE phantom cross-team (0 rows)
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE i int; u int; BEGIN
  INSERT INTO public.nutrition_meals (plan_id, name) VALUES ('a4000000-0000-0000-0000-000000000001','meal by A3'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'G3.1 A3 insert meal pool i=%',i; END IF;
  INSERT INTO public.food_items (meal_id, food_id, quantity) VALUES ('a4000000-0000-0000-0000-000000000010',(SELECT id FROM public.foods LIMIT 1),50); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'G3.2 A3 insert food pool i=%',i; END IF;
  INSERT INTO public.check_ins (client_id,date,notes) VALUES ('a1000000-0000-0000-0000-000000000001',now(),'by A3'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'G3.3 A3 insert checkin pool i=%',i; END IF;
  -- phantom UPDATE de food_item de B (no visible) -> 0 rows
  UPDATE public.food_items SET quantity=999 WHERE id='b4000000-0000-0000-0000-000000000100'; GET DIAGNOSTICS u=ROW_COUNT; IF u<>0 THEN RAISE EXCEPTION 'G3.4 A3 phantom upd B food u=%',u; END IF;
END $$;
-- B1 intenta INSERT food_item para meal de A (bloqueado) + nutrition_plan para A-alpha (bloqueado)
SET LOCAL request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE blk boolean; v int; BEGIN
  -- G3.5: B1 NO inserta food_item en meal de A (hija encadenada al padre/cliente)
  blk:=false; BEGIN INSERT INTO public.food_items (meal_id, food_id, quantity) VALUES ('a4000000-0000-0000-0000-000000000010',(SELECT id FROM public.foods LIMIT 1),1); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'G3.5 B1 inserto food_item en meal de A'; END IF;
  -- G3.6: B1 NO puede insertar nutrition_plan para A-alpha (gap cerrado por hardening 20260609180000).
  blk:=false; BEGIN INSERT INTO public.nutrition_plans (client_id, coach_id, name) VALUES ('a1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-0000000000b1','hack'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'G3.6 B1 inserto np para A-alpha (gap)'; END IF;
  -- frontera de team adicional: el pool de B1 no incluye A-alpha
  SELECT count(*) INTO v FROM public.current_user_pool_client_ids() WHERE current_user_pool_client_ids='a1000000-0000-0000-0000-000000000001'; IF v<>0 THEN RAISE EXCEPTION 'G3.6b B1 pool incluye A-alpha=%',v; END IF;
  -- G3.7: B1 NO inserta workout_block en plan de A (hija encadenada al plan)
  blk:=false; BEGIN INSERT INTO public.workout_blocks (plan_id, exercise_id, order_index, section) VALUES ('a3000000-0000-0000-0000-000000000ff1',(SELECT id FROM public.exercises LIMIT 1),1,'main'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN blk:=true; END; IF NOT blk THEN RAISE EXCEPTION 'G3.7 B1 inserto block en plan de A'; END IF;
END $$;

-- ---------- GRUPO 4: STANDALONE REGRESION (S1 sin team intacto) ----------
SET LOCAL request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE v int; u int; i int; BEGIN
  -- ve SOLO su cliente standalone
  SELECT count(*) INTO v FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000001'; IF v<>1 THEN RAISE EXCEPTION 'G4.1 S1 no ve su cliente=%',v; END IF;
  SELECT count(*) INTO v FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa'; IF v<>0 THEN RAISE EXCEPTION 'G4.2 S1 ve pool A=%',v; END IF;
  SELECT count(*) INTO v FROM public.food_items WHERE id='a4000000-0000-0000-0000-000000000100'; IF v<>0 THEN RAISE EXCEPTION 'G4.3 S1 ve food de A=%',v; END IF;
  -- helpers vacios
  SELECT count(*) INTO v FROM public.current_user_team_ids(); IF v<>0 THEN RAISE EXCEPTION 'G4.4 S1 team_ids=%',v; END IF;
  SELECT count(*) INTO v FROM public.current_user_pool_client_ids(); IF v<>0 THEN RAISE EXCEPTION 'G4.5 S1 pool_client_ids=%',v; END IF;
  -- escribe sobre su cliente (intacto)
  UPDATE public.clients SET full_name=full_name WHERE id='c1000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS u=ROW_COUNT; IF u<>1 THEN RAISE EXCEPTION 'G4.6 S1 no edita su cliente u=%',u; END IF;
  INSERT INTO public.check_ins (client_id,date,notes) VALUES ('c1000000-0000-0000-0000-000000000001',now(),'by S1'); GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'G4.7 S1 no inserta checkin i=%',i; END IF;
  -- app-shape getCoachClientsWithPrograms: org_id NULL AND (coach_id=S1 OR team_id IN ()) -> solo S-solo
  SELECT count(*) INTO v FROM public.clients WHERE org_id IS NULL AND coach_id='c0000000-0000-0000-0000-0000000000c1'; IF v<>1 THEN RAISE EXCEPTION 'G4.8 S1 app-shape=%',v; END IF;
END $$;

-- ---------- GRUPO 5: ENTERPRISE aislamiento (team <-> org) ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  -- A3 (team) NO ve cliente enterprise
  SELECT count(*) INTO v FROM public.clients WHERE id='e1000000-0000-0000-0000-000000000001'; IF v<>0 THEN RAISE EXCEPTION 'G5.1 A3 ve cliente org=%',v; END IF;
  SELECT count(*) INTO v FROM public.clients WHERE org_id IS NOT NULL; IF v<>0 THEN RAISE EXCEPTION 'G5.2 A3 ve algun org client=%',v; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  -- E1 (enterprise) NO ve clientes del pool team
  SELECT count(*) INTO v FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa'; IF v<>0 THEN RAISE EXCEPTION 'G5.3 E1 ve pool team=%',v; END IF;
  SELECT count(*) INTO v FROM public.current_user_team_ids(); IF v<>0 THEN RAISE EXCEPTION 'G5.4 E1 team_ids=%',v; END IF;
END $$;

-- ---------- GRUPO 6: HELPERS OPTIMIZADOS (sets exactos) ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.current_user_team_ids() WHERE current_user_team_ids='a0000000-0000-0000-0000-00000000aaaa'; IF v<>1 THEN RAISE EXCEPTION 'G6.1 A3 team_ids=%',v; END IF;
  SELECT count(*) INTO v FROM public.current_user_pool_client_ids(); IF v<>2 THEN RAISE EXCEPTION 'G6.2 A3 pool_client_ids=% (esperado 2)',v; END IF;
  SELECT count(*) INTO v FROM public.current_user_managed_team_ids(); IF v<>0 THEN RAISE EXCEPTION 'G6.3 A3 managed (no gestor)=%',v; END IF;
  SELECT count(*) INTO v FROM public.current_user_pool_coach_ids(); IF v<>3 THEN RAISE EXCEPTION 'G6.4 A3 pool_coach_ids=% (esperado 3)',v; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.current_user_managed_team_ids(); IF v<>1 THEN RAISE EXCEPTION 'G6.5 A2 managed (gestor)=%',v; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.current_user_managed_team_ids(); IF v<>1 THEN RAISE EXCEPTION 'G6.6 A1 managed (owner)=%',v; END IF;
END $$;

-- ---------- GRUPO 7: APP-QUERY-SHAPES (replica del WHERE de la app) ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  -- getCoachClientsWithPrograms: A3 no posee clientes pero ve 2 del pool
  SELECT count(*) INTO v FROM public.clients WHERE org_id IS NULL AND (coach_id='a0000000-0000-0000-0000-0000000000a3' OR team_id IN (SELECT public.current_user_team_ids())); IF v<>2 THEN RAISE EXCEPTION 'G7.1 app-list A3=%',v; END IF;
  -- getCoachActiveTeamIds
  SELECT count(*) INTO v FROM public.team_members WHERE coach_id='a0000000-0000-0000-0000-0000000000a3' AND status='active' AND deleted_at IS NULL; IF v<>1 THEN RAISE EXCEPTION 'G7.2 activeTeamIds A3=%',v; END IF;
  -- builder viaTeam: clients WHERE id=A-alpha (sin coach_id) -> 1
  SELECT count(*) INTO v FROM public.clients WHERE id='a1000000-0000-0000-0000-000000000001'; IF v<>1 THEN RAISE EXCEPTION 'G7.3 builder A3=%',v; END IF;
  -- getCoachTeamOverview: count pool clients team_id=A is_archived=false
  SELECT count(*) INTO v FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND is_archived=false; IF v<>2 THEN RAISE EXCEPTION 'G7.4 overview count=%',v; END IF;
  SELECT count(*) INTO v FROM public.team_members WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND status='active' AND deleted_at IS NULL; IF v<>3 THEN RAISE EXCEPTION 'G7.5 overview members=%',v; END IF;
END $$;

-- ---------- GRUPO 8: ENTITLEMENTS ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v jsonb; BEGIN
  SELECT enabled_modules INTO v FROM public.teams WHERE id='a0000000-0000-0000-0000-00000000aaaa';
  IF NOT (v->>'cardio')::boolean THEN RAISE EXCEPTION 'G8.1 team cardio modulo'; END IF;
  IF (v ? 'nutrition_exchanges') THEN RAISE EXCEPTION 'G8.2 team modulo inesperado'; END IF;
END $$;

-- ---------- GRUPO 9: REVOCACION (A3 revocado -> pierde pool; data por-cliente sobrevive para A2) ----------
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.team_members SET status='revoked' WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a3'; GET DIAGNOSTICS u=ROW_COUNT; IF u<>1 THEN RAISE EXCEPTION 'G9.0 owner no revoco A3 u=%',u; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  SELECT count(*) INTO v FROM public.current_user_team_ids(); IF v<>0 THEN RAISE EXCEPTION 'G9.1 A3 revocado sigue en team=%',v; END IF;
  SELECT count(*) INTO v FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa'; IF v<>0 THEN RAISE EXCEPTION 'G9.2 A3 revocado ve pool=%',v; END IF;
  SELECT count(*) INTO v FROM public.check_ins WHERE id='a2000000-0000-0000-0000-0000000000c1'; IF v<>0 THEN RAISE EXCEPTION 'G9.3 A3 revocado ve checkin=%',v; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v int; BEGIN
  -- A2 (sigue activo) ve el check_in de A-alpha (ligado al cliente, no al coach revocado)
  SELECT count(*) INTO v FROM public.check_ins WHERE id='a2000000-0000-0000-0000-0000000000c1'; IF v<>1 THEN RAISE EXCEPTION 'G9.4 A2 no ve checkin tras revoke A3=%',v; END IF;
  SELECT count(*) INTO v FROM public.clients WHERE team_id='a0000000-0000-0000-0000-00000000aaaa'; IF v<>2 THEN RAISE EXCEPTION 'G9.5 A2 pool roto tras revoke=%',v; END IF;
END $$;

RESET ROLE;
SELECT 'ALL COMPREHENSIVE PASSED' AS result;
ROLLBACK;
