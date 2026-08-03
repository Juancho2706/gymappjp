-- Suite RLS — LISTAS DE EQUIVALENCIA (public.exchange_group_foods, F2 · TASKS.md T5.2).
-- tx + ROLLBACK (no persiste). Datos sinteticos prefijo e9f00000.
-- Spec: specs/nutrition-exchange-lists/SPEC.md §Seguridad.
-- Patron espejo de tests/team/portions-isolation.sql: seed "como postgres" (bypass RLS) +
-- bloques con SET LOCAL role authenticated / set_config del claim + DO $tN$ con
-- RAISE EXCEPTION 'TN FAIL ...'. JAMAS service_role como evidencia de aislamiento.
--
-- EJECUTADA EN LIVE el 2026-08-03 dentro de BEGIN/ROLLBACK: resultado 'ALL PASSED'.
--
-- Comando: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f tests/team/exchange-lists-isolation.sql
BEGIN;

-- ============ Seed sintetico (como postgres, bypass RLS) ============
-- A1 y B1: dos coaches standalone sin relacion. F1 alumno de A1, F2 alumno de B1.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('e9f00000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','egf_a1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e9f00000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','egf_b1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e9f00000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','egf_f1@e.test','x',now(),now(),now(),'{}','{}'),
  ('e9f00000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','egf_f2@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('e9f00000-0000-0000-0000-0000000000a1','egf-a1','A1','EGFA1','EGF-A1'),
  ('e9f00000-0000-0000-0000-0000000000b1','egf-b1','B1','EGFB1','EGF-B1')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email) VALUES
  ('e9f00000-0000-0000-0000-0000000000f1','e9f00000-0000-0000-0000-0000000000a1',NULL,NULL,'F1 de A1','egf_f1@e.test'),
  ('e9f00000-0000-0000-0000-0000000000f2','e9f00000-0000-0000-0000-0000000000b1',NULL,NULL,'F2 de B1','egf_f2@e.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.exchange_groups (id, slug, code, name, coach_id, is_system, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g) VALUES
  ('e9f00000-0000-0000-0000-00000000c001','egf-sys','ZS','Sistema EGF',NULL,true,70,2,15,0),
  ('e9f00000-0000-0000-0000-00000000c002','egf-b1-priv','ZB','Privado de B1','e9f00000-0000-0000-0000-0000000000b1',false,70,2,15,0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.foods (id, name, serving_size, calories, protein_g, carbs_g, fats_g, coach_id, org_id) VALUES
  ('e9f00000-0000-0000-0000-0000000000d1','Arroz EGF global',100,130,3,28,0,NULL,NULL),
  ('e9f00000-0000-0000-0000-0000000000d2','Privado de B1',100,100,5,10,2,'e9f00000-0000-0000-0000-0000000000b1',NULL)
ON CONFLICT (id) DO NOTHING;
-- e0 = fila del catalogo global (40 g) · e1 = A1 escribe ENCIMA (30 g).
INSERT INTO public.exchange_group_foods (id, exchange_group_id, food_id, coach_id, org_id, portion_grams, source) VALUES
  ('e9f00000-0000-0000-0000-0000000000e0','e9f00000-0000-0000-0000-00000000c001','e9f00000-0000-0000-0000-0000000000d1',NULL,NULL,40,'catalog'),
  ('e9f00000-0000-0000-0000-0000000000e1','e9f00000-0000-0000-0000-00000000c001','e9f00000-0000-0000-0000-0000000000d1','e9f00000-0000-0000-0000-0000000000a1',NULL,30,'coach');

SET LOCAL role authenticated;

-- ===== T1: el coach B1 NO ve la fila de A1; si ve la global =====
SELECT set_config('request.jwt.claims', '{"sub":"e9f00000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
DO $t1$
DECLARE v_ajenas int; v_globales int;
BEGIN
  SELECT count(*) INTO v_ajenas FROM public.exchange_group_foods WHERE coach_id = 'e9f00000-0000-0000-0000-0000000000a1';
  SELECT count(*) INTO v_globales FROM public.exchange_group_foods WHERE id = 'e9f00000-0000-0000-0000-0000000000e0';
  IF v_ajenas <> 0 THEN RAISE EXCEPTION 'T1 FAIL: coach B1 ve % filas de A1', v_ajenas; END IF;
  IF v_globales <> 1 THEN RAISE EXCEPTION 'T1 FAIL: coach B1 no ve la fila global'; END IF;
END $t1$;

-- ===== T2: `authenticated` no crea filas GLOBALES ni filas a nombre de otro coach =====
-- El catalogo global es territorio EXCLUSIVO del backfill (service_role).
DO $t2$
BEGIN
  BEGIN
    INSERT INTO public.exchange_group_foods (exchange_group_id, food_id, coach_id, org_id, portion_grams)
    VALUES ('e9f00000-0000-0000-0000-00000000c001','e9f00000-0000-0000-0000-0000000000d2',NULL,NULL,50);
    RAISE EXCEPTION 'T2 FAIL: authenticated creo una fila GLOBAL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.exchange_group_foods (exchange_group_id, food_id, coach_id, org_id, portion_grams)
    VALUES ('e9f00000-0000-0000-0000-00000000c001','e9f00000-0000-0000-0000-0000000000d2','e9f00000-0000-0000-0000-0000000000a1',NULL,50);
    RAISE EXCEPTION 'T2 FAIL: B1 creo una fila a nombre de A1';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t2$;

-- ===== T3: helpers de visibilidad — ni grupo ajeno ni alimento ajeno =====
SELECT set_config('request.jwt.claims', '{"sub":"e9f00000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
DO $t3$
BEGIN
  BEGIN
    INSERT INTO public.exchange_group_foods (exchange_group_id, food_id, coach_id, portion_grams)
    VALUES ('e9f00000-0000-0000-0000-00000000c002','e9f00000-0000-0000-0000-0000000000d1','e9f00000-0000-0000-0000-0000000000a1',50);
    RAISE EXCEPTION 'T3 FAIL: A1 colgo una fila de un grupo privado de B1';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.exchange_group_foods (exchange_group_id, food_id, coach_id, portion_grams)
    VALUES ('e9f00000-0000-0000-0000-00000000c001','e9f00000-0000-0000-0000-0000000000d2','e9f00000-0000-0000-0000-0000000000a1',50);
    RAISE EXCEPTION 'T3 FAIL: A1 clasifico un alimento privado de B1';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t3$;

-- ===== T4: GRANT column-level — identidad y dueno son inmutables desde la app =====
DO $t4$
BEGIN
  BEGIN
    UPDATE public.exchange_group_foods SET exchange_group_id = 'e9f00000-0000-0000-0000-00000000c001'
    WHERE id = 'e9f00000-0000-0000-0000-0000000000e1';
    RAISE EXCEPTION 'T4 FAIL: A1 pudo escribir exchange_group_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.exchange_group_foods SET coach_id = NULL WHERE id = 'e9f00000-0000-0000-0000-0000000000e1';
    RAISE EXCEPTION 'T4 FAIL: A1 pudo escribir coach_id';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.exchange_group_foods SET portion_grams = 35 WHERE id = 'e9f00000-0000-0000-0000-0000000000e1';
  IF NOT FOUND THEN RAISE EXCEPTION 'T4 FAIL: A1 no pudo editar sus propios gramos'; END IF;
END $t4$;

-- ===== T5/T6: el alumno ve la lista de SU coach y solo la de su coach =====
SELECT set_config('request.jwt.claims', '{"sub":"e9f00000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
DO $t5$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.exchange_group_foods WHERE id = 'e9f00000-0000-0000-0000-0000000000e1';
  IF v <> 1 THEN RAISE EXCEPTION 'T5 FAIL: el alumno de A1 no ve la fila de su coach'; END IF;
END $t5$;
SELECT set_config('request.jwt.claims', '{"sub":"e9f00000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
DO $t6$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.exchange_group_foods WHERE id = 'e9f00000-0000-0000-0000-0000000000e1';
  IF v <> 0 THEN RAISE EXCEPTION 'T6 FAIL: el alumno de B1 ve la fila de A1 (FUGA CROSS-TENANT)'; END IF;
END $t6$;

RESET role;
SELECT 'ALL PASSED' AS resultado;
ROLLBACK;
