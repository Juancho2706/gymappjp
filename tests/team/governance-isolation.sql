-- MIGRATION 2 (governance) — RLS + inmutabilidad consents + append-only logs.
-- Requiere migraciones governance_entitlements_consent_access_logs + team_tables_harden_grants aplicadas.
-- Corre seed + T1-T20 en UNA transaccion con ROLLBACK (no persiste; apto prod o branch).
-- Esperado: fila 'ALL PASSED'. Un FAIL hace RAISE EXCEPTION. Validado en prod 2026-06-09.
BEGIN;

INSERT INTO auth.users (id) VALUES
 ('aaaa0000-0000-0000-0000-000000000001'),('aaaa0000-0000-0000-0000-000000000002'),('aaaa0000-0000-0000-0000-000000000003'),
 ('cccc0000-0000-0000-0000-000000000001'),('dddd0000-0000-0000-0000-000000000001'),('dddd0000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('aaaa0000-0000-0000-0000-000000000001','m2-test-owner-coach','M2 Owner Coach','OwnerBrand','M2TESTOWN1'),
 ('aaaa0000-0000-0000-0000-000000000002','m2-test-member-coach','M2 Member Coach','MemberBrand','M2TESTMEM2'),
 ('aaaa0000-0000-0000-0000-000000000003','m2-test-outsider-coach','M2 Outsider Coach','OutBrand','M2TESTOUT3')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id) VALUES
 ('bbbb0000-0000-0000-0000-000000000001','M2 Test Team','m2-test-team','aaaa0000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
 ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001', true,  'active'),
 ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000002', false, 'active') ON CONFLICT DO NOTHING;
INSERT INTO public.client_accounts (id) VALUES ('cccc0000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.clients (id, coach_id, team_id, full_name, email) VALUES
 ('dddd0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001', NULL, 'M2 Standalone Client','m2-sa@test.local'),
 ('dddd0000-0000-0000-0000-000000000002', NULL, 'bbbb0000-0000-0000-0000-000000000001', 'M2 Team Client','m2-tc@test.local'),
 ('cccc0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001', NULL, 'M2 Self Client','m2-self@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.client_consents (id, client_id, account_id, team_id, purpose, granted_at, consent_text_version, granted_via) VALUES
 ('eeee0000-0000-0000-0000-000000000001','dddd0000-0000-0000-0000-000000000001', NULL, NULL, 'health_data_processing', now(), 'v1','seed'),
 ('eeee0000-0000-0000-0000-000000000002','dddd0000-0000-0000-0000-000000000002', NULL, 'bbbb0000-0000-0000-0000-000000000001', 'pool_multidisciplinary_access', now(), 'v1','seed'),
 ('eeee0000-0000-0000-0000-000000000003','dddd0000-0000-0000-0000-000000000002', 'cccc0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000001', 'marketing', now(), 'v1','seed'),
 ('eeee0000-0000-0000-0000-000000000004','cccc0000-0000-0000-0000-000000000001', NULL, NULL, 'photo_storage', now(), 'v1','seed')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_cnt int; v_ok boolean; v_purpose text; v_rev timestamptz; v_blocked boolean; BEGIN
  SELECT enabled_modules = '{}'::jsonb INTO v_ok FROM public.coaches WHERE id='aaaa0000-0000-0000-0000-000000000001';
  IF NOT v_ok THEN RAISE EXCEPTION 'T1 FAIL: coaches.enabled_modules default'; END IF;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000001","role":"authenticated"}';
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id='eeee0000-0000-0000-0000-000000000001'; IF v_cnt<>1 THEN RAISE EXCEPTION 'T2 FAIL %',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id IN ('eeee0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000003'); IF v_cnt<>2 THEN RAISE EXCEPTION 'T3 FAIL %',v_cnt; END IF;
  INSERT INTO public.client_consents (client_id, purpose, granted_at) VALUES ('dddd0000-0000-0000-0000-000000000001','marketing', now());
  RESET role;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000002","role":"authenticated"}';
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id IN ('eeee0000-0000-0000-0000-000000000002','eeee0000-0000-0000-0000-000000000003'); IF v_cnt<>2 THEN RAISE EXCEPTION 'T6 FAIL %',v_cnt; END IF;
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id='eeee0000-0000-0000-0000-000000000001'; IF v_cnt<>0 THEN RAISE EXCEPTION 'T7 FAIL %',v_cnt; END IF;
  UPDATE public.client_consents SET revoked_at=now() WHERE id='eeee0000-0000-0000-0000-000000000002'; GET DIAGNOSTICS v_cnt=ROW_COUNT; IF v_cnt<>1 THEN RAISE EXCEPTION 'T8 FAIL %',v_cnt; END IF;
  v_blocked:=false; BEGIN UPDATE public.client_consents SET purpose='health_data_processing' WHERE id='eeee0000-0000-0000-0000-000000000003'; EXCEPTION WHEN check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T8b FAIL inmutabilidad'; END IF;
  RESET role;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000003","role":"authenticated"}';
  SELECT count(*) INTO v_cnt FROM public.client_consents; IF v_cnt<>0 THEN RAISE EXCEPTION 'T9 FAIL ajeno ve %',v_cnt; END IF;
  RESET role;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"cccc0000-0000-0000-0000-000000000001","role":"authenticated"}';
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id IN ('eeee0000-0000-0000-0000-000000000003','eeee0000-0000-0000-0000-000000000004'); IF v_cnt<>2 THEN RAISE EXCEPTION 'T10 FAIL %',v_cnt; END IF;
  UPDATE public.client_consents SET revoked_at=now() WHERE id='eeee0000-0000-0000-0000-000000000003'; GET DIAGNOSTICS v_cnt=ROW_COUNT; IF v_cnt<>1 THEN RAISE EXCEPTION 'T11 FAIL %',v_cnt; END IF;
  v_blocked:=false; BEGIN UPDATE public.client_consents SET purpose='pool_multidisciplinary_access' WHERE id='eeee0000-0000-0000-0000-000000000004'; EXCEPTION WHEN check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T11b FAIL escalar purpose'; END IF;
  v_blocked:=false; BEGIN UPDATE public.client_consents SET consent_text_version='HACKED', granted_at='2000-01-01' WHERE id='eeee0000-0000-0000-0000-000000000004'; EXCEPTION WHEN check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T11c FAIL forjar'; END IF;
  v_blocked:=false; BEGIN UPDATE public.client_consents SET revoked_at=NULL WHERE id='eeee0000-0000-0000-0000-000000000003'; EXCEPTION WHEN check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T11d FAIL re-activar'; END IF;
  SELECT purpose, revoked_at INTO v_purpose, v_rev FROM public.client_consents WHERE id='eeee0000-0000-0000-0000-000000000004'; IF v_purpose<>'photo_storage' OR v_rev IS NOT NULL THEN RAISE EXCEPTION 'T11e FAIL fila mutada'; END IF;
  SELECT count(*) INTO v_cnt FROM public.client_consents WHERE id IN ('eeee0000-0000-0000-0000-000000000001','eeee0000-0000-0000-0000-000000000002'); IF v_cnt<>0 THEN RAISE EXCEPTION 'T12 FAIL %',v_cnt; END IF;
  IF has_table_privilege('authenticated','public.client_consents','TRUNCATE') THEN RAISE EXCEPTION 'T12b FAIL TRUNCATE'; END IF;
  RESET role;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000002","role":"authenticated"}';
  INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action) VALUES ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000002','dddd0000-0000-0000-0000-000000000002','client_health','view');
  v_blocked:=false; BEGIN INSERT INTO public.team_access_logs (team_id, actor_coach_id, resource, action) VALUES ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000001','x','view'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T14 FAIL self-attr'; END IF;
  v_blocked:=false; BEGIN INSERT INTO public.team_access_logs (team_id, actor_coach_id, client_id, resource, action) VALUES ('bbbb0000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000002','dddd0000-0000-0000-0000-000000000001','x','view'); EXCEPTION WHEN insufficient_privilege OR check_violation THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T14b FAIL client scope'; END IF;
  SELECT count(*) INTO v_cnt FROM public.team_access_logs WHERE team_id='bbbb0000-0000-0000-0000-000000000001'; IF v_cnt<1 THEN RAISE EXCEPTION 'T15 FAIL %',v_cnt; END IF;
  v_blocked:=false; BEGIN UPDATE public.team_access_logs SET resource='tampered' WHERE team_id='bbbb0000-0000-0000-0000-000000000001'; EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T16 FAIL UPDATE'; END IF;
  v_blocked:=false; BEGIN DELETE FROM public.team_access_logs WHERE team_id='bbbb0000-0000-0000-0000-000000000001'; EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T17 FAIL DELETE'; END IF;
  v_blocked:=false; BEGIN EXECUTE 'TRUNCATE public.team_access_logs'; EXCEPTION WHEN insufficient_privilege THEN v_blocked:=true; END; IF NOT v_blocked THEN RAISE EXCEPTION 'T17b FAIL TRUNCATE'; END IF;
  RESET role;
  SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-000000000003","role":"authenticated"}';
  SELECT count(*) INTO v_cnt FROM public.team_access_logs; IF v_cnt<>0 THEN RAISE EXCEPTION 'T18 FAIL ajeno %',v_cnt; END IF;
  RESET role;
  IF has_table_privilege('authenticated','public.team_access_logs','UPDATE') THEN RAISE EXCEPTION 'T19 FAIL UPDATE'; END IF;
  IF has_table_privilege('authenticated','public.team_access_logs','DELETE') THEN RAISE EXCEPTION 'T19 FAIL DELETE'; END IF;
  IF has_table_privilege('authenticated','public.team_access_logs','TRUNCATE') THEN RAISE EXCEPTION 'T19 FAIL TRUNCATE'; END IF;
  IF has_table_privilege('anon','public.team_access_logs','SELECT') THEN RAISE EXCEPTION 'T19c FAIL anon logs'; END IF;
  IF has_table_privilege('anon','public.client_consents','SELECT') THEN RAISE EXCEPTION 'T19c FAIL anon consents'; END IF;
  SET LOCAL role service_role; SET LOCAL request.jwt.claims = '{"role":"service_role"}';
  UPDATE public.client_consents SET purpose='health_data_processing' WHERE id='eeee0000-0000-0000-0000-000000000004'; GET DIAGNOSTICS v_cnt=ROW_COUNT; IF v_cnt<>1 THEN RAISE EXCEPTION 'T20 FAIL service_role %',v_cnt; END IF;
  RESET role;
END $$;

SELECT 'ALL PASSED' AS status;
ROLLBACK;
