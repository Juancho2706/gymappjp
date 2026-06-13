-- =============================================================================
-- MODULE COMPRA-ONLY — grants/triggers de hardening (plan estrategia 03, F2.2).
-- Suite de ESCRITURA. Se ejecuta SOLO en el GATE, contra el branch efimero DONDE las
-- migraciones 20260612140000_modules_compra_only_grants.sql y
-- 20260612140001_clients_scoping_grants.sql YA estan aplicadas (el merge re-ejecuta el
-- historial; en el branch los grants/triggers ya viven).
--
-- Patron de tests/team/team-isolation.sql: TODO en UNA transaccion con ROLLBACK al final
-- (NO persiste datos; apto branch o prod). Los casos de NEGACION corren como `authenticated`
-- con request.jwt.claims seteados — JAMAS service_role (service_role tiene grants de tabla y
-- NO ejercitaria el 42501). service_role solo se usa en los casos POSITIVOS de operador
-- (6) y en el clawback (12), via RESET ROLE (la conexion MCP corre como postgres/service).
--
-- Resultado esperado: una fila 'ALL MODULE-GRANTS TESTS PASSED'. Un FAIL hace RAISE EXCEPTION.
--
-- Gotcha PostgreSQL: la denegacion por grant de COLUMNA levanta SQLSTATE 42501
-- (insufficient_privilege). El RAISE EXCEPTION de un trigger sin errcode levanta P0001
-- (raise_exception). Los casos atrapan la familia correcta.
-- =============================================================================

BEGIN;

-- ===== SEED (efimero) =========================================================
-- 2 coaches "reales" (NO @evatest.cl) + 1 coach de prueba (@evatest.cl, debe sobrevivir al
-- clawback) + 1 team con owner real + 1 alumno team. Emails *.test para no chocar con prod.
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  -- coach standalone real (con modulos ON -> el clawback debe vaciarlo)
  ('d0000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachStandalone+grantstest@example.test','x',now(),now(),now(),'{}','{}'),
  -- coach owner de team real (con modulos ON en el TEAM)
  ('d0000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachTeamOwner+grantstest@example.test','x',now(),now(),now(),'{}','{}'),
  -- coach de PRUEBA (@evatest.cl) -> excluido del clawback, conserva modulos
  ('d0000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2e-grantstest-coach@evatest.cl','x',now(),now(),now(),'{}','{}'),
  -- alumno del team
  ('d1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoTeam+grantstest@example.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code, enabled_modules)
VALUES
  ('d0000000-0000-0000-0000-0000000000d1','grantstest-standalone','Coach Standalone','Brand Solo','GRTS1','{"cardio":true}'::jsonb),
  ('d0000000-0000-0000-0000-0000000000d2','grantstest-teamowner','Coach Team Owner','Brand Owner','GRTS2','{}'::jsonb),
  ('d0000000-0000-0000-0000-0000000000d3','grantstest-e2e-coach','Coach E2E (test)','Brand E2E','GRTS3','{"cardio":true,"nutrition_exchanges":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- team real con modulos ON (clawback debe vaciarlo: owner NO es @evatest.cl y slug no es de prueba)
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules)
VALUES
  ('d0000000-0000-0000-0000-00000000dddd','Team Grantstest (real)','grantstest-team-real','d0000000-0000-0000-0000-0000000000d2',10,'{"cardio":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status)
VALUES
  ('d0000000-0000-0000-0000-00000000dddd','d0000000-0000-0000-0000-0000000000d2','Owner',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

-- client_accounts (FK de clients.id en el modelo de cuentas) + alumno team-scoped
INSERT INTO public.client_accounts (id) VALUES ('d1000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email, goal_weight_kg, is_archived)
VALUES
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000d2',NULL,'d0000000-0000-0000-0000-00000000dddd','Alumno Grantstest','alumnoTeam+grantstest@example.test',NULL,false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_memberships (account_id, client_id, scope, coach_id, org_id, team_id, status)
VALUES
  ('d1000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','team','d0000000-0000-0000-0000-0000000000d2',NULL,'d0000000-0000-0000-0000-00000000dddd','active')
ON CONFLICT DO NOTHING;

-- ===== TESTS ==================================================================
SET LOCAL ROLE authenticated;

-- ---- CASO 1: coach standalone NO puede escribir columnas de billing/modulos -> 42501 ----------
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
DO $$ DECLARE m bool:=false; t bool:=false; s bool:=false; mc bool:=false; BEGIN
  BEGIN UPDATE public.coaches SET enabled_modules='{"cardio":true,"body_composition":true}'::jsonb WHERE id='d0000000-0000-0000-0000-0000000000d1'; EXCEPTION WHEN insufficient_privilege THEN m:=true; END;
  BEGIN UPDATE public.coaches SET subscription_tier='elite' WHERE id='d0000000-0000-0000-0000-0000000000d1'; EXCEPTION WHEN insufficient_privilege THEN t:=true; END;
  BEGIN UPDATE public.coaches SET subscription_status='active' WHERE id='d0000000-0000-0000-0000-0000000000d1'; EXCEPTION WHEN insufficient_privilege THEN s:=true; END;
  BEGIN UPDATE public.coaches SET max_clients=9999 WHERE id='d0000000-0000-0000-0000-0000000000d1'; EXCEPTION WHEN insufficient_privilege THEN mc:=true; END;
  IF NOT (m AND t AND s AND mc) THEN RAISE EXCEPTION 'CASO1 FAIL modules=% tier=% status=% maxClients=%', m,t,s,mc; END IF;
END $$;

-- ---- CASO 2: el mismo coach SI puede escribir su branding (allowlist viva) -> OK --------------
DO $$ DECLARE u1 int; u2 int; BEGIN
  UPDATE public.coaches SET brand_name='Brand Renombrada', primary_color='#123456' WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS u1=ROW_COUNT;
  UPDATE public.coaches SET onboarding_guide='{"step":1}'::jsonb WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS u2=ROW_COUNT;
  IF NOT (u1=1 AND u2=1) THEN RAISE EXCEPTION 'CASO2 FAIL branding=% onboarding=%', u1,u2; END IF;
END $$;

-- ---- CASO 3: INSERT INTO coaches como authenticated -> denegado (policy dropeada + grant revocado)
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN
    INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code)
    VALUES ('d0000000-0000-0000-0000-0000000000e9','grantstest-illegal','Illegal','Illegal','GRTSX');
    -- si llega aca el INSERT paso: FAIL
    RAISE EXCEPTION 'CASO3 FAIL: INSERT de coaches como authenticated permitido';
  EXCEPTION
    WHEN insufficient_privilege THEN b:=true;   -- grant revocado
    WHEN check_violation THEN b:=true;          -- (red de seguridad)
  END;
  IF NOT b THEN RAISE EXCEPTION 'CASO3 FAIL'; END IF;
END $$;

-- ---- CASO 4: team owner NO puede escribir enabled_modules ni seat_limit; SI primary_color -----
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
DO $$ DECLARE em bool:=false; sl bool:=false; pc int; BEGIN
  BEGIN UPDATE public.teams SET enabled_modules='{"cardio":true}'::jsonb WHERE id='d0000000-0000-0000-0000-00000000dddd'; EXCEPTION WHEN insufficient_privilege THEN em:=true; END;
  -- seat_limit: bloqueado por el grant de columna (42501). El trigger endurecido es la 2da capa (caso 10).
  BEGIN UPDATE public.teams SET seat_limit=999 WHERE id='d0000000-0000-0000-0000-00000000dddd'; EXCEPTION WHEN insufficient_privilege THEN sl:=true; END;
  UPDATE public.teams SET primary_color='#EC4899' WHERE id='d0000000-0000-0000-0000-00000000dddd'; GET DIAGNOSTICS pc=ROW_COUNT;
  IF NOT (em AND sl AND pc=1) THEN RAISE EXCEPTION 'CASO4 FAIL modules=% seat=% brand=%', em,sl,pc; END IF;
END $$;

-- ---- CASO 5: transfer_team_ownership invocada por el owner -> OK (SECURITY DEFINER intacto) ----
-- El owner transfiere a un coach que primero debe ser miembro del team (precondicion de la RPC).
-- Insertamos al coach d3 como miembro como service-role (el alta de miembro no es parte de F2),
-- volvemos a authenticated owner y ejecutamos la transferencia.
RESET ROLE;
INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status)
VALUES ('d0000000-0000-0000-0000-00000000dddd','d0000000-0000-0000-0000-0000000000d3','Coach',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
DO $$ DECLARE v_owner uuid; BEGIN
  PERFORM public.transfer_team_ownership('d0000000-0000-0000-0000-00000000dddd','d0000000-0000-0000-0000-0000000000d3');
  SELECT owner_coach_id INTO v_owner FROM public.teams WHERE id='d0000000-0000-0000-0000-00000000dddd';
  IF v_owner <> 'd0000000-0000-0000-0000-0000000000d3' THEN RAISE EXCEPTION 'CASO5 FAIL: owner no cambio (owner=%)', v_owner; END IF;
END $$;
-- restaurar owner d2 para el resto de los casos. NO via la RPC: transfer_team_ownership exige
-- auth.uid()=owner actual, y como service-role (RESET ROLE) auth.uid() es NULL -> fallaria. Lo
-- restauramos con UPDATE directo como service-role (exento del trigger endurecido).
RESET ROLE;
UPDATE public.teams SET owner_coach_id='d0000000-0000-0000-0000-0000000000d2' WHERE id='d0000000-0000-0000-0000-00000000dddd';

-- ---- CASO 6: service-role SI puede escribir enabled_modules en coaches y teams -> OK ----------
-- (RESET ROLE: la conexion MCP corre como postgres/service -> exenta de los grants de columna.)
DO $$ DECLARE uc int; ut int; BEGIN
  UPDATE public.coaches SET enabled_modules='{"cardio":true,"movement_assessment":true}'::jsonb WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS uc=ROW_COUNT;
  UPDATE public.teams SET enabled_modules='{"cardio":true}'::jsonb WHERE id='d0000000-0000-0000-0000-00000000dddd'; GET DIAGNOSTICS ut=ROW_COUNT;
  IF NOT (uc=1 AND ut=1) THEN RAISE EXCEPTION 'CASO6 FAIL coaches=% teams=%', uc,ut; END IF;
END $$;

-- ---- CASO 7: regresion de branding standalone + marca del team (columnas del allowlist) -> OK --
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.coaches SET full_name='Coach Renombrado', loader_text='Cargando…', welcome_message='Hola' WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS u=ROW_COUNT;
  IF u<>1 THEN RAISE EXCEPTION 'CASO7a FAIL branding coach standalone u=%', u; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.teams SET name='Team Renombrado', accent_light='#fff', logo_url_dark='x' WHERE id='d0000000-0000-0000-0000-00000000dddd'; GET DIAGNOSTICS u=ROW_COUNT;
  IF u<>1 THEN RAISE EXCEPTION 'CASO7b FAIL marca team u=%', u; END IF;
END $$;

-- ---- CASO 8: clients scoping (F2.1b): team_id/org_id/coach_id -> 42501; perfil -> OK ----------
-- coach standalone (d1) sobre su propio contexto y coach de team (d2) sobre el alumno del pool.
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
DO $$ DECLARE bt bool:=false; bo bool:=false; bc bool:=false; gp int; ar int; BEGIN
  BEGIN UPDATE public.clients SET team_id=NULL WHERE id='d1000000-0000-0000-0000-000000000001'; EXCEPTION WHEN insufficient_privilege THEN bt:=true; END;
  BEGIN UPDATE public.clients SET org_id='d0000000-0000-0000-0000-00000000aaaa' WHERE id='d1000000-0000-0000-0000-000000000001'; EXCEPTION WHEN insufficient_privilege THEN bo:=true; END;
  BEGIN UPDATE public.clients SET coach_id='d0000000-0000-0000-0000-0000000000d3' WHERE id='d1000000-0000-0000-0000-000000000001'; EXCEPTION WHEN insufficient_privilege THEN bc:=true; END;
  -- columnas de perfil del allowlist -> OK
  UPDATE public.clients SET goal_weight_kg=72 WHERE id='d1000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS gp=ROW_COUNT;
  UPDATE public.clients SET is_archived=true WHERE id='d1000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS ar=ROW_COUNT;
  IF NOT (bt AND bo AND bc AND gp=1 AND ar=1) THEN RAISE EXCEPTION 'CASO8 FAIL team=% org=% coach=% goal=% archive=%', bt,bo,bc,gp,ar; END IF;
END $$;

-- ---- CASO 9: invite_code set-once en coaches: NULL/vacio -> valor OK; valor -> otro -> excepcion;
--             service-role -> OK ----------------------------------------------------------------
-- 9a: como authenticated, "valor valido -> otro valor" -> excepcion del trigger (P0001).
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN UPDATE public.coaches SET invite_code='MUTAT' WHERE id='d0000000-0000-0000-0000-0000000000d1'; EXCEPTION WHEN raise_exception THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'CASO9a FAIL: cambio de invite_code valido->otro permitido'; END IF;
END $$;
-- 9b: backfill legacy (vacio -> valor) PERMITIDO. Vaciamos el codigo como service-role (simula la
-- fila legacy sin codigo valido) y luego el coach lo backfillea user-scoped.
RESET ROLE;
UPDATE public.coaches SET invite_code='' WHERE id='d0000000-0000-0000-0000-0000000000d1';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.coaches SET invite_code='BCKFL' WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS u=ROW_COUNT;
  IF u<>1 THEN RAISE EXCEPTION 'CASO9b FAIL: backfill vacio->valor no permitido u=%', u; END IF;
END $$;
-- 9c: service-role puede corregir un codigo ya valido -> OK (exento del trigger).
RESET ROLE;
DO $$ DECLARE u int; BEGIN
  UPDATE public.coaches SET invite_code='ADMNX' WHERE id='d0000000-0000-0000-0000-0000000000d1'; GET DIAGNOSTICS u=ROW_COUNT;
  IF u<>1 THEN RAISE EXCEPTION 'CASO9c FAIL: service-role no pudo corregir invite_code u=%', u; END IF;
END $$;

-- ---- CASO 10: trigger endurecido de teams (defensa en profundidad) ----------------------------
-- Sin transaccion anidada, el observable seria el 42501 del grant (no ejercita el trigger). Con un
-- GRANT UPDATE(seat_limit) temporal el grant deja de bloquear y se ejercita teams_guard_owner_fields,
-- que DEBE levantar excepcion incluso para el owner. SAVEPOINT/ROLLBACK TO revierte el grant temporal.
SAVEPOINT before_temp_grant;
GRANT UPDATE (seat_limit) ON public.teams TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';
DO $$ DECLARE b bool:=false; BEGIN
  BEGIN UPDATE public.teams SET seat_limit=777 WHERE id='d0000000-0000-0000-0000-00000000dddd'; EXCEPTION WHEN raise_exception THEN b:=true; END;
  IF NOT b THEN RAISE EXCEPTION 'CASO10 FAIL: trigger endurecido no bloqueo seat_limit del owner con grant temporal'; END IF;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT before_temp_grant;   -- revierte el GRANT temporal de seat_limit

-- ---- CASO 11: drift de grants vs information_schema.column_privileges == allowlist EXACTO -------
-- El set de columnas con UPDATE para `authenticated` en coaches/teams/clients debe ser EXACTAMENTE
-- el allowlist esperado (ni una mas, ni una menos). Detecta drift de migraciones futuras.
DO $$
DECLARE
  v_actual text[];
  v_expected text[];
  v_extra text[];
  v_missing text[];
BEGIN
  -- coaches
  SELECT array_agg(column_name ORDER BY column_name) INTO v_actual
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='coaches' AND grantee='authenticated' AND privilege_type='UPDATE';
  v_expected := ARRAY[
    'brand_name','full_name','invite_code','loader_icon_mode','loader_text','loader_text_color',
    'logo_url','onboarding_guide','primary_color','updated_at','use_brand_colors_coach',
    'use_custom_loader','welcome_message','welcome_modal_content','welcome_modal_enabled',
    'welcome_modal_type','welcome_modal_updated_at','welcome_modal_version'
  ]::text[];
  v_actual := COALESCE(v_actual, ARRAY[]::text[]);
  SELECT array_agg(c) INTO v_extra   FROM (SELECT unnest(v_actual)   EXCEPT SELECT unnest(v_expected)) s(c);
  SELECT array_agg(c) INTO v_missing FROM (SELECT unnest(v_expected) EXCEPT SELECT unnest(v_actual))   s(c);
  IF v_extra IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CASO11 FAIL coaches drift: extra=% missing=%', v_extra, v_missing;
  END IF;

  -- teams (sin updated_at — no existe esa columna)
  SELECT array_agg(column_name ORDER BY column_name) INTO v_actual
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='teams' AND grantee='authenticated' AND privilege_type='UPDATE';
  v_expected := ARRAY[
    'accent_dark','accent_light','loader_icon_mode','loader_text','loader_text_color',
    'logo_url','logo_url_dark','name','neutral_tint','primary_color','splash_bg_color','use_custom_loader'
  ]::text[];
  v_actual := COALESCE(v_actual, ARRAY[]::text[]);
  SELECT array_agg(c) INTO v_extra   FROM (SELECT unnest(v_actual)   EXCEPT SELECT unnest(v_expected)) s(c);
  SELECT array_agg(c) INTO v_missing FROM (SELECT unnest(v_expected) EXCEPT SELECT unnest(v_actual))   s(c);
  IF v_extra IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CASO11 FAIL teams drift: extra=% missing=%', v_extra, v_missing;
  END IF;

  -- clients (todas MENOS id/org_id/team_id/coach_id)
  SELECT array_agg(column_name ORDER BY column_name) INTO v_actual
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='clients' AND grantee='authenticated' AND privilege_type='UPDATE';
  v_expected := ARRAY[
    'age_confirmed_at','birth_date','created_at','email','force_password_change','full_name',
    'goal_weight_kg','is_active','is_archived','max_hr_override','onboarding_completed','phone',
    'ref_5k_time_sec','resting_hr','subscription_start_date','updated_at','use_coach_brand_colors'
  ]::text[];
  v_actual := COALESCE(v_actual, ARRAY[]::text[]);
  SELECT array_agg(c) INTO v_extra   FROM (SELECT unnest(v_actual)   EXCEPT SELECT unnest(v_expected)) s(c);
  SELECT array_agg(c) INTO v_missing FROM (SELECT unnest(v_expected) EXCEPT SELECT unnest(v_actual))   s(c);
  IF v_extra IS NOT NULL OR v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CASO11 FAIL clients drift: extra=% missing=%', v_extra, v_missing;
  END IF;
END $$;

-- ---- CASO 12: CLAWBACK — post-UPDATE, COUNT(coaches con modulos AND no-test) = 0 ---------------
-- Ejecuta el MISMO clawback de la migracion contra la data seeded (como service-role: la conexion
-- MCP corre como postgres) y verifica el invariante. d1/d2 (reales, fuera del seed E2E) deben
-- quedar en '{}'; d3 (@evatest.cl) conserva sus modulos. El team real (owner d2, slug no-test)
-- queda en '{}'; los teams de prueba (no presentes en este seed) no se tocan.
-- Restauramos modulos a d1 (el caso 6 lo dejo con modulos) para que el clawback tenga algo que vaciar.
UPDATE public.coaches SET enabled_modules='{"cardio":true}'::jsonb WHERE id='d0000000-0000-0000-0000-0000000000d1';

-- clawback coaches (copia exacta de la migracion)
UPDATE public.coaches SET enabled_modules='{}'::jsonb
WHERE enabled_modules <> '{}'::jsonb
  AND id NOT IN (
    SELECT c.id FROM public.coaches c
    JOIN auth.users u ON u.id = c.id
    WHERE u.email LIKE '%@evatest.cl'
  );

-- clawback teams (copia exacta de la migracion; slug de prueba placeholder)
UPDATE public.teams SET enabled_modules='{}'::jsonb
WHERE enabled_modules <> '{}'::jsonb
  AND id NOT IN (
    SELECT t.id FROM public.teams t
    JOIN public.coaches c ON c.id = t.owner_coach_id
    JOIN auth.users u ON u.id = c.id
    WHERE u.email LIKE '%@evatest.cl'
  )
  AND slug NOT IN ('e2e-pool-vortex');

DO $$ DECLARE v_real_coaches int; v_test_coach jsonb; v_real_team int; BEGIN
  -- 0 coaches REALES (seed *.test, no @evatest.cl) con modulos.
  SELECT count(*) INTO v_real_coaches
  FROM public.coaches c JOIN auth.users u ON u.id = c.id
  WHERE c.id IN ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000d2','d0000000-0000-0000-0000-0000000000d3')
    AND c.enabled_modules <> '{}'::jsonb
    AND u.email NOT LIKE '%@evatest.cl';
  IF v_real_coaches <> 0 THEN RAISE EXCEPTION 'CASO12 FAIL: % coaches reales con modulos tras el clawback', v_real_coaches; END IF;
  -- el coach de prueba (@evatest.cl) conserva sus modulos.
  SELECT enabled_modules INTO v_test_coach FROM public.coaches WHERE id='d0000000-0000-0000-0000-0000000000d3';
  IF v_test_coach = '{}'::jsonb THEN RAISE EXCEPTION 'CASO12 FAIL: el coach de prueba @evatest.cl perdio sus modulos'; END IF;
  -- 0 teams REALES con modulos.
  SELECT count(*) INTO v_real_team
  FROM public.teams t JOIN public.coaches c ON c.id = t.owner_coach_id JOIN auth.users u ON u.id = c.id
  WHERE t.id='d0000000-0000-0000-0000-00000000dddd'
    AND t.enabled_modules <> '{}'::jsonb
    AND u.email NOT LIKE '%@evatest.cl';
  IF v_real_team <> 0 THEN RAISE EXCEPTION 'CASO12 FAIL: % teams reales con modulos tras el clawback', v_real_team; END IF;
END $$;

RESET ROLE;
SELECT 'ALL MODULE-GRANTS TESTS PASSED' AS result;
ROLLBACK;
