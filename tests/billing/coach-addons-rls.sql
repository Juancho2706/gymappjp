-- Suite RLS + trigger — coach_addons + billing_snapshots (plan 05 §F1, motor de add-ons self-service).
-- tx + ROLLBACK (no persiste). Datos sinteticos prefijo ad000000.
-- Spec: docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md §F1 · Patron: tests/team/exchanges-isolation.sql.
-- Requiere 20260612150000_coach_addons_selfservice_billing.sql aplicada. Esperado: 'ALL PASSED'.
-- CORRE SOLO EN EL GATE AUTORIZADO (regla 2026-06-10) — jamas como service_role para los negativos:
-- los asserts de RLS impersonan `authenticated` + claims (Director Movida §3).
--
-- Contrato cubierto:
--   SELECT propio OK / ajeno invisible (coach_addons y billing_snapshots).
--   authenticated INSERT/UPDATE/DELETE denegado x3 (escritura solo service-role).
--   service-role full.
--   trigger sync_coach_enabled_modules: INSERT active prende key; UPDATE→cancelled apaga;
--     cancelar la ULTIMA viva deja enabled_modules='{}' (no NULL — pin del coalesce);
--     DELETE de viva apaga (reversion D5).
--   admin_grant price 0 prende y COEXISTE con la paga del mismo modulo (cancelar la paga
--     deja el modulo ON por el grant).
--   indice unico parcial rechaza 2da fila viva del MISMO modulo y MISMO source.
--   billing_snapshots: unique provider_payment_id rechaza duplicado.
BEGIN;

-- ============ Seed sintetico (como postgres, bypass RLS) ============
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('ad000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','addon_a@e.test','x',now(),now(),now(),'{}','{}'),
  ('ad000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','addon_b@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('ad000000-0000-0000-0000-0000000000a1','addon-a','Coach A addon','ADDA','ADD-A'),
  ('ad000000-0000-0000-0000-0000000000b1','addon-b','Coach B addon','ADDB','ADD-B')
ON CONFLICT (id) DO NOTHING;

-- ============ T1 — service-role: full write + el trigger prende enabled_modules ============
-- (seed corre como postgres = bypass RLS; aca se valida el efecto del trigger AFTER INSERT)
DO $t1$ DECLARE v_mods jsonb; BEGIN
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version)
    VALUES ('ad000000-0000-0000-0000-00000000a101','ad000000-0000-0000-0000-0000000000a1','cardio','active','self_service',9990,'v1-2026-06');
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF NOT (v_mods ? 'cardio') THEN RAISE EXCEPTION 'T1 FAIL INSERT active no prendio cardio mods=%',v_mods; END IF;
  IF (v_mods ? 'body_composition') THEN RAISE EXCEPTION 'T1 FAIL prendio una key no contratada mods=%',v_mods; END IF;
END $t1$;

-- ============ T2 — trigger: UPDATE active→cancelled APAGA la key ============
DO $t2$ DECLARE v_mods jsonb; BEGIN
  -- agregar una 2da key para que al cancelar cardio el jsonb NO quede vacio todavia
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version)
    VALUES ('ad000000-0000-0000-0000-00000000a102','ad000000-0000-0000-0000-0000000000a1','body_composition','active','self_service',9990,'v1-2026-06');
  UPDATE public.coach_addons SET status='cancelled', cancelled_at=now()
    WHERE id='ad000000-0000-0000-0000-00000000a101';
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF (v_mods ? 'cardio') THEN RAISE EXCEPTION 'T2 FAIL cancelled no apago cardio mods=%',v_mods; END IF;
  IF NOT (v_mods ? 'body_composition') THEN RAISE EXCEPTION 'T2 FAIL apago de mas mods=%',v_mods; END IF;
  -- cancel_pending sigue contando como viva (facturable hasta el corte)
  UPDATE public.coach_addons SET status='cancel_pending', cancel_requested_at=now()
    WHERE id='ad000000-0000-0000-0000-00000000a102';
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF NOT (v_mods ? 'body_composition') THEN RAISE EXCEPTION 'T2 FAIL cancel_pending apago body_composition mods=%',v_mods; END IF;
END $t2$;

-- ============ T3 — trigger: cancelar la ULTIMA viva deja '{}' (NO NULL — pin del coalesce) ============
DO $t3$ DECLARE v_mods jsonb; BEGIN
  UPDATE public.coach_addons SET status='cancelled', cancelled_at=now()
    WHERE id='ad000000-0000-0000-0000-00000000a102';
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF v_mods IS NULL THEN RAISE EXCEPTION 'T3 FAIL enabled_modules quedo NULL (coalesce roto)'; END IF;
  IF v_mods <> '{}'::jsonb THEN RAISE EXCEPTION 'T3 FAIL ultima viva cancelada no dejo {} mods=%',v_mods; END IF;
END $t3$;

-- ============ T4 — trigger: DELETE de una fila viva APAGA (reversion D5) ============
DO $t4$ DECLARE v_mods jsonb; BEGIN
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version)
    VALUES ('ad000000-0000-0000-0000-00000000a103','ad000000-0000-0000-0000-0000000000a1','movement_assessment','active','self_service',9990,'v1-2026-06');
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF NOT (v_mods ? 'movement_assessment') THEN RAISE EXCEPTION 'T4 FAIL INSERT no prendio movement mods=%',v_mods; END IF;
  DELETE FROM public.coach_addons WHERE id='ad000000-0000-0000-0000-00000000a103';
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF (v_mods ? 'movement_assessment') THEN RAISE EXCEPTION 'T4 FAIL DELETE no apago movement (reversion D5) mods=%',v_mods; END IF;
  IF v_mods <> '{}'::jsonb THEN RAISE EXCEPTION 'T4 FAIL DELETE de la ultima viva no dejo {} mods=%',v_mods; END IF;
END $t4$;

-- ============ T5 — admin_grant price 0 prende y COEXISTE con la paga del mismo modulo (D2) ============
DO $t5$ DECLARE v_mods jsonb; v_n int; BEGIN
  -- fila PAGA de cardio
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version, first_charged_at)
    VALUES ('ad000000-0000-0000-0000-00000000a201','ad000000-0000-0000-0000-0000000000a1','cardio','active','self_service',9990,'v1-2026-06',now());
  -- grant CEO del MISMO modulo: distinto source → coexiste (indice incluye source)
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version)
    VALUES ('ad000000-0000-0000-0000-00000000a202','ad000000-0000-0000-0000-0000000000a1','cardio','active','admin_grant',0,'v1-2026-06');
  SELECT count(*) INTO v_n FROM public.coach_addons
    WHERE coach_id='ad000000-0000-0000-0000-0000000000a1' AND module_key='cardio' AND status='active';
  IF v_n<>2 THEN RAISE EXCEPTION 'T5 FAIL grant + paga no coexisten n=%',v_n; END IF;
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF NOT (v_mods ? 'cardio') THEN RAISE EXCEPTION 'T5 FAIL cardio no esta ON con grant+paga mods=%',v_mods; END IF;
  -- cancelar la PAGA: el grant mantiene cardio ON
  UPDATE public.coach_addons SET status='cancelled', cancelled_at=now()
    WHERE id='ad000000-0000-0000-0000-00000000a201';
  SELECT enabled_modules INTO v_mods FROM public.coaches WHERE id='ad000000-0000-0000-0000-0000000000a1';
  IF NOT (v_mods ? 'cardio') THEN RAISE EXCEPTION 'T5 FAIL al cancelar la paga el grant no mantuvo cardio ON mods=%',v_mods; END IF;
END $t5$;

-- ============ T6 — indice unico parcial: 2da fila viva del MISMO modulo + MISMO source rechazada ============
DO $t6$ DECLARE v_dup bool:=false; BEGIN
  -- ya hay grant cardio (a202) vivo. Otro grant cardio vivo del mismo coach debe chocar.
  BEGIN
    INSERT INTO public.coach_addons (coach_id, module_key, status, source, price_clp, terms_version)
      VALUES ('ad000000-0000-0000-0000-0000000000a1','cardio','active','admin_grant',0,'v1-2026-06');
  EXCEPTION WHEN unique_violation THEN v_dup:=true; END;
  IF NOT v_dup THEN RAISE EXCEPTION 'T6 FAIL indice unico no rechazo 2da fila viva (cardio/admin_grant)'; END IF;
  -- control positivo: una fila CANCELLED del mismo modulo+source NO ocupa el indice parcial
  -- (solo cuenta status IN active|cancel_pending) → debe insertarse sin chocar.
  INSERT INTO public.coach_addons (id, coach_id, module_key, status, source, price_clp, terms_version)
    VALUES ('ad000000-0000-0000-0000-00000000a203','ad000000-0000-0000-0000-0000000000a1','cardio','cancelled','admin_grant',0,'v1-2026-06');
END $t6$;

-- ============ T7 — billing_snapshots: service-role escribe; unique provider_payment_id rechaza duplicado ============
DO $t7$ DECLARE v_dup bool:=false; BEGIN
  INSERT INTO public.billing_snapshots (coach_id, provider_payment_id, charged_at, tier, billing_cycle, kind, base_clp, addons, total_clp)
    VALUES ('ad000000-0000-0000-0000-0000000000a1','mp-pay-0001',now(),'pro','monthly','recurring',29990,
            '[{"module_key":"cardio","price_clp":9990,"cycle_amount_clp":9990}]'::jsonb,39980);
  BEGIN
    INSERT INTO public.billing_snapshots (coach_id, provider_payment_id, charged_at, kind, base_clp, total_clp)
      VALUES ('ad000000-0000-0000-0000-0000000000a1','mp-pay-0001',now(),'recurring',29990,29990);
    RAISE EXCEPTION 'T7 FAIL provider_payment_id duplicado no fue rechazado';
  EXCEPTION WHEN unique_violation THEN v_dup:=true; END;
  IF NOT v_dup THEN RAISE EXCEPTION 'T7 FAIL unique provider_payment_id no aplico'; END IF;
END $t7$;

-- ============ T8 — RLS coach_addons: coach A ve lo suyo, NO lo de B; escritura denegada x3 ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ad000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
DO $t8$ DECLARE v_own int; v_ins int; v_upd int; v_del int; BEGIN
  -- SELECT propio: ve sus filas (vivas + historial cancelled)
  SELECT count(*) INTO v_own FROM public.coach_addons WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  IF v_own < 1 THEN RAISE EXCEPTION 'T8 FAIL coach A no ve sus add-ons own=%',v_own; END IF;
  -- INSERT denegado (cero policy de INSERT para authenticated)
  BEGIN
    INSERT INTO public.coach_addons (coach_id, module_key, price_clp, terms_version)
      VALUES ('ad000000-0000-0000-0000-0000000000a1','nutrition_exchanges',9990,'v1-2026-06');
    RAISE EXCEPTION 'T8 FAIL authenticated pudo INSERT en coach_addons';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- UPDATE denegado (0 filas afectadas: ninguna policy lo permite)
  UPDATE public.coach_addons SET price_clp=1 WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T8 FAIL authenticated UPDATE afecto filas rows=%',v_upd; END IF;
  -- DELETE denegado (0 filas)
  DELETE FROM public.coach_addons WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>0 THEN RAISE EXCEPTION 'T8 FAIL authenticated DELETE afecto filas rows=%',v_del; END IF;
END $t8$;
RESET role;

-- ============ T9 — RLS coach_addons: coach B NO ve filas de coach A ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ad000000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t9$ DECLARE v_ajeno int; BEGIN
  SELECT count(*) INTO v_ajeno FROM public.coach_addons WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  IF v_ajeno<>0 THEN RAISE EXCEPTION 'T9 FAIL coach B ve % filas de coach A',v_ajeno; END IF;
END $t9$;
RESET role;

-- ============ T10 — RLS billing_snapshots: SELECT propio OK / ajeno invisible / escritura denegada ============
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ad000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
DO $t10a$ DECLARE v_own int; v_upd int; v_del int; BEGIN
  SELECT count(*) INTO v_own FROM public.billing_snapshots WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  IF v_own < 1 THEN RAISE EXCEPTION 'T10 FAIL coach A no ve sus snapshots own=%',v_own; END IF;
  BEGIN
    INSERT INTO public.billing_snapshots (coach_id, provider_payment_id, charged_at, kind, base_clp, total_clp)
      VALUES ('ad000000-0000-0000-0000-0000000000a1','mp-pay-hack',now(),'recurring',1,1);
    RAISE EXCEPTION 'T10 FAIL authenticated pudo INSERT en billing_snapshots';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.billing_snapshots SET total_clp=0 WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T10 FAIL authenticated UPDATE afecto snapshots rows=%',v_upd; END IF;
  DELETE FROM public.billing_snapshots WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  GET DIAGNOSTICS v_del=ROW_COUNT;
  IF v_del<>0 THEN RAISE EXCEPTION 'T10 FAIL authenticated DELETE afecto snapshots rows=%',v_del; END IF;
END $t10a$;
RESET role;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"ad000000-0000-0000-0000-0000000000b1","role":"authenticated"}',true);
DO $t10b$ DECLARE v_ajeno int; BEGIN
  SELECT count(*) INTO v_ajeno FROM public.billing_snapshots WHERE coach_id='ad000000-0000-0000-0000-0000000000a1';
  IF v_ajeno<>0 THEN RAISE EXCEPTION 'T10 FAIL coach B ve % snapshots de coach A',v_ajeno; END IF;
END $t10b$;
RESET role;

-- ============ T11 — grants endurecidos (gotcha default-priv): anon 0; authenticated solo SELECT ============
DO $t11$ DECLARE v_anon int; v_extra int; BEGIN
  SELECT count(*) INTO v_anon FROM information_schema.role_table_grants
   WHERE grantee='anon' AND table_schema='public' AND table_name IN ('coach_addons','billing_snapshots');
  IF v_anon<>0 THEN RAISE EXCEPTION 'T11 FAIL anon tiene % privilegios en tablas nuevas',v_anon; END IF;
  SELECT count(*) INTO v_extra FROM information_schema.role_table_grants
   WHERE grantee='authenticated' AND table_schema='public'
     AND table_name IN ('coach_addons','billing_snapshots')
     AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  IF v_extra<>0 THEN RAISE EXCEPTION 'T11 FAIL authenticated tiene % privilegios de escritura (debe ser solo SELECT)',v_extra; END IF;
END $t11$;

SELECT 'ALL PASSED' AS status;
ROLLBACK;
