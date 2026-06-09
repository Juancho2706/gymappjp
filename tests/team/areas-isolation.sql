-- Migration 4 (workout_section_templates) — RLS + backfill test. tx + ROLLBACK (no persiste).
-- Requiere la migracion workout_section_templates aplicada. Esperado: 'ALL PASSED'. Validado prod 2026-06-09.
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) VALUES
  ('5ec70000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wst_c1@e.test','x',now(),now(),now(),'{}','{}'),
  ('5ec70000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wst_c2@e.test','x',now(),now(),now(),'{}','{}'),
  ('5ec70000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wst_c3@e.test','x',now(),now(),now(),'{}','{}'),
  ('5ec70000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','wst_c4@e.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
  ('5ec70000-0000-0000-0000-0000000000c1','wst-c1','C1 owner','B1','WST-C1'),
  ('5ec70000-0000-0000-0000-0000000000c2','wst-c2','C2 other','B2','WST-C2'),
  ('5ec70000-0000-0000-0000-0000000000c3','wst-c3','C3 member','B3','WST-C3'),
  ('5ec70000-0000-0000-0000-0000000000c4','wst-c4','C4 planowner','B4','WST-C4')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
  ('5ec70000-0000-0000-0000-00000000beef','WST Team','wst-team','5ec70000-0000-0000-0000-0000000000c1',10) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
  ('5ec70000-0000-0000-0000-00000000beef','5ec70000-0000-0000-0000-0000000000c1',true,'active'),
  ('5ec70000-0000-0000-0000-00000000beef','5ec70000-0000-0000-0000-0000000000c3',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
INSERT INTO public.workout_plans (id, coach_id, client_id, title) VALUES
  ('5ec70000-0000-0000-0000-00000000b1a4'::uuid, '5ec70000-0000-0000-0000-0000000000c4', NULL, 'WST seed plan') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workout_blocks (id, plan_id, exercise_id, order_index, section)
  SELECT '5ec70000-0000-0000-0000-00000b10c0a0'::uuid, '5ec70000-0000-0000-0000-00000000b1a4'::uuid, e.id, 0, 'warmup' FROM public.exercises e LIMIT 1 ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workout_blocks (id, plan_id, exercise_id, order_index, section)
  SELECT '5ec70000-0000-0000-0000-00000b10c0a1'::uuid, '5ec70000-0000-0000-0000-00000000b1a4'::uuid, e.id, 1, 'main' FROM public.exercises e LIMIT 1 ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workout_section_templates (id,name,slug,coach_id,is_system) VALUES
  ('5ec70000-0000-0000-0000-0000000000a1','C1 custom','c1custom','5ec70000-0000-0000-0000-0000000000c1',false) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.workout_section_templates (id,name,slug,team_id,is_system) VALUES
  ('5ec70000-0000-0000-0000-0000000000a2','Team custom','teamcustom','5ec70000-0000-0000-0000-00000000beef',false) ON CONFLICT (id) DO NOTHING;
UPDATE public.workout_blocks SET section_template_id = CASE section
  WHEN 'warmup' THEN '0000a5ec-0000-0000-0000-000000000001'::uuid
  WHEN 'main' THEN '0000a5ec-0000-0000-0000-000000000010'::uuid
  WHEN 'cooldown' THEN '0000a5ec-0000-0000-0000-000000000020'::uuid END
 WHERE id IN ('5ec70000-0000-0000-0000-00000b10c0a0','5ec70000-0000-0000-0000-00000b10c0a1') AND section_template_id IS NULL;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5ec70000-0000-0000-0000-0000000000c2","role":"authenticated"}',true);
DO $t1$ DECLARE v_sys bool; v_c1 bool; v_team bool; v_upd int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.workout_section_templates WHERE is_system AND slug='warmup') INTO v_sys;
  SELECT EXISTS(SELECT 1 FROM public.workout_section_templates WHERE id='5ec70000-0000-0000-0000-0000000000a1') INTO v_c1;
  SELECT EXISTS(SELECT 1 FROM public.workout_section_templates WHERE id='5ec70000-0000-0000-0000-0000000000a2') INTO v_team;
  IF NOT (v_sys AND NOT v_c1 AND NOT v_team) THEN RAISE EXCEPTION 'T1 FAIL sys=% c1=% team=%',v_sys,v_c1,v_team; END IF;
  UPDATE public.workout_section_templates SET name='hacked' WHERE is_system AND slug='warmup'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF v_upd<>0 THEN RAISE EXCEPTION 'T2 FAIL authenticated edito system rows=%',v_upd; END IF;
END $t1$;
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5ec70000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
DO $t3$ DECLARE v_ins int; v_upd int; BEGIN
  UPDATE public.workout_section_templates SET name='renamed' WHERE id='5ec70000-0000-0000-0000-0000000000a1'; GET DIAGNOSTICS v_upd=ROW_COUNT; IF v_upd<>1 THEN RAISE EXCEPTION 'T3 FAIL upd=%',v_upd; END IF;
  INSERT INTO public.workout_section_templates (name,slug,team_id,is_system) VALUES ('mgr','mgr','5ec70000-0000-0000-0000-00000000beef',false); GET DIAGNOSTICS v_ins=ROW_COUNT; IF v_ins<>1 THEN RAISE EXCEPTION 'T4 FAIL'; END IF;
END $t3$;
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5ec70000-0000-0000-0000-0000000000c3","role":"authenticated"}',true);
DO $t5$ DECLARE v_see bool; v_upd int; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.workout_section_templates WHERE id='5ec70000-0000-0000-0000-0000000000a2') INTO v_see;
  UPDATE public.workout_section_templates SET name='x' WHERE id='5ec70000-0000-0000-0000-0000000000a2'; GET DIAGNOSTICS v_upd=ROW_COUNT;
  IF NOT (v_see AND v_upd=0) THEN RAISE EXCEPTION 'T5 FAIL see=% upd=%',v_see,v_upd; END IF;
END $t5$;
RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"5ec70000-0000-0000-0000-0000000000c2","role":"authenticated"}',true);
DO $t6$ DECLARE v_upd int; BEGIN
  UPDATE public.workout_section_templates SET name='x' WHERE id='5ec70000-0000-0000-0000-0000000000a1'; GET DIAGNOSTICS v_upd=ROW_COUNT; IF v_upd<>0 THEN RAISE EXCEPTION 'T6 FAIL rows=%',v_upd; END IF;
  BEGIN
    INSERT INTO public.workout_section_templates (name,slug,team_id,is_system) VALUES ('ill','ill','5ec70000-0000-0000-0000-00000000beef',false);
    RAISE EXCEPTION 'T7 FAIL non-member team insert succeeded';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;
END $t6$;
RESET role;
DO $t8$ DECLARE v_orphan int; v_w uuid; v_m uuid; BEGIN
  SELECT count(*) INTO v_orphan FROM public.workout_blocks WHERE id IN ('5ec70000-0000-0000-0000-00000b10c0a0','5ec70000-0000-0000-0000-00000b10c0a1') AND section_template_id IS NULL;
  IF v_orphan<>0 THEN RAISE EXCEPTION 'T8 FAIL orphans=%',v_orphan; END IF;
  SELECT section_template_id INTO v_w FROM public.workout_blocks WHERE id='5ec70000-0000-0000-0000-00000b10c0a0';
  SELECT section_template_id INTO v_m FROM public.workout_blocks WHERE id='5ec70000-0000-0000-0000-00000b10c0a1';
  IF v_w<>'0000a5ec-0000-0000-0000-000000000001' OR v_m<>'0000a5ec-0000-0000-0000-000000000010' THEN RAISE EXCEPTION 'T9 FAIL w=% m=%',v_w,v_m; END IF;
END $t8$;
SELECT 'ALL PASSED' AS status;
ROLLBACK;
