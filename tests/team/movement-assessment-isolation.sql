-- movement_assessments / movement_assessment_items — RLS isolation suite (AC8, specs/movida-screening).
-- tx + ROLLBACK (no persiste; apto branch efimero / gate autorizado). Esperado: 'ALL PASSED'.
-- Requiere migracion 20260611091001_movement_assessment_module.sql aplicada.
-- Cobertura del plan §Test plan: T1 team A no ve B; T2 standalone solo propios; T3 alumno solo
-- SELECT finales propios (legacy id=auth.uid Y split membership); T4 INSERT cross-team rechazado;
-- T5 anon nada; T6 draft unico por alumno; T7 EXPLAIN ANALYZE via team (inspeccionar InitPlan, loops=1).
-- Actores: A1 (owner TeamA), A3 (member TeamA sin can_manage), B1 (owner TeamB), S1 (standalone).
BEGIN;

-- ===================== SEED (como superuser; bypasea RLS dentro de la tx) =====================
-- Patron de columnas completas de tests/team/team-isolation.sql (NOT NULLs de GoTrue cubiertos).
-- Incluye TODOS los clients: public.clients.id tiene FK a auth.users(id) (clients_id_fkey).
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
 ('a55e0000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA1+mvastest@example.test','x',now(),now(),now(),'{}','{}'),
 ('a55e0000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA3+mvastest@example.test','x',now(),now(),now(),'{}','{}'),
 ('a55e0000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachB1+mvastest@example.test','x',now(),now(),now(),'{}','{}'),
 ('a55e0000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachS1+mvastest@example.test','x',now(),now(),now(),'{}','{}'),
 ('a55e1000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoAalpha+mvastest@example.test','x',now(),now(),now(),'{}','{}'), -- alumno legacy A-alpha (client.id = auth.uid)
 ('a55e1000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoBgamma+mvastest@example.test','x',now(),now(),now(),'{}','{}'), -- alumno B-gamma (FK clients_id_fkey)
 ('a55e1000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoSsolo+mvastest@example.test','x',now(),now(),now(),'{}','{}'),  -- alumno S-solo (FK clients_id_fkey)
 ('a55e2000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','accountBgamma+mvastest@example.test','x',now(),now(),now(),'{}','{}') -- account split de B-gamma
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('a55e0000-0000-0000-0000-0000000000a1','mvas-a1','Coach A1','MA1','MVAS-A1'),
 ('a55e0000-0000-0000-0000-0000000000a3','mvas-a3','Coach A3','MA3','MVAS-A3'),
 ('a55e0000-0000-0000-0000-0000000000b1','mvas-b1','Coach B1','MB1','MVAS-B1'),
 ('a55e0000-0000-0000-0000-0000000000c1','mvas-s1','Coach S1','MS1','MVAS-S1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules) VALUES
 ('a55e0000-0000-0000-0000-00000000aaaa','MVAS TeamA','mvas-team-a','a55e0000-0000-0000-0000-0000000000a1',10,'{"movement_assessment":true}'::jsonb),
 ('a55e0000-0000-0000-0000-00000000bbbb','MVAS TeamB','mvas-team-b','a55e0000-0000-0000-0000-0000000000b1',10,'{"movement_assessment":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
 ('a55e0000-0000-0000-0000-00000000aaaa','a55e0000-0000-0000-0000-0000000000a1',true,'active'),
 ('a55e0000-0000-0000-0000-00000000aaaa','a55e0000-0000-0000-0000-0000000000a3',false,'active'),
 ('a55e0000-0000-0000-0000-00000000bbbb','a55e0000-0000-0000-0000-0000000000b1',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
 ('a55e1000-0000-0000-0000-000000000001','a55e0000-0000-0000-0000-0000000000a1',NULL,'a55e0000-0000-0000-0000-00000000aaaa','MVAS A-alpha','mvas-aa@t.local'),
 ('a55e1000-0000-0000-0000-000000000002','a55e0000-0000-0000-0000-0000000000b1',NULL,'a55e0000-0000-0000-0000-00000000bbbb','MVAS B-gamma','mvas-bg@t.local'),
 ('a55e1000-0000-0000-0000-000000000003','a55e0000-0000-0000-0000-0000000000c1',NULL,NULL,'MVAS S-solo','mvas-ss@t.local')
ON CONFLICT (id) DO NOTHING;

-- Identidad split: account -> membership team activa sobre B-gamma
INSERT INTO public.client_accounts (id) VALUES
 ('a55e2000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_memberships (account_id, client_id, scope, team_id, status) VALUES
 ('a55e2000-0000-0000-0000-000000000001','a55e1000-0000-0000-0000-000000000002','team','a55e0000-0000-0000-0000-00000000bbbb','active')
ON CONFLICT DO NOTHING;

-- Evaluaciones: A-alpha 1 final + 1 draft; B-gamma 1 final; S-solo 1 final
INSERT INTO public.movement_assessments
 (id, client_id, coach_id, team_id, status, composite_score, has_pain, has_asymmetry, risk_band, consent_confirmed_at, last_edited_by) VALUES
 ('a55e3000-0000-0000-0000-000000000001','a55e1000-0000-0000-0000-000000000001','a55e0000-0000-0000-0000-0000000000a1','a55e0000-0000-0000-0000-00000000aaaa','final',16,false,true,'moderate',now(),'a55e0000-0000-0000-0000-0000000000a1'),
 ('a55e3000-0000-0000-0000-000000000002','a55e1000-0000-0000-0000-000000000001','a55e0000-0000-0000-0000-0000000000a1','a55e0000-0000-0000-0000-00000000aaaa','draft',NULL,false,false,NULL,NULL,'a55e0000-0000-0000-0000-0000000000a1'),
 ('a55e3000-0000-0000-0000-000000000003','a55e1000-0000-0000-0000-000000000002','a55e0000-0000-0000-0000-0000000000b1','a55e0000-0000-0000-0000-00000000bbbb','final',18,false,false,'low',now(),'a55e0000-0000-0000-0000-0000000000b1'),
 ('a55e3000-0000-0000-0000-000000000004','a55e1000-0000-0000-0000-000000000003','a55e0000-0000-0000-0000-0000000000c1',NULL,'final',12,true,false,'high',now(),'a55e0000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.movement_assessment_items
 (id, assessment_id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain) VALUES
 ('a55e4000-0000-0000-0000-000000000001','a55e3000-0000-0000-0000-000000000001','deep_squat',  false,NULL,NULL,2,2,false),
 ('a55e4000-0000-0000-0000-000000000002','a55e3000-0000-0000-0000-000000000001','hurdle_step', true ,2   ,3   ,NULL,2,false),
 ('a55e4000-0000-0000-0000-000000000003','a55e3000-0000-0000-0000-000000000003','deep_squat',  false,NULL,NULL,3,3,false),
 ('a55e4000-0000-0000-0000-000000000004','a55e3000-0000-0000-0000-000000000004','inline_lunge',true ,1   ,2   ,NULL,1,false)
ON CONFLICT (id) DO NOTHING;

-- ===================== T1 — miembro TeamA (A3, sin can_manage): pool full-access, cero TeamB/standalone =====================
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a55e0000-0000-0000-0000-0000000000a3","role":"authenticated"}',true);
DO $t1$ DECLARE v_own int; v_b bool; v_s bool; v_item_own int; v_item_b bool; v_upd int; v_ins int; BEGIN
  -- ve final + draft del pool propio
  SELECT count(*) INTO v_own FROM public.movement_assessments WHERE client_id='a55e1000-0000-0000-0000-000000000001';
  IF v_own <> 2 THEN RAISE EXCEPTION 'T1 FAIL: miembro TeamA ve % evaluaciones de A-alpha (esperaba 2)', v_own; END IF;
  -- NO ve TeamB ni standalone ajeno
  SELECT EXISTS(SELECT 1 FROM public.movement_assessments WHERE id='a55e3000-0000-0000-0000-000000000003') INTO v_b;
  SELECT EXISTS(SELECT 1 FROM public.movement_assessments WHERE id='a55e3000-0000-0000-0000-000000000004') INTO v_s;
  IF v_b OR v_s THEN RAISE EXCEPTION 'T1 FAIL: miembro TeamA ve ajenas (teamB=% standalone=%)', v_b, v_s; END IF;
  -- items: propios si, TeamB no
  SELECT count(*) INTO v_item_own FROM public.movement_assessment_items WHERE assessment_id='a55e3000-0000-0000-0000-000000000001';
  SELECT EXISTS(SELECT 1 FROM public.movement_assessment_items WHERE id='a55e4000-0000-0000-0000-000000000003') INTO v_item_b;
  IF v_item_own <> 2 OR v_item_b THEN RAISE EXCEPTION 'T1 FAIL items: own=% (esperaba 2) teamB_visible=%', v_item_own, v_item_b; END IF;
  -- pool full-access: cualquier miembro edita el draft (awareness last_edited_by va en service)
  UPDATE public.movement_assessments SET notes='retomado por A3', last_edited_by='a55e0000-0000-0000-0000-0000000000a3'
   WHERE id='a55e3000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> 1 THEN RAISE EXCEPTION 'T1 FAIL: miembro pool no pudo editar draft (rows=%)', v_upd; END IF;
  -- pool full-access: INSERT de item en evaluacion del pool
  INSERT INTO public.movement_assessment_items (assessment_id, pattern, is_per_side, score_left, score_right, final_score)
  VALUES ('a55e3000-0000-0000-0000-000000000002','shoulder_mobility',true,2,2,2);
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins <> 1 THEN RAISE EXCEPTION 'T1 FAIL: miembro pool no pudo insertar item'; END IF;
END $t1$;

-- ===================== T4 — INSERT cross-team rechazado (WITH CHECK) =====================
DO $t4$ BEGIN
  BEGIN
    INSERT INTO public.movement_assessments (client_id, coach_id, team_id, status)
    VALUES ('a55e1000-0000-0000-0000-000000000002','a55e0000-0000-0000-0000-0000000000a3','a55e0000-0000-0000-0000-00000000bbbb','draft');
    RAISE EXCEPTION 'T4 FAIL: INSERT cross-team (TeamA -> alumno TeamB) paso RLS';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN
    -- patron que NO existe en los items de TeamB: un unique_violation no puede enmascarar el fallo RLS
    INSERT INTO public.movement_assessment_items (assessment_id, pattern, is_per_side, score_left, score_right, final_score)
    VALUES ('a55e3000-0000-0000-0000-000000000003','hurdle_step',true,1,1,1);
    RAISE EXCEPTION 'T4 FAIL: INSERT de item en evaluacion de TeamB paso RLS';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t4$;

-- ===================== T6 — draft unico por alumno (indice parcial) =====================
DO $t6$ BEGIN
  BEGIN
    INSERT INTO public.movement_assessments (client_id, coach_id, team_id, status)
    VALUES ('a55e1000-0000-0000-0000-000000000001','a55e0000-0000-0000-0000-0000000000a3','a55e0000-0000-0000-0000-00000000aaaa','draft');
    RAISE EXCEPTION 'T6 FAIL: segundo draft para el mismo alumno fue aceptado';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $t6$;
RESET role;

-- ===================== T2 — standalone S1: solo clientes propios (org NULL + team NULL) =====================
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a55e0000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
DO $t2$ DECLARE v_own int; v_team int; v_ins int; v_item_team bool; BEGIN
  SELECT count(*) INTO v_own FROM public.movement_assessments WHERE client_id='a55e1000-0000-0000-0000-000000000003';
  IF v_own <> 1 THEN RAISE EXCEPTION 'T2 FAIL: standalone ve % propias (esperaba 1)', v_own; END IF;
  SELECT count(*) INTO v_team FROM public.movement_assessments WHERE client_id IN
    ('a55e1000-0000-0000-0000-000000000001','a55e1000-0000-0000-0000-000000000002');
  SELECT EXISTS(SELECT 1 FROM public.movement_assessment_items WHERE id IN
    ('a55e4000-0000-0000-0000-000000000001','a55e4000-0000-0000-0000-000000000003')) INTO v_item_team;
  IF v_team <> 0 OR v_item_team THEN RAISE EXCEPTION 'T2 FAIL: standalone ve data de teams (rows=% items=%)', v_team, v_item_team; END IF;
  -- escribe sobre cliente propio
  INSERT INTO public.movement_assessments (client_id, coach_id, status)
  VALUES ('a55e1000-0000-0000-0000-000000000003','a55e0000-0000-0000-0000-0000000000c1','draft');
  GET DIAGNOSTICS v_ins = ROW_COUNT;
  IF v_ins <> 1 THEN RAISE EXCEPTION 'T2 FAIL: standalone no pudo crear draft propio'; END IF;
  -- NO escribe sobre alumno de pool (fila 'final' completa: el unico fallo posible es RLS,
  -- sin que el indice parcial de draft unico enmascare con unique_violation)
  BEGIN
    INSERT INTO public.movement_assessments (client_id, coach_id, status, composite_score, risk_band, consent_confirmed_at)
    VALUES ('a55e1000-0000-0000-0000-000000000001','a55e0000-0000-0000-0000-0000000000c1','final',10,'high',now());
    RAISE EXCEPTION 'T2 FAIL: standalone inserto sobre alumno de pool';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t2$;
RESET role;

-- ===================== T3a — alumno legacy (client.id = auth.uid): solo SELECT de finales propias =====================
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a55e1000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $t3a$ DECLARE v_vis int; v_draft bool; v_ajena bool; v_items int; v_upd int; BEGIN
  SELECT count(*) INTO v_vis FROM public.movement_assessments WHERE client_id='a55e1000-0000-0000-0000-000000000001';
  SELECT EXISTS(SELECT 1 FROM public.movement_assessments WHERE id='a55e3000-0000-0000-0000-000000000002') INTO v_draft;
  IF v_vis <> 1 OR v_draft THEN RAISE EXCEPTION 'T3a FAIL: alumno ve % filas (esperaba 1 final) draft_visible=%', v_vis, v_draft; END IF;
  SELECT EXISTS(SELECT 1 FROM public.movement_assessments WHERE id IN
    ('a55e3000-0000-0000-0000-000000000003','a55e3000-0000-0000-0000-000000000004')) INTO v_ajena;
  IF v_ajena THEN RAISE EXCEPTION 'T3a FAIL: alumno ve evaluaciones ajenas'; END IF;
  SELECT count(*) INTO v_items FROM public.movement_assessment_items WHERE assessment_id='a55e3000-0000-0000-0000-000000000001';
  IF v_items <> 2 THEN RAISE EXCEPTION 'T3a FAIL: alumno ve % items de su final (esperaba 2)', v_items; END IF;
  -- read-only: UPDATE no matchea policy (0 rows), INSERT rechazado
  UPDATE public.movement_assessments SET notes='hack' WHERE id='a55e3000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> 0 THEN RAISE EXCEPTION 'T3a FAIL: alumno edito su evaluacion (rows=%)', v_upd; END IF;
  BEGIN
    -- fila 'final' completa: evita que el draft existente convierta el fallo en unique_violation
    INSERT INTO public.movement_assessments (client_id, status, composite_score, risk_band, consent_confirmed_at)
    VALUES ('a55e1000-0000-0000-0000-000000000001','final',21,'low',now());
    RAISE EXCEPTION 'T3a FAIL: alumno inserto evaluacion';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t3a$;
RESET role;

-- ===================== T3b — alumno split membership (account_id != client_id) =====================
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a55e2000-0000-0000-0000-000000000001","role":"authenticated"}',true);
DO $t3b$ DECLARE v_vis int; v_items int; v_ajena bool; BEGIN
  SELECT count(*) INTO v_vis FROM public.movement_assessments WHERE client_id='a55e1000-0000-0000-0000-000000000002';
  IF v_vis <> 1 THEN RAISE EXCEPTION 'T3b FAIL: account split ve % finales de su client (esperaba 1)', v_vis; END IF;
  SELECT count(*) INTO v_items FROM public.movement_assessment_items WHERE assessment_id='a55e3000-0000-0000-0000-000000000003';
  IF v_items <> 1 THEN RAISE EXCEPTION 'T3b FAIL: account split ve % items (esperaba 1)', v_items; END IF;
  SELECT EXISTS(SELECT 1 FROM public.movement_assessments WHERE client_id <> 'a55e1000-0000-0000-0000-000000000002') INTO v_ajena;
  IF v_ajena THEN RAISE EXCEPTION 'T3b FAIL: account split ve evaluaciones de otros clients'; END IF;
END $t3b$;
RESET role;

-- ===================== T5 — anon: nada (REVOKE ALL => permission denied) =====================
SET LOCAL role anon;
DO $t5$ DECLARE v int; BEGIN
  BEGIN
    SELECT count(*) INTO v FROM public.movement_assessments;
    RAISE EXCEPTION 'T5 FAIL: anon pudo leer movement_assessments (rows=%)', v;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    SELECT count(*) INTO v FROM public.movement_assessment_items;
    RAISE EXCEPTION 'T5 FAIL: anon pudo leer movement_assessment_items (rows=%)', v;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t5$;
RESET role;

-- ===================== T7 — EXPLAIN ANALYZE via team (inspeccion manual en el gate) =====================
-- Esperado: helper current_user_pool_client_ids como InitPlan / hashed SubPlan (loops=1),
-- JAMAS re-evaluado por fila. Si aparece SubPlan con loops=N>1 sobre la tabla => FAIL del patron.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a55e0000-0000-0000-0000-0000000000a3","role":"authenticated"}',true);
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
  SELECT id, status, risk_band FROM public.movement_assessments;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
  SELECT id, pattern, final_score FROM public.movement_assessment_items
  WHERE assessment_id = 'a55e3000-0000-0000-0000-000000000001';
RESET role;

SELECT 'ALL PASSED' AS status;
ROLLBACK;
