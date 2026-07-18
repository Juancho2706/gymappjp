-- Suite RLS — PORCIONES V2 (nutrition_slot_exchange_targets_v2, T5.2 — Q13).
-- tx + ROLLBACK (no persiste). Datos sinteticos prefijo f1a00000.
-- Spec: specs/nutrition-portions/SPEC.md R2/S1 · Tareas: specs/nutrition-portions/TASKS.md T5.2.
-- Patron ESPEJO ESTRICTO de tests/team/exchanges-isolation.sql (misma forma de seed "como
-- postgres, bypass RLS" + bloques SET LOCAL role authenticated / set_config del jwt claim +
-- DO $tN$ ... END $tN$ con RAISE EXCEPTION 'TN FAIL ...' + RESET role).
-- Requiere 20260718140000_nutrition_portions_v2.sql aplicada (tabla nueva + policies +
-- helpers private.nutrition_v2_can_read_version / _can_edit_version de
-- 20260714190500_nutrition_v2_security_rpc.sql). Esperado: 'ALL PASSED'.
-- CORRE SOLO EN EL GATE AUTORIZADO (regla 2026-06-10) — jamas como service_role para los
-- asserts de authenticated: los bloques T1-T5 impersonan `authenticated` via claims; T7 es el
-- UNICO bloque legitimo en service_role (control positivo de la policy _service).
--
-- NO SE EJECUTA EN ESTE BUILD: la tabla nutrition_slot_exchange_targets_v2 no existe hasta que
-- la migracion 20260718140000 se aplique (BEGIN/ROLLBACK + advisors + GO CEO, fase de
-- operacion). Este archivo quedo validado por lectura cuidadosa contra la migracion (nombres de
-- columnas/policies/helpers exactos, FK compuesta, CHECK de portions) + coherencia de
-- sintaxis/estilo con el espejo. Comando de ejecucion al pie.
BEGIN;

-- ============ Seed sintetico (como postgres, bypass RLS) ============
-- Team A: coach a1 (owner/manager) + coach a2 (miembro NO gestor, pool). Coach b1: standalone,
-- SIN relacion con team A — hace de "otro coach / otro pool" en T1/T5.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('f1a00000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf_a1@e.test','x',now(),now(),now(),'{}','{}'),
  ('f1a00000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf_a2@e.test','x',now(),now(),now(),'{}','{}'),
  ('f1a00000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf_b1@e.test','x',now(),now(),now(),'{}','{}'),
  ('f1a00000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf_f1@e.test','x',now(),now(),now(),'{}','{}'),
  ('f1a00000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pf_f2@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('f1a00000-0000-0000-0000-0000000000a1','pf-a1','A1 manager','PFA1','PF-A1'),
  ('f1a00000-0000-0000-0000-0000000000a2','pf-a2','A2 member','PFA2','PF-A2'),
  ('f1a00000-0000-0000-0000-0000000000b1','pf-b1','B1 ajeno','PFB1','PF-B1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
  ('f1a00000-0000-0000-0000-0000000000aa','PF Team A','pf-team-a','f1a00000-0000-0000-0000-0000000000a1',10)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
  ('f1a00000-0000-0000-0000-0000000000aa','f1a00000-0000-0000-0000-0000000000a1',true,'active'),
  ('f1a00000-0000-0000-0000-0000000000aa','f1a00000-0000-0000-0000-0000000000a2',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
-- f1 = alumno DUENO del plan (cliente de a1/team A). f2 = alumno de b1 (coach totalmente ajeno,
-- SIN relacion con team A) — hace de "alumno de otro coach" en T1.
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
  ('f1a00000-0000-0000-0000-0000000000f1','f1a00000-0000-0000-0000-0000000000a1',NULL,'f1a00000-0000-0000-0000-0000000000aa','Alumno F1','pf_f1@e.test'),
  ('f1a00000-0000-0000-0000-0000000000f2','f1a00000-0000-0000-0000-0000000000b1',NULL,NULL,'Alumno F2','pf_f2@e.test')
ON CONFLICT (id) DO NOTHING;
-- 2 grupos system (misma forma que el catalogo real: is_system=true, coach_id/team_id NULL).
INSERT INTO public.exchange_groups (id, slug, code, name, is_system, coach_id, team_id, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g) VALUES
  ('f1a00000-0000-0000-0000-000000000901','pf-test-sys','C','Cereales test',true,NULL,NULL,70,2,15,0),
  ('f1a00000-0000-0000-0000-000000000902','pf-test-sys2','P','Proteinas test',true,NULL,NULL,55,7,0,3)
ON CONFLICT (id) DO NOTHING;
-- Plan A (team A, cliente f1, coach a1) con 2 versiones: PUBLICADA (visible para el alumno) y
-- DRAFT (editable — can_edit_version exige status='draft'). Cada una con su propia
-- variante/franja/target, mismo patron de nutrition_prescription_items_v2.
INSERT INTO public.nutrition_plans_v2 (id, client_id, coach_id, org_id, team_id, name, strategy, created_by, updated_by) VALUES
  ('f1a00000-0000-0000-0000-00000000a111','f1a00000-0000-0000-0000-0000000000f1','f1a00000-0000-0000-0000-0000000000a1',NULL,'f1a00000-0000-0000-0000-0000000000aa','Plan A','structured','f1a00000-0000-0000-0000-0000000000a1','f1a00000-0000-0000-0000-0000000000a1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_plan_versions_v2 (id, plan_id, version_number, status, strategy, effective_from, published_at, published_by, created_by, updated_by) VALUES
  ('f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a111',1,'published','structured','2026-07-01',now(),'f1a00000-0000-0000-0000-0000000000a1','f1a00000-0000-0000-0000-0000000000a1','f1a00000-0000-0000-0000-0000000000a1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_plan_versions_v2 (id, plan_id, version_number, status, strategy, created_by, updated_by) VALUES
  ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a111',2,'draft','structured','f1a00000-0000-0000-0000-0000000000a1','f1a00000-0000-0000-0000-0000000000a1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_day_variants_v2 (id, version_id, variant_key, label, is_default) VALUES
  ('f1a00000-0000-0000-0000-00000000a131','f1a00000-0000-0000-0000-00000000a121','default','Default',true),
  ('f1a00000-0000-0000-0000-00000000a132','f1a00000-0000-0000-0000-00000000a122','default','Default',true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_meal_slots_v2 (id, version_id, day_variant_id, slot_code, name) VALUES
  ('f1a00000-0000-0000-0000-00000000a141','f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a131','breakfast','Desayuno'),
  ('f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a132','breakfast','Desayuno')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.nutrition_slot_exchange_targets_v2 (id, version_id, meal_slot_id, exchange_group_id, portions, snapshot_group_code, snapshot_group_name, snapshot_ref_calories, snapshot_ref_protein_g, snapshot_ref_carbs_g, snapshot_ref_fats_g, snapshot_macros_confirmed) VALUES
  ('f1a00000-0000-0000-0000-00000000a151','f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a141','f1a00000-0000-0000-0000-000000000901',2,'C','Cereales test',70,2,15,0,true),
  ('f1a00000-0000-0000-0000-00000000a152','f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000901',1.5,'C','Cereales test',70,2,15,0,true)
ON CONFLICT (id) DO NOTHING;

-- ============ T1 — alumno f2 (cliente de b1, coach totalmente ajeno a team A) ============
-- No ve ni escribe ningun target de team A, ni el publicado ni el draft.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1a00000-0000-0000-0000-0000000000f2","role":"authenticated"}',true);
DO $t1$ DECLARE v_pub bool; v_draft bool; v_upd int; v_del int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151') INTO v_pub;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152') INTO v_draft;
  IF v_pub OR v_draft THEN RAISE EXCEPTION 'T1 FAIL alumno de otro coach ve targets pub=% draft=%',v_pub,v_draft; END IF;
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=9 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T1 FAIL alumno ajeno edito target publicado rows=%',v_upd; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>0 THEN RAISE EXCEPTION 'T1 FAIL alumno ajeno borro target publicado rows=%',v_del; END IF;
  BEGIN
    INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
      VALUES ('f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a141','f1a00000-0000-0000-0000-000000000902',1);
    RAISE EXCEPTION 'T1 FAIL insert en version publicada de otro coach paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
      VALUES ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000902',1);
    RAISE EXCEPTION 'T1 FAIL insert en draft ajeno paso';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t1$;
RESET role;

-- ============ T2 — alumno f1 (dueno del plan): lee SOLO lo publicado, nunca escribe ============
-- can_read_version exige can_manage_client (false para un alumno) O status en
-- ('published','superseded'): el alumno ve el target publicado pero NO el draft en curso del
-- coach (mismo comportamiento que nutrition_prescription_items_v2).
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1a00000-0000-0000-0000-0000000000f1","role":"authenticated"}',true);
DO $t2$ DECLARE v_pub bool; v_draft bool; v_upd int; v_del int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151') INTO v_pub;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152') INTO v_draft;
  IF NOT (v_pub AND NOT v_draft) THEN RAISE EXCEPTION 'T2 FAIL alumno pub=% draft=%',v_pub,v_draft; END IF;
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=9 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T2 FAIL alumno edito su propio target rows=%',v_upd; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>0 THEN RAISE EXCEPTION 'T2 FAIL alumno borro su propio target rows=%',v_del; END IF;
  BEGIN
    INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
      VALUES ('f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a141','f1a00000-0000-0000-0000-000000000902',1);
    RAISE EXCEPTION 'T2 FAIL alumno inserto target en su version publicada';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
      VALUES ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000902',1);
    RAISE EXCEPTION 'T2 FAIL alumno inserto target en el draft de su coach';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t2$;
RESET role;

-- ============ T3 — coach a1 (dueno/gestor de team A): CRUD completo en el draft ============
-- Ve ambas versiones (manager, sin importar status). Escribe SOLO el draft — la version
-- publicada es inmutable incluso para el dueno (can_edit_version exige status='draft').
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1a00000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
DO $t3$ DECLARE v_pub bool; v_draft bool; v_upd int; v_ins int; v_del int; v_new_id uuid; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151') INTO v_pub;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152') INTO v_draft;
  IF NOT (v_pub AND v_draft) THEN RAISE EXCEPTION 'T3 FAIL dueno pub=% draft=%',v_pub,v_draft; END IF;
  -- inmutabilidad post-publish: 0 filas, ni siquiera para el dueno
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=9 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T3 FAIL dueno edito version publicada rows=%',v_upd; END IF;
  -- CRUD real sobre el draft
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=2.5 WHERE id='f1a00000-0000-0000-0000-00000000a152'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T3 FAIL dueno no pudo editar target del draft rows=%',v_upd; END IF;
  INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
    VALUES ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000902',1)
    RETURNING id INTO v_new_id;
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T3 FAIL dueno no pudo crear target en el draft'; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id=v_new_id; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>1 THEN RAISE EXCEPTION 'T3 FAIL dueno no pudo borrar su propio target del draft rows=%',v_del; END IF;
END $t3$;
RESET role;

-- ============ T4 — coach a2 (miembro NO gestor de team A, pool): CRUD full-access ============
-- Mismo tratamiento full-access del pool que T6 de exchanges-isolation.sql: el pool comparte
-- CRUD completo via private.nutrition_v2_can_manage_client (team_members activo).
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1a00000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
DO $t4$ DECLARE v_draft bool; v_upd int; v_ins int; v_del int; v_new_id uuid; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152') INTO v_draft;
  IF NOT v_draft THEN RAISE EXCEPTION 'T4 FAIL miembro del pool no ve target del draft del team'; END IF;
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=3 WHERE id='f1a00000-0000-0000-0000-00000000a152'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T4 FAIL miembro del pool no pudo editar target rows=%',v_upd; END IF;
  INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
    VALUES ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000902',1)
    RETURNING id INTO v_new_id;
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T4 FAIL miembro del pool no pudo crear target'; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id=v_new_id; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>1 THEN RAISE EXCEPTION 'T4 FAIL miembro del pool no pudo borrar target rows=%',v_del; END IF;
END $t4$;
RESET role;

-- ============ T5 — coach b1 (otro pool, S1): scope re-derivado del PLAN, no del slot ============
-- b1 no tiene NINGUNA relacion con team A/plan A. El slot y la version que referencia el INSERT
-- de abajo EXISTEN de verdad (pasan la FK compuesta nstet_slot_version_fkey) — la unica razon
-- por la que el insert debe fallar es que private.nutrition_v2_can_edit_version re-deriva el
-- scope subiendo version -> nutrition_plans_v2 -> client_id (hallazgo S1), NUNCA confiando en
-- que el meal_slot_id/version_id sean "validos" per se. Si la RLS estuviera mal escrita (ej.
-- confiando en que el slot existe, o en un EXISTS correlacionado sin re-validar el dueno del
-- plan) este bloque es el que lo detectaria.
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1a00000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t5$ DECLARE v_pub bool; v_draft bool; v_upd int; v_del int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a151') INTO v_pub;
  SELECT EXISTS(SELECT 1 FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152') INTO v_draft;
  IF v_pub OR v_draft THEN RAISE EXCEPTION 'T5 FAIL coach de otro pool ve targets de team A pub=% draft=%',v_pub,v_draft; END IF;
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=9 WHERE id='f1a00000-0000-0000-0000-00000000a152'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T5 FAIL coach de otro pool edito target de team A rows=%',v_upd; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id='f1a00000-0000-0000-0000-00000000a152'; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>0 THEN RAISE EXCEPTION 'T5 FAIL coach de otro pool borro target de team A rows=%',v_del; END IF;
  -- slot/version REALES (de Plan A, team A) — el rechazo debe venir del scope del plan, no de
  -- una FK inexistente.
  BEGIN
    INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
      VALUES ('f1a00000-0000-0000-0000-00000000a122','f1a00000-0000-0000-0000-00000000a142','f1a00000-0000-0000-0000-000000000902',1);
    RAISE EXCEPTION 'T5 FAIL insert con slot/version reales de un plan ajeno paso (scope mal re-derivado)';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t5$;
RESET role;

-- ============ T6 — anon: cero privilegios (grants + intento real bloqueado) ============
-- Espejo de T9 de exchanges-isolation.sql: REVOKE total de la migracion, RLS es techo de filas
-- no de privilegios de tabla.
DO $t6$ DECLARE v_anon int; v_extra int; BEGIN
  SELECT count(*) INTO v_anon FROM information_schema.role_table_grants
   WHERE grantee='anon' AND table_schema='public' AND table_name='nutrition_slot_exchange_targets_v2';
  IF v_anon<>0 THEN RAISE EXCEPTION 'T6 FAIL anon tiene % privilegios en la tabla nueva',v_anon; END IF;
  IF has_table_privilege('anon','public.nutrition_slot_exchange_targets_v2','SELECT') THEN RAISE EXCEPTION 'T6 FAIL anon SELECT'; END IF;
  IF has_table_privilege('anon','public.nutrition_slot_exchange_targets_v2','INSERT') THEN RAISE EXCEPTION 'T6 FAIL anon INSERT'; END IF;
  IF has_table_privilege('anon','public.nutrition_slot_exchange_targets_v2','UPDATE') THEN RAISE EXCEPTION 'T6 FAIL anon UPDATE'; END IF;
  IF has_table_privilege('anon','public.nutrition_slot_exchange_targets_v2','DELETE') THEN RAISE EXCEPTION 'T6 FAIL anon DELETE'; END IF;
  SELECT count(*) INTO v_extra FROM information_schema.role_table_grants
   WHERE grantee='authenticated' AND table_schema='public' AND table_name='nutrition_slot_exchange_targets_v2'
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  IF v_extra<>0 THEN RAISE EXCEPTION 'T6 FAIL authenticated tiene % privilegios excesivos',v_extra; END IF;
END $t6$;

-- ============ T7 — service_role: pasa (policy _service, control positivo) ============
SET LOCAL role service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $t7$ DECLARE v_cnt int; v_upd int; v_ins int; v_del int; v_new_id uuid; BEGIN
  SELECT count(*) INTO v_cnt FROM public.nutrition_slot_exchange_targets_v2
   WHERE id IN ('f1a00000-0000-0000-0000-00000000a151','f1a00000-0000-0000-0000-00000000a152');
  IF v_cnt<>2 THEN RAISE EXCEPTION 'T7 FAIL service_role no ve ambos targets cnt=%',v_cnt; END IF;
  UPDATE public.nutrition_slot_exchange_targets_v2 SET portions=1 WHERE id='f1a00000-0000-0000-0000-00000000a151'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>1 THEN RAISE EXCEPTION 'T7 FAIL service_role no pudo editar rows=%',v_upd; END IF;
  INSERT INTO public.nutrition_slot_exchange_targets_v2 (version_id, meal_slot_id, exchange_group_id, portions)
    VALUES ('f1a00000-0000-0000-0000-00000000a121','f1a00000-0000-0000-0000-00000000a141','f1a00000-0000-0000-0000-000000000902',1)
    RETURNING id INTO v_new_id;
  GET DIAGNOSTICS v_ins=ROW_COUNT;
  IF v_ins<>1 THEN RAISE EXCEPTION 'T7 FAIL service_role no pudo insertar'; END IF;
  DELETE FROM public.nutrition_slot_exchange_targets_v2 WHERE id=v_new_id; GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>1 THEN RAISE EXCEPTION 'T7 FAIL service_role no pudo borrar rows=%',v_del; END IF;
END $t7$;
RESET role;

SELECT 'ALL PASSED' AS status;
ROLLBACK;

-- ============================================================================
-- Comando de ejecucion (mismo patron del framework de tests/team — psql directo contra la DB
-- del gate autorizado; NUNCA contra prod fuera del gate, y NUNCA reemplazar el BEGIN/ROLLBACK
-- de arriba por un commit real):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/team/portions-isolation.sql
--
-- Requiere que 20260718140000_nutrition_portions_v2.sql este aplicada en esa DB. Salida
-- esperada: fila 'ALL PASSED' antes del ROLLBACK final (la transaccion NO persiste datos).
-- ============================================================================
