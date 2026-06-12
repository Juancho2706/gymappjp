-- Suite RLS — NUTRICION POR INTERCAMBIOS (exchange_groups / meal_exchange_targets /
-- nutrition_plan_day_variants + guard de team_id en nutrition_plan_templates, T10,
-- + bitacora pdf_generate en team_access_logs, T11-T13 — AC7, delegado por
-- tests/separation/nutrition-exchanges.spec.ts).
-- tx + ROLLBACK (no persiste). Datos sinteticos prefijo e8c00000.
-- Spec: specs/movida-intercambios/SPEC.md AC6/AC1 · Plan: PLAN.md §RLS · Patron: tests/team/areas-isolation.sql.
-- Requiere 20260611093001_nutrition_exchanges.sql aplicada. Esperado: 'ALL PASSED'.
-- CORRE SOLO EN EL GATE AUTORIZADO (regla 2026-06-10) — jamas como service_role: los asserts
-- impersonan `authenticated` + claims.
BEGIN;

-- ============ Seed sintetico (como postgres, bypass RLS) ============
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('e8c00000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_a1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_a2@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_b1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_c1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_f1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_f2@e.test','x',now(),now(),now(),'{}','{}'),
  ('e8c00000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','xg_f3@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('e8c00000-0000-0000-0000-0000000000a1','xg-a1','A1 manager','XGA1','XG-A1'),
  ('e8c00000-0000-0000-0000-0000000000a2','xg-a2','A2 member','XGA2','XG-A2'),
  ('e8c00000-0000-0000-0000-0000000000b1','xg-b1','B1 owner','XGB1','XG-B1'),
  ('e8c00000-0000-0000-0000-0000000000c1','xg-c1','C1 standalone','XGC1','XG-C1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
  ('e8c00000-0000-0000-0000-0000000000aa','XG Team A','xg-team-a','e8c00000-0000-0000-0000-0000000000a1',10),
  ('e8c00000-0000-0000-0000-0000000000bb','XG Team B','xg-team-b','e8c00000-0000-0000-0000-0000000000b1',10)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
  ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a1',true,'active'),
  ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a2',false,'active'),
  ('e8c00000-0000-0000-0000-0000000000bb','e8c00000-0000-0000-0000-0000000000b1',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
  ('e8c00000-0000-0000-0000-0000000000f1','e8c00000-0000-0000-0000-0000000000a1',NULL,'e8c00000-0000-0000-0000-0000000000aa','Alumno A','xg_f1@e.test'),
  ('e8c00000-0000-0000-0000-0000000000f2','e8c00000-0000-0000-0000-0000000000b1',NULL,'e8c00000-0000-0000-0000-0000000000bb','Alumno B','xg_f2@e.test'),
  ('e8c00000-0000-0000-0000-0000000000f3','e8c00000-0000-0000-0000-0000000000c1',NULL,NULL,'Alumno S','xg_f3@e.test')
ON CONFLICT (id) DO NOTHING;
-- Grupos: 1 system sintetico + custom de team A, team B y coach standalone
INSERT INTO public.exchange_groups (id, slug, code, name, is_system, coach_id, team_id, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g) VALUES
  ('e8c00000-0000-0000-0000-000000000901','xg-test-sys','TS','Sys test',true, NULL,NULL,70,2,15,0),
  ('e8c00000-0000-0000-0000-000000000a01','xg-team-a-g','GA','Team A custom',false,NULL,'e8c00000-0000-0000-0000-0000000000aa',50,5,5,1),
  ('e8c00000-0000-0000-0000-000000000b01','xg-team-b-g','GB','Team B custom',false,NULL,'e8c00000-0000-0000-0000-0000000000bb',50,5,5,1),
  ('e8c00000-0000-0000-0000-000000000c01','xg-solo-g','GC','Standalone custom',false,'e8c00000-0000-0000-0000-0000000000c1',NULL,50,5,5,1)
ON CONFLICT (id) DO NOTHING;
-- Planes/comidas/targets/variantes: team A, team B y standalone
INSERT INTO public.nutrition_plans (id, coach_id, client_id, name) VALUES
  ('e8c00000-0000-0000-0000-00000000a111','e8c00000-0000-0000-0000-0000000000a1','e8c00000-0000-0000-0000-0000000000f1','Plan A'),
  ('e8c00000-0000-0000-0000-00000000b111','e8c00000-0000-0000-0000-0000000000b1','e8c00000-0000-0000-0000-0000000000f2','Plan B'),
  ('e8c00000-0000-0000-0000-00000000c111','e8c00000-0000-0000-0000-0000000000c1','e8c00000-0000-0000-0000-0000000000f3','Plan S')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_meals (id, plan_id, name, order_index) VALUES
  ('e8c00000-0000-0000-0000-00000000a112','e8c00000-0000-0000-0000-00000000a111','Desayuno A',0),
  ('e8c00000-0000-0000-0000-00000000b112','e8c00000-0000-0000-0000-00000000b111','Desayuno B',0),
  ('e8c00000-0000-0000-0000-00000000c112','e8c00000-0000-0000-0000-00000000c111','Desayuno S',0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.meal_exchange_targets (id, meal_id, exchange_group_id, portions) VALUES
  ('e8c00000-0000-0000-0000-00000000a113','e8c00000-0000-0000-0000-00000000a112','e8c00000-0000-0000-0000-000000000a01',2),
  ('e8c00000-0000-0000-0000-00000000b113','e8c00000-0000-0000-0000-00000000b112','e8c00000-0000-0000-0000-000000000b01',1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_plan_day_variants (id, plan_id, name, sort_order) VALUES
  ('e8c00000-0000-0000-0000-00000000a114','e8c00000-0000-0000-0000-00000000a111','Entreno AM',0)
ON CONFLICT (id) DO NOTHING;
-- Template propio de B1 (team_id NULL) para el guard de tenant de T10
INSERT INTO public.nutrition_plan_templates (id, coach_id, name) VALUES
  ('e8c00000-0000-0000-0000-00000000b115','e8c00000-0000-0000-0000-0000000000b1','Template B1')
ON CONFLICT (id) DO NOTHING;

-- ============ T1-T2 — coach A2 (miembro NO gestor de team A) ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
DO $t1$ DECLARE v_sys bool; v_ga bool; v_gb bool; v_gc bool; v_upd int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000901') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000a01') INTO v_ga;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000b01') INTO v_gb;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000c01') INTO v_gc;
  IF NOT (v_sys AND v_ga AND NOT v_gb AND NOT v_gc) THEN RAISE EXCEPTION 'T1 FAIL sys=% ga=% gb=% gc=%',v_sys,v_ga,v_gb,v_gc; END IF;
  -- T2: miembro no gestor NO escribe grupos del team; system inmutable
  UPDATE public.exchange_groups SET name='hack' WHERE id='e8c00000-0000-0000-0000-000000000a01'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T2 FAIL miembro no gestor edito grupo del team rows=%',v_upd; END IF;
  UPDATE public.exchange_groups SET name='hack' WHERE id='e8c00000-0000-0000-0000-000000000901'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T2 FAIL authenticated edito system rows=%',v_upd; END IF;
  BEGIN
    INSERT INTO public.exchange_groups (name,slug,code,team_id,is_system) VALUES ('ill','xg-ill','IL','e8c00000-0000-0000-0000-0000000000aa',false);
    RAISE EXCEPTION 'T2 FAIL insert de grupo team por no-gestor paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t1$;
RESET role;

-- ============ T3 — coach A1 (gestor de team A) ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
DO $t3$ DECLARE v_upd int; v_ins int; BEGIN
  UPDATE public.exchange_groups SET name='Team A renamed' WHERE id='e8c00000-0000-0000-0000-000000000a01'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T3 FAIL gestor no pudo editar grupo del team rows=%',v_upd; END IF;
  INSERT INTO public.exchange_groups (name,slug,code,team_id,is_system) VALUES ('Mgr nuevo','xg-mgr-new','MN','e8c00000-0000-0000-0000-0000000000aa',false); GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T3 FAIL gestor no pudo crear grupo del team'; END IF;
  BEGIN
    INSERT INTO public.exchange_groups (name,slug,code,is_system) VALUES ('Fake sys','xg-fake-sys','FS',true);
    RAISE EXCEPTION 'T3 FAIL insert is_system por authenticated paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t3$;
RESET role;

-- ============ T4 — coach B1 (team B): aislamiento entre teams ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t4$ DECLARE v_ga bool; v_upd int; v_ta bool; v_va bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000a01') INTO v_ga;
  IF v_ga THEN RAISE EXCEPTION 'T4 FAIL team B ve grupo custom de team A'; END IF;
  UPDATE public.exchange_groups SET name='x' WHERE id='e8c00000-0000-0000-0000-000000000a01'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T4 FAIL team B edito grupo de team A rows=%',v_upd; END IF;
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000a113') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_plan_day_variants WHERE id='e8c00000-0000-0000-0000-00000000a114') INTO v_va;
  IF v_ta OR v_va THEN RAISE EXCEPTION 'T4 FAIL team B ve targets/variantes de team A ta=% va=%',v_ta,v_va; END IF;
END $t4$;
RESET role;

-- ============ T5 — coach C1 standalone ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
DO $t5$ DECLARE v_sys bool; v_gc bool; v_ga bool; v_gb bool; v_ins int; v_ta bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000901') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000c01') INTO v_gc;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000a01') INTO v_ga;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000b01') INTO v_gb;
  IF NOT (v_sys AND v_gc AND NOT v_ga AND NOT v_gb) THEN RAISE EXCEPTION 'T5 FAIL sys=% gc=% ga=% gb=%',v_sys,v_gc,v_ga,v_gb; END IF;
  INSERT INTO public.exchange_groups (name,slug,code,coach_id,is_system) VALUES ('Mio','xg-mio','MI','e8c00000-0000-0000-0000-0000000000c1',false); GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T5 FAIL standalone no pudo crear grupo propio'; END IF;
  BEGIN
    INSERT INTO public.exchange_groups (name,slug,code,coach_id,is_system) VALUES ('Ajeno','xg-ajeno','AJ','e8c00000-0000-0000-0000-0000000000a1',false);
    RAISE EXCEPTION 'T5 FAIL insert con coach_id ajeno paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000a113') INTO v_ta;
  IF v_ta THEN RAISE EXCEPTION 'T5 FAIL coach ajeno ve targets de team A'; END IF;
END $t5$;
RESET role;

-- ============ T6 — coach A2: full-access del pool sobre targets/variantes de team A ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
DO $t6$ DECLARE v_ta bool; v_tb bool; v_upd int; v_ins int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000a113') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000b113') INTO v_tb;
  IF NOT (v_ta AND NOT v_tb) THEN RAISE EXCEPTION 'T6 FAIL pool ta=% tb=%',v_ta,v_tb; END IF;
  UPDATE public.meal_exchange_targets SET portions=3 WHERE id='e8c00000-0000-0000-0000-00000000a113'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T6 FAIL miembro del pool no pudo editar target rows=%',v_upd; END IF;
  INSERT INTO public.meal_exchange_targets (meal_id,exchange_group_id,portions)
    VALUES ('e8c00000-0000-0000-0000-00000000a112','e8c00000-0000-0000-0000-000000000901',1); GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T6 FAIL miembro del pool no pudo crear target'; END IF;
  BEGIN
    INSERT INTO public.meal_exchange_targets (meal_id,exchange_group_id,portions)
      VALUES ('e8c00000-0000-0000-0000-00000000b112','e8c00000-0000-0000-0000-000000000901',1);
    RAISE EXCEPTION 'T6 FAIL insert de target en meal de team B paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- variantes del pool (npdv_pool_all)
  UPDATE public.nutrition_plan_day_variants SET name='Entreno AM v2' WHERE id='e8c00000-0000-0000-0000-00000000a114'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T6 FAIL miembro del pool no pudo editar variante rows=%',v_upd; END IF;
END $t6$;
RESET role;

-- ============ T7 — alumno f1 (cliente de team A): solo SU plan, solo lectura ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000f1","role":"authenticated"}',true);
DO $t7$ DECLARE v_ta bool; v_tb bool; v_va bool; v_upd int; v_sys bool; v_ga bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000a113') INTO v_ta;
  SELECT EXISTS(SELECT 1 FROM public.meal_exchange_targets WHERE id='e8c00000-0000-0000-0000-00000000b113') INTO v_tb;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_plan_day_variants WHERE id='e8c00000-0000-0000-0000-00000000a114') INTO v_va;
  IF NOT (v_ta AND NOT v_tb AND v_va) THEN RAISE EXCEPTION 'T7 FAIL ta=% tb=% va=%',v_ta,v_tb,v_va; END IF;
  UPDATE public.meal_exchange_targets SET portions=9 WHERE id='e8c00000-0000-0000-0000-00000000a113'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T7 FAIL alumno edito target rows=%',v_upd; END IF;
  BEGIN
    INSERT INTO public.meal_exchange_targets (meal_id,exchange_group_id,portions)
      VALUES ('e8c00000-0000-0000-0000-00000000a112','e8c00000-0000-0000-0000-000000000a01',1);
    RAISE EXCEPTION 'T7 FAIL alumno inserto target';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.nutrition_plan_day_variants (plan_id,name) VALUES ('e8c00000-0000-0000-0000-00000000a111','hack');
    RAISE EXCEPTION 'T7 FAIL alumno inserto variante';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- catalogo: alumno ve system pero NO enumera los grupos custom del team (lectura de los
  -- referenciados por su plan va por service-role acotado + filtro de tenant — PLAN §RLS)
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000901') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.exchange_groups WHERE id='e8c00000-0000-0000-0000-000000000a01') INTO v_ga;
  IF NOT (v_sys AND NOT v_ga) THEN RAISE EXCEPTION 'T7 FAIL catalogo alumno sys=% ga=%',v_sys,v_ga; END IF;
END $t7$;
RESET role;

-- ============ T8 — CHECK de plan_mode + default 'grams' (AC1) ============
DO $t8$ DECLARE v_mode text; BEGIN
  SELECT plan_mode INTO v_mode FROM public.nutrition_plans WHERE id='e8c00000-0000-0000-0000-00000000b111';
  IF v_mode<>'grams' THEN RAISE EXCEPTION 'T8 FAIL default plan_mode=%',v_mode; END IF;
  BEGIN
    UPDATE public.nutrition_plans SET plan_mode='bogus' WHERE id='e8c00000-0000-0000-0000-00000000a111';
    RAISE EXCEPTION 'T8 FAIL plan_mode invalido paso el CHECK';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.nutrition_plans SET plan_mode='exchanges' WHERE id='e8c00000-0000-0000-0000-00000000a111';
END $t8$;

-- ============ T9 — grants endurecidos (gotcha default-priv: anon 0, authenticated sin TRUNCATE) ============
DO $t9$ DECLARE v_anon int; v_extra int; BEGIN
  SELECT count(*) INTO v_anon FROM information_schema.role_table_grants
   WHERE grantee='anon' AND table_schema='public'
     AND table_name IN ('exchange_groups','meal_exchange_targets','nutrition_plan_day_variants');
  IF v_anon<>0 THEN RAISE EXCEPTION 'T9 FAIL anon tiene % privilegios en tablas nuevas',v_anon; END IF;
  SELECT count(*) INTO v_extra FROM information_schema.role_table_grants
   WHERE grantee='authenticated' AND table_schema='public'
     AND table_name IN ('exchange_groups','meal_exchange_targets','nutrition_plan_day_variants')
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  IF v_extra<>0 THEN RAISE EXCEPTION 'T9 FAIL authenticated tiene % privilegios excesivos',v_extra; END IF;
END $t9$;

-- ============ T10 — guard RESTRICTIVE npt_team_id_guard: team_id forjado en templates ============
-- Coach B1 (team B) intenta INSERT/UPDATE de nutrition_plan_templates con team_id de team A
-- (uuid adivinado/filtrado). Esperado: insufficient_privilege / 0 filas — las permissive
-- vigentes no miran team_id; el guard RESTRICTIVE (20260611093001) lo bloquea. Control
-- positivo: team_id del PROPIO team pasa (el guard no rompe el flujo F7).
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t10$ DECLARE v_ins int; v_upd int; BEGIN
  BEGIN
    INSERT INTO public.nutrition_plan_templates (coach_id, name, team_id)
      VALUES ('e8c00000-0000-0000-0000-0000000000b1','forjado hacia A','e8c00000-0000-0000-0000-0000000000aa');
    RAISE EXCEPTION 'T10 FAIL insert de template con team_id de team A paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN
    UPDATE public.nutrition_plan_templates SET team_id='e8c00000-0000-0000-0000-0000000000aa'
      WHERE id='e8c00000-0000-0000-0000-00000000b115';
    GET DIAGNOSTICS v_upd=ROW_COUNT;
    IF v_upd<>0 THEN RAISE EXCEPTION 'T10 FAIL update de template hacia team A paso rows=%',v_upd; END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- control positivo: coach_id = autor + team_id del propio team (modelo F7) pasa el guard
  INSERT INTO public.nutrition_plan_templates (coach_id, name, team_id)
    VALUES ('e8c00000-0000-0000-0000-0000000000b1','legitimo team B','e8c00000-0000-0000-0000-0000000000bb');
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T10 FAIL insert legitimo con team_id propio bloqueado'; END IF;
END $t10$;
RESET role;

-- ============ T11 — coach A2: bitacora pdf_generate en team_access_logs (AC7) ============
-- Espejo del contrato de logExchangePdfGenerated: coach del pool inserta la fila
-- pdf_generate para alumno de SU pool bajo RLS authenticated (policy member_insert).
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
DO $t11$ DECLARE v_ins int; v_cnt int; BEGIN
  INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action, metadata)
    VALUES ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a2','e8c00000-0000-0000-0000-0000000000f1','nutrition_plan','pdf_generate','{"format":"compact","plan_id":"e8c00000-0000-0000-0000-00000000a111"}');
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T11 FAIL coach del pool no pudo insertar pdf_generate'; END IF;
  SELECT count(*) INTO v_cnt FROM public.team_access_logs
   WHERE team_id='e8c00000-0000-0000-0000-0000000000aa' AND action='pdf_generate';
  IF v_cnt<1 THEN RAISE EXCEPTION 'T11 FAIL miembro no ve la fila pdf_generate cnt=%',v_cnt; END IF;
  -- self-attribution: actor_coach_id forjado (A1) bloqueado por la policy
  BEGIN
    INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action)
      VALUES ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a1','e8c00000-0000-0000-0000-0000000000f1','nutrition_plan','pdf_generate');
    RAISE EXCEPTION 'T11 FAIL pdf_generate con actor forjado paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  -- alumno de OTRO pool (f2, team B) en la bitacora de team A bloqueado
  BEGIN
    INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action)
      VALUES ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a2','e8c00000-0000-0000-0000-0000000000f2','nutrition_plan','pdf_generate');
    RAISE EXCEPTION 'T11 FAIL pdf_generate con alumno de team B paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t11$;
RESET role;

-- ============ T12 — coach B1: no escribe ni lee la bitacora pdf_generate de team A ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t12$ DECLARE v_cnt int; BEGIN
  BEGIN
    INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action)
      VALUES ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000b1','e8c00000-0000-0000-0000-0000000000f1','nutrition_plan','pdf_generate');
    RAISE EXCEPTION 'T12 FAIL coach ajeno inserto pdf_generate en team A';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  SELECT count(*) INTO v_cnt FROM public.team_access_logs
   WHERE team_id='e8c00000-0000-0000-0000-0000000000aa' AND action='pdf_generate';
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T12 FAIL coach ajeno ve bitacora de team A cnt=%',v_cnt; END IF;
END $t12$;
RESET role;

-- ============ T13 — alumno f1: su descarga NO genera bitacora (cero filas suyas, AC7) ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"e8c00000-0000-0000-0000-0000000000f1","role":"authenticated"}',true);
DO $t13$ DECLARE v_cnt int; BEGIN
  BEGIN
    INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action)
      VALUES ('e8c00000-0000-0000-0000-0000000000aa','e8c00000-0000-0000-0000-0000000000a1','e8c00000-0000-0000-0000-0000000000f1','nutrition_plan','pdf_generate');
    RAISE EXCEPTION 'T13 FAIL alumno inserto pdf_generate';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  SELECT count(*) INTO v_cnt FROM public.team_access_logs WHERE action='pdf_generate';
  IF v_cnt<>0 THEN RAISE EXCEPTION 'T13 FAIL alumno ve filas pdf_generate cnt=%',v_cnt; END IF;
END $t13$;
RESET role;

SELECT 'ALL PASSED' AS status;
ROLLBACK;
