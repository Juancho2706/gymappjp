-- =============================================================================
-- FEATURE PREFS — RLS isolation (plan-mejorado-menus-preferencias §4.9 / §8.1 / §8.3).
-- Suite de ESCRITURA. Se ejecuta SOLO en el GATE, contra el branch/prod DONDE la migracion
-- 20260618200000_feature_prefs.sql YA esta aplicada (el merge re-ejecuta el historial; las
-- 3 tablas *_feature_prefs + sus policies ya viven).
--
-- Patron de tests/team/team-isolation.sql + tests/separation/module-grants.sql: TODO en UNA
-- transaccion con ROLLBACK al final (NO persiste datos; apto branch o prod). Los casos de
-- NEGACION corren como `authenticated` con request.jwt.claims seteados — JAMAS service_role
-- (service_role tiene grants de tabla y NO ejercitaria la RLS). RESET ROLE = service-role solo
-- para sembrar y para los casos positivos de operador.
--
-- Modelo bajo prueba (plan §4.1): `visible = ENTITLED(billing, server-side) AND ENABLED(pref)`.
-- La PREFERENCIA SOLO ACHICA. Estas tablas son la capa ENABLED; el ENTITLEMENT vive en
-- coaches/teams.enabled_modules (compra-only, NO tocado por ningun toggle de Funciones).
--
-- Cubre (consenso Security/Backend/QA, plan §8.3):
--  (a) un alumno SELECT-ea SOLO su propia client_feature_prefs + las prefs de SU coach/team,
--      y NO puede escribir client_feature_prefs (IDOR / "preference solo achica" sin enforcement DB).
--  (b) coach A no lee NI escribe coach_feature_prefs de coach B.
--  (c) un coach comun del pool (no-manager) NO escribe team_feature_prefs pero SI lo lee.
--  (d) un toggle de Funciones escribe SOLO en *_feature_prefs (NUNCA en coaches/teams.enabled_modules).
--
-- Resultado esperado: una fila 'ALL FEATURE-PREFS RLS TESTS PASSED'. Un FAIL hace RAISE EXCEPTION.
-- Gotcha PostgreSQL: la negacion por RLS de un INSERT/UPDATE no devuelve filas (ROW_COUNT=0 en
-- UPDATE) o levanta 42501 en INSERT con WITH CHECK fallido; los grants de columna de coaches/teams
-- levantan 42501. Los casos atrapan la familia correcta o asertan ROW_COUNT.
-- =============================================================================

BEGIN;

-- ===== SEED (efimero) =========================================================
-- 2 coaches standalone reales (A, B) + 1 team con: owner (manager), co-gestor (manager),
-- coach comun del pool (NO manager) + 1 alumno del pool + 1 alumno standalone de A.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  -- coach standalone A
  ('f0000000-0000-0000-0000-0000000000a0','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- coach standalone B (debe quedar AISLADO de A)
  ('f0000000-0000-0000-0000-0000000000b0','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachB+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- team owner (manager)
  ('f0000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teamOwner+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- team co-gestor (manager)
  ('f0000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teamMgr+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- coach comun del pool (NO manager) -> lee team prefs, NO escribe
  ('f0000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','teamCoach+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- alumno del pool (team)
  ('f1000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoPool+fptest@example.test','x',now(),now(),now(),'{}','{}'),
  -- alumno standalone de A
  ('f1000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoSolo+fptest@example.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code, enabled_modules)
VALUES
  ('f0000000-0000-0000-0000-0000000000a0','fptest-coach-a','Coach A','Brand A','FPTEST-A','{}'::jsonb),
  ('f0000000-0000-0000-0000-0000000000b0','fptest-coach-b','Coach B','Brand B','FPTEST-B','{}'::jsonb),
  ('f0000000-0000-0000-0000-0000000000a1','fptest-team-owner','Team Owner','Brand TO','FPTEST-TO','{}'::jsonb),
  ('f0000000-0000-0000-0000-0000000000a2','fptest-team-mgr','Team Mgr','Brand TM','FPTEST-TM','{}'::jsonb),
  ('f0000000-0000-0000-0000-0000000000a3','fptest-team-coach','Team Coach','Brand TC','FPTEST-TC','{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules)
VALUES
  ('f0000000-0000-0000-0000-00000000eeee','Team Feature Prefs (fptest)','fptest-team','f0000000-0000-0000-0000-0000000000a1',20,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status)
VALUES
  ('f0000000-0000-0000-0000-00000000eeee','f0000000-0000-0000-0000-0000000000a1','Owner',true,'active'),
  ('f0000000-0000-0000-0000-00000000eeee','f0000000-0000-0000-0000-0000000000a2','Manager',true,'active'),
  ('f0000000-0000-0000-0000-00000000eeee','f0000000-0000-0000-0000-0000000000a3','Coach',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

INSERT INTO public.client_accounts (id) VALUES
  ('f1000000-0000-0000-0000-0000000000c1'),('f1000000-0000-0000-0000-0000000000d1')
ON CONFLICT (id) DO NOTHING;

-- alumno de pool: coach_id = el coach comun del pool (tc), team_id set. alumno standalone: coach A.
INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email, is_archived)
VALUES
  ('f1000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000a3',NULL,'f0000000-0000-0000-0000-00000000eeee','Alumno Pool','alumnoPool+fptest@example.test',false),
  ('f1000000-0000-0000-0000-0000000000d1','f0000000-0000-0000-0000-0000000000a0',NULL,NULL,'Alumno Solo','alumnoSolo+fptest@example.test',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_memberships (account_id, client_id, scope, coach_id, org_id, team_id, status)
VALUES
  ('f1000000-0000-0000-0000-0000000000c1','f1000000-0000-0000-0000-0000000000c1','team','f0000000-0000-0000-0000-0000000000a3',NULL,'f0000000-0000-0000-0000-00000000eeee','active'),
  ('f1000000-0000-0000-0000-0000000000d1','f1000000-0000-0000-0000-0000000000d1','standalone','f0000000-0000-0000-0000-0000000000a0',NULL,NULL,'active')
ON CONFLICT DO NOTHING;

-- Sembramos prefs base (como service-role) que luego se leen/intentan mutar bajo authenticated:
--  * coach A y coach B tienen cada uno su fila coach_feature_prefs (aislamiento A vs B).
--  * el team tiene su fila team_feature_prefs (alumno de pool + coach comun la LEEN).
--  * el alumno standalone tiene su client_feature_prefs (se lee a si mismo).
INSERT INTO public.coach_feature_prefs (coach_id, domain, preset, sections)
VALUES
  ('f0000000-0000-0000-0000-0000000000a0','nutrition','intermedio','{"recipes":true}'::jsonb),
  ('f0000000-0000-0000-0000-0000000000b0','nutrition','profesional','{"micros_base":true}'::jsonb)
ON CONFLICT (coach_id, domain) DO NOTHING;

INSERT INTO public.team_feature_prefs (team_id, domain, preset, sections)
VALUES
  ('f0000000-0000-0000-0000-00000000eeee','nutrition','intermedio','{"plate":true}'::jsonb)
ON CONFLICT (team_id, domain) DO NOTHING;

INSERT INTO public.client_feature_prefs (client_id, domain, sections)
VALUES
  ('f1000000-0000-0000-0000-0000000000d1','nutrition','{"recipes":false}'::jsonb)
ON CONFLICT (client_id, domain) DO NOTHING;

-- ===== TESTS ==================================================================
SET LOCAL ROLE authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- (a) ALUMNO: lectura propia + lectura de prefs de su coach; NO escribe client_feature_prefs.
-- ════════════════════════════════════════════════════════════════════════════

-- ---- CASO 1a: alumno standalone LEE su propia client_feature_prefs (1 fila) -------------------
SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.client_feature_prefs WHERE client_id='f1000000-0000-0000-0000-0000000000d1';
  IF n <> 1 THEN RAISE EXCEPTION 'CASO1a FAIL: alumno standalone no lee su propia fila (n=%)', n; END IF;
END $$;

-- ---- CASO 1b: alumno standalone LEE la coach_feature_prefs de SU coach (A) -> 1 fila ----------
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.coach_feature_prefs WHERE coach_id='f0000000-0000-0000-0000-0000000000a0';
  IF n <> 1 THEN RAISE EXCEPTION 'CASO1b FAIL: alumno no lee las prefs de su coach (n=%)', n; END IF;
END $$;

-- ---- CASO 1c: alumno NO ve prefs de OTRO coach (B) ni de OTRO alumno -> 0 filas ---------------
DO $$ DECLARE nc int; ncl int; BEGIN
  SELECT count(*) INTO nc  FROM public.coach_feature_prefs  WHERE coach_id='f0000000-0000-0000-0000-0000000000b0';
  SELECT count(*) INTO ncl FROM public.client_feature_prefs WHERE client_id <> 'f1000000-0000-0000-0000-0000000000d1';
  IF nc <> 0 OR ncl <> 0 THEN RAISE EXCEPTION 'CASO1c FAIL: alumno ve prefs ajenas (coachB=% otroAlumno=%)', nc, ncl; END IF;
END $$;

-- ---- CASO 2: alumno NO puede ESCRIBIR su client_feature_prefs (INSERT/UPDATE/DELETE) ----------
-- "preference solo achica" no tiene enforcement DB para el alumno: la RLS de escritura del
-- alumno simplemente NO existe (solo coach/manager escriben). INSERT con WITH CHECK fallido ->
-- 42501. UPDATE/DELETE sin USING que matchee -> 0 filas afectadas (silencioso, NO error).
DO $$ DECLARE ins bool:=false; up int; del int; BEGIN
  -- INSERT de una fila NUEVA para si mismo: ninguna policy INSERT lo autoriza -> 42501.
  BEGIN
    INSERT INTO public.client_feature_prefs (client_id, domain, sections)
    VALUES ('f1000000-0000-0000-0000-0000000000d1','training','{"x":true}'::jsonb);
    RAISE EXCEPTION 'CASO2 FAIL: alumno pudo INSERTAR client_feature_prefs';
  EXCEPTION WHEN insufficient_privilege THEN ins:=true; END;
  -- UPDATE de su propia fila existente: ninguna USING de UPDATE lo cubre -> 0 filas.
  UPDATE public.client_feature_prefs SET sections='{"recipes":true}'::jsonb
    WHERE client_id='f1000000-0000-0000-0000-0000000000d1' AND domain='nutrition';
  GET DIAGNOSTICS up=ROW_COUNT;
  -- DELETE de su propia fila: idem -> 0 filas.
  DELETE FROM public.client_feature_prefs
    WHERE client_id='f1000000-0000-0000-0000-0000000000d1' AND domain='nutrition';
  GET DIAGNOSTICS del=ROW_COUNT;
  IF NOT (ins AND up=0 AND del=0) THEN
    RAISE EXCEPTION 'CASO2 FAIL: alumno escribio client_feature_prefs (insert=% update_rows=% delete_rows=%)', ins, up, del;
  END IF;
END $$;

-- ---- CASO 3: alumno de POOL lee la team_feature_prefs de SU team (via clients.team_id) -> 1 ---
-- (gap §8.1.3 cubierto: sin esta rama el alumno pooled leeria 0 -> todo OFF.)
SET LOCAL request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.team_feature_prefs WHERE team_id='f0000000-0000-0000-0000-00000000eeee';
  IF n <> 1 THEN RAISE EXCEPTION 'CASO3 FAIL: alumno de pool no lee la pref de su team (n=%)', n; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (b) COACH A vs COACH B: aislamiento de coach_feature_prefs (lectura + escritura).
-- ════════════════════════════════════════════════════════════════════════════

-- ---- CASO 4: coach A NO LEE la fila de coach B -> 0; SI lee la suya -> 1 ----------------------
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000a0","role":"authenticated"}';
DO $$ DECLARE nb int; na int; BEGIN
  SELECT count(*) INTO nb FROM public.coach_feature_prefs WHERE coach_id='f0000000-0000-0000-0000-0000000000b0';
  SELECT count(*) INTO na FROM public.coach_feature_prefs WHERE coach_id='f0000000-0000-0000-0000-0000000000a0';
  IF nb <> 0 THEN RAISE EXCEPTION 'CASO4 FAIL: coach A LEE la fila de coach B (nb=%)', nb; END IF;
  IF na <> 1 THEN RAISE EXCEPTION 'CASO4 FAIL: coach A no lee su propia fila (na=%)', na; END IF;
END $$;

-- ---- CASO 5: coach A NO ESCRIBE la fila de coach B (INSERT 42501; UPDATE/DELETE 0 filas) ------
DO $$ DECLARE ins bool:=false; up int; del int; own int; BEGIN
  -- INSERT de una fila para coach B: WITH CHECK (coach_id = auth.uid()) falla -> 42501.
  BEGIN
    INSERT INTO public.coach_feature_prefs (coach_id, domain, preset, sections)
    VALUES ('f0000000-0000-0000-0000-0000000000b0','training','basico','{"x":true}'::jsonb);
    RAISE EXCEPTION 'CASO5 FAIL: coach A INSERTO una fila de coach B';
  EXCEPTION WHEN insufficient_privilege THEN ins:=true; END;
  -- UPDATE de la fila de B: USING (coach_id=auth.uid()) no matchea -> 0 filas.
  UPDATE public.coach_feature_prefs SET sections='{"recipes":false}'::jsonb
    WHERE coach_id='f0000000-0000-0000-0000-0000000000b0' AND domain='nutrition';
  GET DIAGNOSTICS up=ROW_COUNT;
  -- DELETE de la fila de B -> 0 filas.
  DELETE FROM public.coach_feature_prefs WHERE coach_id='f0000000-0000-0000-0000-0000000000b0' AND domain='nutrition';
  GET DIAGNOSTICS del=ROW_COUNT;
  -- POSITIVO: coach A SI escribe la SUYA (UPDATE de su propia fila) -> 1 fila.
  UPDATE public.coach_feature_prefs SET sections='{"recipes":false}'::jsonb
    WHERE coach_id='f0000000-0000-0000-0000-0000000000a0' AND domain='nutrition';
  GET DIAGNOSTICS own=ROW_COUNT;
  IF NOT (ins AND up=0 AND del=0 AND own=1) THEN
    RAISE EXCEPTION 'CASO5 FAIL: aislamiento coach (insertB=% updateB=% deleteB=% updateOwn=%)', ins, up, del, own;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (c) COACH COMUN DEL POOL (no-manager): LEE team_feature_prefs, NO la ESCRIBE.
-- ════════════════════════════════════════════════════════════════════════════

-- ---- CASO 6: coach comun del pool LEE la team_feature_prefs de su team -> 1 fila --------------
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.team_feature_prefs WHERE team_id='f0000000-0000-0000-0000-00000000eeee';
  IF n <> 1 THEN RAISE EXCEPTION 'CASO6 FAIL: coach comun del pool no LEE la pref del team (n=%)', n; END IF;
END $$;

-- ---- CASO 7: coach comun del pool NO ESCRIBE team_feature_prefs (no es manager) ---------------
-- INSERT (WITH CHECK managed_team_ids) -> 42501; UPDATE/DELETE (USING managed_team_ids) -> 0 filas.
DO $$ DECLARE ins bool:=false; up int; del int; BEGIN
  BEGIN
    INSERT INTO public.team_feature_prefs (team_id, domain, preset, sections)
    VALUES ('f0000000-0000-0000-0000-00000000eeee','training','basico','{"x":true}'::jsonb);
    RAISE EXCEPTION 'CASO7 FAIL: coach comun del pool INSERTO team_feature_prefs';
  EXCEPTION WHEN insufficient_privilege THEN ins:=true; END;
  UPDATE public.team_feature_prefs SET sections='{"plate":false}'::jsonb
    WHERE team_id='f0000000-0000-0000-0000-00000000eeee' AND domain='nutrition';
  GET DIAGNOSTICS up=ROW_COUNT;
  DELETE FROM public.team_feature_prefs WHERE team_id='f0000000-0000-0000-0000-00000000eeee' AND domain='nutrition';
  GET DIAGNOSTICS del=ROW_COUNT;
  IF NOT (ins AND up=0 AND del=0) THEN
    RAISE EXCEPTION 'CASO7 FAIL: coach comun del pool escribio team prefs (insert=% update=% delete=%)', ins, up, del;
  END IF;
END $$;

-- ---- CASO 8: el MANAGER (co-gestor) SI escribe team_feature_prefs -> OK -----------------------
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE up int; BEGIN
  UPDATE public.team_feature_prefs SET sections='{"plate":true,"recipes":true}'::jsonb
    WHERE team_id='f0000000-0000-0000-0000-00000000eeee' AND domain='nutrition';
  GET DIAGNOSTICS up=ROW_COUNT;
  IF up <> 1 THEN RAISE EXCEPTION 'CASO8 FAIL: el manager no pudo escribir team_feature_prefs (rows=%)', up; END IF;
END $$;

-- ---- CASO 9: el MANAGER escribe el override por-alumno del POOL (client_feature_prefs) -> OK --
-- (managers del pool escriben overrides de cualquier alumno del team via current_user_managed_team_ids.)
DO $$ DECLARE ins int; BEGIN
  INSERT INTO public.client_feature_prefs (client_id, domain, sections)
  VALUES ('f1000000-0000-0000-0000-0000000000c1','nutrition','{"recipes":false}'::jsonb)
  ON CONFLICT (client_id, domain) DO UPDATE SET sections=EXCLUDED.sections;
  GET DIAGNOSTICS ins=ROW_COUNT;
  IF ins <> 1 THEN RAISE EXCEPTION 'CASO9 FAIL: el manager no pudo escribir el override del alumno de pool (rows=%)', ins; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (d) Un toggle de Funciones NUNCA toca enabled_modules (compra-only). Defensa de §8.2.
-- ════════════════════════════════════════════════════════════════════════════

-- ---- CASO 10: coach A NO puede escribir coaches.enabled_modules -> 42501 (grant de columna) ---
-- El toggle de Funciones escribe SOLO *_feature_prefs; el grant de columna garantiza que ni
-- siquiera por error puede tocar enabled_modules (lo pisaria el trigger D1 + regalaria pago).
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000a0","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN UPDATE public.coaches SET enabled_modules='{"nutrition_exchanges":true}'::jsonb
        WHERE id='f0000000-0000-0000-0000-0000000000a0';
  EXCEPTION WHEN insufficient_privilege THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'CASO10 FAIL: coach A pudo escribir coaches.enabled_modules desde el path de toggles'; END IF;
END $$;

-- ---- CASO 11: el MANAGER NO puede escribir teams.enabled_modules -> 42501 (grant de columna) --
SET LOCAL request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN UPDATE public.teams SET enabled_modules='{"body_composition":true}'::jsonb
        WHERE id='f0000000-0000-0000-0000-00000000eeee';
  EXCEPTION WHEN insufficient_privilege THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'CASO11 FAIL: el manager pudo escribir teams.enabled_modules desde el path de toggles'; END IF;
END $$;

-- ---- CASO 12: enabled_modules de A y del team siguen INTACTOS ('{}') tras los toggles ----------
-- (Verifica el invariante: nada de lo anterior muto el entitlement.)
RESET ROLE;
DO $$ DECLARE ca jsonb; tt jsonb; BEGIN
  SELECT enabled_modules INTO ca FROM public.coaches WHERE id='f0000000-0000-0000-0000-0000000000a0';
  SELECT enabled_modules INTO tt FROM public.teams   WHERE id='f0000000-0000-0000-0000-00000000eeee';
  IF ca <> '{}'::jsonb THEN RAISE EXCEPTION 'CASO12 FAIL: coaches.enabled_modules de A muto (=%)', ca; END IF;
  IF tt <> '{}'::jsonb THEN RAISE EXCEPTION 'CASO12 FAIL: teams.enabled_modules del team muto (=%)', tt; END IF;
END $$;

RESET ROLE;
SELECT 'ALL FEATURE-PREFS RLS TESTS PASSED' AS result;
ROLLBACK;
