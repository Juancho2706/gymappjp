-- A.bis3 — rutas RLS/trigger que pegan las server actions de gestion de miembros (/coach/team).
-- Manager (co-gestor) puede agregar/editar/revocar miembros; NO puede escalar can_manage ni transferir owner.
-- No-manager no puede agregar. Owner si puede transferir. tx + ROLLBACK (no persiste; apto prod).
-- Esperado: 'TEAM ACTIONS RLS PATHS VALIDATED'. Validado prod 2026-06-09.
BEGIN;
INSERT INTO auth.users (id) VALUES
 ('a0000000-0000-0000-0000-0000000000a1'),('a0000000-0000-0000-0000-0000000000a2'),
 ('a0000000-0000-0000-0000-0000000000a3'),('a0000000-0000-0000-0000-0000000000a9')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code) VALUES
 ('a0000000-0000-0000-0000-0000000000a1','tm-a1','A1 owner','A1','TMA1'),
 ('a0000000-0000-0000-0000-0000000000a2','tm-a2','A2 mgr','A2','TMA2'),
 ('a0000000-0000-0000-0000-0000000000a3','tm-a3','A3 member','A3','TMA3'),
 ('a0000000-0000-0000-0000-0000000000a9','tm-a9','A9 spare','A9','TMA9')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','TM Team A','tm-team-a','a0000000-0000-0000-0000-0000000000a1',10)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status) VALUES
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a1','Owner',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a2','Mgr',true,'active'),
 ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a3','Coach',false,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

SET LOCAL ROLE authenticated;

-- (1-5) Manager A2: add OK, escalacion can_manage bloqueada, edit OK, revoke OK, transfer owner bloqueado
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE i int; esc bool:=false; upd int; del int; tr bool:=false; BEGIN
  INSERT INTO public.team_members (team_id,coach_id,display_role,can_manage,status)
    VALUES ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a9','Nutri',false,'active');
  GET DIAGNOSTICS i=ROW_COUNT; IF i<>1 THEN RAISE EXCEPTION 'M1 FAIL mgr add=%',i; END IF;
  BEGIN UPDATE public.team_members SET can_manage=true WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a9'; EXCEPTION WHEN others THEN esc:=true; END;
  IF NOT esc THEN RAISE EXCEPTION 'M2 FAIL mgr escalo can_manage'; END IF;
  UPDATE public.team_members SET display_role='Kine' WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a9';
  GET DIAGNOSTICS upd=ROW_COUNT; IF upd<>1 THEN RAISE EXCEPTION 'M3 FAIL edit role=%',upd; END IF;
  UPDATE public.team_members SET status='revoked', deleted_at=now() WHERE team_id='a0000000-0000-0000-0000-00000000aaaa' AND coach_id='a0000000-0000-0000-0000-0000000000a9';
  GET DIAGNOSTICS del=ROW_COUNT; IF del<>1 THEN RAISE EXCEPTION 'M4 FAIL revoke=%',del; END IF;
  BEGIN UPDATE public.teams SET owner_coach_id='a0000000-0000-0000-0000-0000000000a2' WHERE id='a0000000-0000-0000-0000-00000000aaaa'; EXCEPTION WHEN others THEN tr:=true; END;
  IF NOT tr THEN RAISE EXCEPTION 'M5 FAIL mgr transfirio owner'; END IF;
END $$;

-- (6) NO-manager A3 no puede agregar
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
DO $$ DECLARE blocked bool:=false; n int; BEGIN
  BEGIN
    INSERT INTO public.team_members (team_id,coach_id,can_manage,status)
      VALUES ('a0000000-0000-0000-0000-00000000aaaa','a0000000-0000-0000-0000-0000000000a9',false,'active');
    GET DIAGNOSTICS n=ROW_COUNT;
    IF n>0 THEN RAISE EXCEPTION 'M6 FAIL no-manager inserto'; END IF;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN blocked:=true; END;
END $$;

-- (7) Owner A1 transfiere a A2 -> OK
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DO $$ DECLARE u int; BEGIN
  UPDATE public.teams SET owner_coach_id='a0000000-0000-0000-0000-0000000000a2' WHERE id='a0000000-0000-0000-0000-00000000aaaa';
  GET DIAGNOSTICS u=ROW_COUNT; IF u<>1 THEN RAISE EXCEPTION 'M7 FAIL owner transfer=%',u; END IF;
END $$;

RESET ROLE;
SELECT 'TEAM ACTIONS RLS PATHS VALIDATED' AS result;
ROLLBACK;
