-- BODY COMPOSITION MEASUREMENTS — RLS isolation tests (seed + tests en UNA transaccion, ROLLBACK al final).
-- NO persiste datos (apto para branch efimero o prod). Resultado esperado: una fila 'ALL 15 TESTS PASSED'.
-- Un FAIL hace RAISE EXCEPTION (aborta). Ejecutar via MCP execute_sql o psql — SOLO en el gate autorizado.
-- Requiere la migracion 20260611092001_body_composition_measurements.sql aplicada.
-- Spec: specs/movida-bodycomp/SPEC.md (AC8) · TASKS T2.3.
-- T-cases: team A != team B · standalone propio · no-miembro sin acceso · soft-delete (aislamiento persiste) ·
--          WITH CHECK: client_id ajeno BLOQUEADO (standalone) y team_id falseado BLOQUEADO (pool) ·
--          authenticated NO puede DELETE (hard-delete solo service_role) ·
--          invariante org_id IS NULL: INSERT/UPDATE pool con org_id estampado BLOQUEADOS (T13/T15) ·
--          self-atribucion en INSERT pool: coach_id de otro coach BLOQUEADO (T14).
-- NOTA soft-delete: por diseno del PLAN, la fila soft-deleted SIGUE visible para su scope via RLS (permite
-- restore/auditoria); la exclusion de lecturas de negocio es capa app (repository filtra deleted_at IS NULL).
-- Lo que se asserta aqui es que el AISLAMIENTO se mantiene tras el soft-delete (otros teams siguen sin verla).

BEGIN;

-- ===== SEED (efimero, UUIDs prefijo b0dc para no chocar con otras suites) =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('b0dc0000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA1+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc0000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA2+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc0000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachB1+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc0000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachS1+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc0000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachS2+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc1000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoAalpha+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc1000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoBgamma+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc1000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoSsolo+bodycomp@example.test','x',now(),now(),now(),'{}','{}'),
  ('b0dc1000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alumnoS2solo+bodycomp@example.test','x',now(),now(),now(),'{}','{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coaches (id, slug, full_name, brand_name, invite_code)
VALUES
  ('b0dc0000-0000-0000-0000-0000000000a1','bodycomp-coach-a1','Coach A1 (owner A)','Brand A1','BODYCOMP-A1'),
  ('b0dc0000-0000-0000-0000-0000000000a2','bodycomp-coach-a2','Coach A2 (member A)','Brand A2','BODYCOMP-A2'),
  ('b0dc0000-0000-0000-0000-0000000000b1','bodycomp-coach-b1','Coach B1 (owner B)','Brand B1','BODYCOMP-B1'),
  ('b0dc0000-0000-0000-0000-0000000000c1','bodycomp-coach-s1','Coach S1 (standalone)','Brand S1','BODYCOMP-S1'),
  ('b0dc0000-0000-0000-0000-0000000000c2','bodycomp-coach-s2','Coach S2 (standalone)','Brand S2','BODYCOMP-S2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_accounts (id) VALUES
  ('b0dc1000-0000-0000-0000-000000000001'),('b0dc1000-0000-0000-0000-000000000002'),
  ('b0dc1000-0000-0000-0000-000000000003'),('b0dc1000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.teams (id, name, slug, owner_coach_id, seat_limit, enabled_modules)
VALUES
  ('b0dc0000-0000-0000-0000-00000000aaaa','Team A (bodycomp)','bodycomp-a','b0dc0000-0000-0000-0000-0000000000a1',10,'{"body_composition":true}'::jsonb),
  ('b0dc0000-0000-0000-0000-00000000bbbb','Team B (bodycomp)','bodycomp-b','b0dc0000-0000-0000-0000-0000000000b1',10,'{"body_composition":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.team_members (team_id, coach_id, display_role, can_manage, status)
VALUES
  ('b0dc0000-0000-0000-0000-00000000aaaa','b0dc0000-0000-0000-0000-0000000000a1','Owner',true,'active'),
  ('b0dc0000-0000-0000-0000-00000000aaaa','b0dc0000-0000-0000-0000-0000000000a2','Coach',false,'active'),
  ('b0dc0000-0000-0000-0000-00000000bbbb','b0dc0000-0000-0000-0000-0000000000b1','Owner',true,'active')
ON CONFLICT (team_id, coach_id) DO NOTHING;

-- Org seed: SOLO para los casos negativos T13/T15 — la FK org_id valida contra CUALQUIER organizations.id
-- existente sin necesitar SELECT sobre organizations, que es exactamente el vector que se asserta bloqueado.
INSERT INTO public.organizations (id, slug, name, owner_user_id)
VALUES ('b0dc0000-0000-0000-0000-00000000ee01','bodycomp-org-x','Org X (bodycomp, ajena)','b0dc0000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, coach_id, org_id, team_id, full_name, email)
VALUES
  ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a1',NULL,'b0dc0000-0000-0000-0000-00000000aaaa','Alumno A-alpha','alumnoAalpha+bodycomp@example.test'),
  ('b0dc1000-0000-0000-0000-000000000002','b0dc0000-0000-0000-0000-0000000000b1',NULL,'b0dc0000-0000-0000-0000-00000000bbbb','Alumno B-gamma','alumnoBgamma+bodycomp@example.test'),
  ('b0dc1000-0000-0000-0000-000000000003','b0dc0000-0000-0000-0000-0000000000c1',NULL,NULL,'Alumno S-solo','alumnoSsolo+bodycomp@example.test'),
  ('b0dc1000-0000-0000-0000-000000000004','b0dc0000-0000-0000-0000-0000000000c2',NULL,NULL,'Alumno S2-solo','alumnoS2solo+bodycomp@example.test')
ON CONFLICT (id) DO NOTHING;

-- Mediciones seed (insertadas como superuser/service: bypass RLS, simulan data existente)
INSERT INTO public.body_composition_measurements (id, client_id, coach_id, team_id, method, weight_kg, metrics)
VALUES
  ('b0dc2000-0000-0000-0000-000000000001','b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a1','b0dc0000-0000-0000-0000-00000000aaaa','bia', 70.50,'{"body_fat_pct": 18.2}'::jsonb),
  ('b0dc2000-0000-0000-0000-000000000002','b0dc1000-0000-0000-0000-000000000002','b0dc0000-0000-0000-0000-0000000000b1','b0dc0000-0000-0000-0000-00000000bbbb','isak',62.10,'{"body_fat_pct": 21.4}'::jsonb),
  ('b0dc2000-0000-0000-0000-000000000003','b0dc1000-0000-0000-0000-000000000003','b0dc0000-0000-0000-0000-0000000000c1',NULL,'bia',80.00,'{"body_fat_pct": 25.0}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ===== TESTS =====

-- T1: miembro de team A (A2, no-manager) ve la medicion del pool A; NO ve team B ni standalone.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v_a bool; v_b bool; v_s bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000001') INTO v_a;
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000002') INTO v_b;
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000003') INTO v_s;
  IF NOT (v_a AND NOT v_b AND NOT v_s) THEN RAISE EXCEPTION 'T1 FAIL a=% b=% s=%',v_a,v_b,v_s; END IF;
END $$;

-- T2: owner de team B ve solo lo de B (team A invisible).
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v_a bool; v_b bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000001') INTO v_a;
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000002') INTO v_b;
  IF NOT (NOT v_a AND v_b) THEN RAISE EXCEPTION 'T2 FAIL a=% b=%',v_a,v_b; END IF;
END $$;

-- T3: standalone S1 ve SOLO su medicion (ni pool A, ni pool B).
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE v_n int; v_own bool; BEGIN
  SELECT count(*) INTO v_n FROM public.body_composition_measurements WHERE id IN
    ('b0dc2000-0000-0000-0000-000000000001','b0dc2000-0000-0000-0000-000000000002','b0dc2000-0000-0000-0000-000000000003');
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000003') INTO v_own;
  IF NOT (v_n=1 AND v_own) THEN RAISE EXCEPTION 'T3 FAIL visibles=% own=%',v_n,v_own; END IF;
END $$;

-- T4: no-miembro sin acceso — standalone S2 (sin team, sin mediciones propias) no ve NINGUNA fila seed.
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000c2","role":"authenticated"}';
DO $$ DECLARE v_n int; BEGIN
  SELECT count(*) INTO v_n FROM public.body_composition_measurements WHERE id IN
    ('b0dc2000-0000-0000-0000-000000000001','b0dc2000-0000-0000-0000-000000000002','b0dc2000-0000-0000-0000-000000000003');
  IF v_n<>0 THEN RAISE EXCEPTION 'T4 FAIL no-miembro ve % filas',v_n; END IF;
END $$;

-- T5: INSERT pool valido — A2 (miembro, no dueno del cliente) registra medicion del alumno del pool A.
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v_i int; BEGIN
  INSERT INTO public.body_composition_measurements (client_id, coach_id, team_id, method, weight_kg)
  VALUES ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a2','b0dc0000-0000-0000-0000-00000000aaaa','isak',70.10);
  GET DIAGNOSTICS v_i=ROW_COUNT;
  IF v_i<>1 THEN RAISE EXCEPTION 'T5 FAIL insert pool i=%',v_i; END IF;
END $$;

-- T6: WITH CHECK pool — team_id falseado (team B sobre cliente de team A) BLOQUEADO.
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, team_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a2','b0dc0000-0000-0000-0000-00000000bbbb','bia');
    RAISE EXCEPTION 'T6 FAIL insert con team_id falseado permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T6 FAIL'; END IF;
END $$;

-- T7: INSERT standalone valido — S1 registra medicion de su propio alumno (sin team/org, self-attribuido).
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000c1","role":"authenticated"}';
DO $$ DECLARE v_i int; BEGIN
  INSERT INTO public.body_composition_measurements (client_id, coach_id, method, weight_kg)
  VALUES ('b0dc1000-0000-0000-0000-000000000003','b0dc0000-0000-0000-0000-0000000000c1','bia',80.40);
  GET DIAGNOSTICS v_i=ROW_COUNT;
  IF v_i<>1 THEN RAISE EXCEPTION 'T7 FAIL insert standalone i=%',v_i; END IF;
END $$;

-- T8: WITH CHECK standalone — client_id AJENO (alumno de S2) BLOQUEADO para S1.
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000004','b0dc0000-0000-0000-0000-0000000000c1','bia');
    RAISE EXCEPTION 'T8 FAIL insert con client_id ajeno permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T8 FAIL'; END IF;
END $$;

-- T9: WITH CHECK standalone — coach_id spoofeado (S1 firma como S2) BLOQUEADO.
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000003','b0dc0000-0000-0000-0000-0000000000c2','bia');
    RAISE EXCEPTION 'T9 FAIL insert con coach_id spoofeado permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T9 FAIL'; END IF;
END $$;

-- T10: soft-delete via UPDATE (bcm_update) — miembro del pool marca deleted_at; el aislamiento PERSISTE
--      (team B sigue sin ver la fila soft-deleted; la exclusion de lecturas vivas es capa app/repository).
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v_u int; BEGIN
  UPDATE public.body_composition_measurements SET deleted_at=now() WHERE id='b0dc2000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_u=ROW_COUNT;
  IF v_u<>1 THEN RAISE EXCEPTION 'T10 FAIL soft-delete u=%',v_u; END IF;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v bool; BEGIN
  SELECT EXISTS(SELECT 1 FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000001') INTO v;
  IF v THEN RAISE EXCEPTION 'T10b FAIL team B ve fila soft-deleted de team A'; END IF;
END $$;

-- T11: authenticated NO puede hard-DELETE (sin grant ni policy DELETE; solo service_role).
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    DELETE FROM public.body_composition_measurements WHERE id='b0dc2000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'T11 FAIL authenticated pudo hacer DELETE';
  EXCEPTION WHEN insufficient_privilege THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T11 FAIL'; END IF;
END $$;

-- T12: UPDATE cross-team BLOQUEADO (B1 no alcanza filas de team A: 0 rows) + WITH CHECK de UPDATE:
--      mover una medicion propia a un client_id fuera del scope BLOQUEADO.
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
DO $$ DECLARE v_u int; v bool:=false; BEGIN
  UPDATE public.body_composition_measurements SET notes='hacked' WHERE id='b0dc2000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_u=ROW_COUNT;
  IF v_u<>0 THEN RAISE EXCEPTION 'T12 FAIL cross-team update rows=%',v_u; END IF;
  BEGIN
    UPDATE public.body_composition_measurements
       SET client_id='b0dc1000-0000-0000-0000-000000000001'  -- cliente de team A: fuera del scope de B1
     WHERE id='b0dc2000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'T12b FAIL update movio medicion a client ajeno';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR foreign_key_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T12b FAIL'; END IF;
END $$;

-- T13: WITH CHECK pool — INSERT con org_id estampado (org X valida por FK) BLOQUEADO aunque client/team/coach
--      sean validos. Sin el `org_id IS NULL` de la rama pool, esta fila de salud quedaria "perteneciendo" a una
--      org ajena y se expondria a esa org cuando exista la policy enterprise.
SET LOCAL request.jwt.claims = '{"sub":"b0dc0000-0000-0000-0000-0000000000a2","role":"authenticated"}';
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, team_id, org_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a2','b0dc0000-0000-0000-0000-00000000aaaa','b0dc0000-0000-0000-0000-00000000ee01','bia');
    RAISE EXCEPTION 'T13 FAIL insert pool con org_id estampado permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T13 FAIL'; END IF;
END $$;

-- T14: WITH CHECK pool — coach_id de OTRO coach BLOQUEADO (self-atribucion estricta en INSERT):
--      (a) B1, coach de otro team; (b) A1, peer del MISMO team (caso mas estricto: ni dentro del pool se
--      puede firmar como otro). El pool full-access aplica a leer/editar, NO a falsear la autoria del registro.
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, team_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000b1','b0dc0000-0000-0000-0000-00000000aaaa','bia');
    RAISE EXCEPTION 'T14 FAIL insert pool firmado como coach de otro team permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T14 FAIL (cross-team)'; END IF;
  v:=false;
  BEGIN
    INSERT INTO public.body_composition_measurements (client_id, coach_id, team_id, method)
    VALUES ('b0dc1000-0000-0000-0000-000000000001','b0dc0000-0000-0000-0000-0000000000a1','b0dc0000-0000-0000-0000-00000000aaaa','bia');
    RAISE EXCEPTION 'T14b FAIL insert pool firmado como peer del mismo team permitido';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T14b FAIL (same-team peer)'; END IF;
END $$;

-- T15: WITH CHECK de UPDATE pool — estampar org_id sobre una fila existente del pool BLOQUEADO
--      (USING pasa: la fila es alcanzable por A2; el WITH CHECK exige org_id IS NULL — nadie "migra"
--      mediciones de salud existentes a una org via update).
DO $$ DECLARE v bool:=false; BEGIN
  BEGIN
    UPDATE public.body_composition_measurements
       SET org_id='b0dc0000-0000-0000-0000-00000000ee01'
     WHERE id='b0dc2000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'T15 FAIL update pool estampo org_id sobre fila existente';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN v:=true; END;
  IF NOT v THEN RAISE EXCEPTION 'T15 FAIL'; END IF;
END $$;

RESET ROLE;
SELECT 'ALL 15 TESTS PASSED' AS result;
ROLLBACK;
