-- Hardening A.bis3 (post review adversarial). Valida migracion 20260609220000.
-- (a) seat_guard ahora dispara en reactivacion (UPDATE revoked->active), no solo INSERT.
-- (b) active->active (editar) NO ocupa cupo nuevo. (c) transfer_team_ownership RPC atomico owner-only.
-- (d) get_coach_id_by_email case/trim-insensitive. tx + ROLLBACK. Esperado: 'TEAM GOVERNANCE HARDENING VALIDATED'.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
 ('a0000000-0000-0000-0000-0000000000a1','tm-a1@test.local'),
 ('a0000000-0000-0000-0000-0000000000a2','tm-a2@test.local'),
 ('a0000000-0000-0000-0000-0000000000a3','tm-a3@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('a0000000-0000-0000-0000-0000000000a1','tmh-a1','A1','A1','TMHA1'),
 ('a0000000-0000-0000-0000-0000000000a2','tmh-a2','A2','A2','TMHA2'),
 ('a0000000-0000-0000-0000-0000000000a3','tmh-a3','A3','A3','TMHA3')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','TMH Team','tmh-team','a0000000-0000-0000-0000-0000000000a1',2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, can_manage, status, deleted_at) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3',false,'revoked',now())
ON CONFLICT (team_id, coach_id) DO NOTHING;

DO $$ DECLARE v uuid; BEGIN
  v := public.get_coach_id_by_email('TM-A1@test.local');
  IF v <> 'a0000000-0000-0000-0000-0000000000a1' THEN RAISE EXCEPTION 'EMAIL LOOKUP FAIL v=%',v; END IF;
  v := public.get_coach_id_by_email('nadie@test.local');
  IF v IS NOT NULL THEN RAISE EXCEPTION 'EMAIL LOOKUP FAIL nonexistent=%',v; END IF;
END $$;

SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE blocked bool:=false; upd int; BEGIN
  BEGIN
    UPDATE public.team_members SET status='active', deleted_at=NULL
      WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a3';
  EXCEPTION WHEN others THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'SEAT-UPDATE FAIL: reactivacion con cupos llenos NO bloqueada'; END IF;
  UPDATE public.team_members SET display_role='X' WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a2';
  GET DIAGNOSTICS upd=ROW_COUNT; IF upd<>1 THEN RAISE EXCEPTION 'SEAT-NOOP FAIL upd=%',upd; END IF;
  UPDATE public.teams SET seat_limit=3 WHERE id='a0000000-0000-0000-0000-00000000aaaa';
  UPDATE public.team_members SET status='active', deleted_at=NULL
    WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a3';
  GET DIAGNOSTICS upd=ROW_COUNT; IF upd<>1 THEN RAISE EXCEPTION 'SEAT-REACT FAIL upd=%',upd; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE v_owner uuid; v_a1 bool; v_a2 bool; BEGIN
  PERFORM public.transfer_team_ownership('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2');
  SELECT owner_coach_id INTO v_owner FROM public.teams WHERE id='a0000000-0000-0000-0000-00000000aaaa';
  SELECT can_manage INTO v_a1 FROM public.team_members WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a1';
  SELECT can_manage INTO v_a2 FROM public.team_members WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a2';
  IF NOT (v_owner='a0000000-0000-0000-0000-0000000000a2' AND v_a1 AND v_a2) THEN RAISE EXCEPTION 'TRANSFER FAIL owner=% a1mgr=% a2mgr=%',v_owner,v_a1,v_a2; END IF;
END $$;

SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE blocked bool:=false; BEGIN
  BEGIN PERFORM public.transfer_team_ownership('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1'); EXCEPTION WHEN others THEN blocked:=true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'TRANSFER-NONOWNER FAIL: no-owner transfirio'; END IF;
END $$;

RESET ROLE;
SELECT 'TEAM GOVERNANCE HARDENING VALIDATED' AS result;
ROLLBACK;
