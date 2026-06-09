-- INVARIANTES DE IDENTIDAD multi-contexto (regresión del smoke test 2026-06-09).
-- Detecta cruces de identidad ANTES de que lleguen al usuario. Solo SELECTs (read-only, apto prod).
-- Esperado: una fila 'IDENTITY INVARIANTS OK'. Cualquier violación hace RAISE EXCEPTION con detalle.
DO $$
DECLARE v_n int; v_detail text;
BEGIN
  -- INV1: ningún alumno de pool (clients.team_id set) puede tener su membresía activa en scope='standalone'
  -- (el cruce exacto del smoke: membership decía standalone, client estaba en el pool).
  SELECT count(*), string_agg(cm.account_id::text, ',') INTO v_n, v_detail
  FROM public.client_memberships cm
  JOIN public.clients cl ON cl.id = cm.client_id
  WHERE cl.team_id IS NOT NULL
    AND cm.scope = 'standalone'
    AND cm.status = 'active' AND cm.deleted_at IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV1 FAIL: % membresías standalone de alumnos de pool: %', v_n, v_detail; END IF;

  -- INV2: toda membresía scope='team' apunta a un team vivo y coincide con clients.team_id.
  SELECT count(*) INTO v_n
  FROM public.client_memberships cm
  LEFT JOIN public.clients cl ON cl.id = cm.client_id
  LEFT JOIN public.teams t ON t.id = cm.team_id AND t.deleted_at IS NULL
  WHERE cm.scope = 'team' AND cm.status = 'active' AND cm.deleted_at IS NULL
    AND (cm.team_id IS NULL OR t.id IS NULL OR cl.team_id IS DISTINCT FROM cm.team_id);
  IF v_n > 0 THEN RAISE EXCEPTION 'INV2 FAIL: % membresías team inconsistentes (team muerto o clients.team_id distinto)', v_n; END IF;

  -- INV3: todo coach team_managed tiene membresía de team activa (sin cuentas managed huérfanas).
  SELECT count(*), string_agg(c.slug, ',') INTO v_n, v_detail
  FROM public.coaches c
  WHERE c.subscription_status = 'team_managed'
    AND NOT EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.coach_id = c.id AND tm.status = 'active' AND tm.deleted_at IS NULL
    );
  IF v_n > 0 THEN RAISE EXCEPTION 'INV3 FAIL: % coaches team_managed sin membresía activa: %', v_n, v_detail; END IF;

  -- INV4: ningún coach con invite_code vacío (bug del DEFAULT '' que rompía el 2º coach del pool).
  SELECT count(*), string_agg(c.slug, ',') INTO v_n, v_detail
  FROM public.coaches c WHERE c.invite_code = '';
  IF v_n > 0 THEN RAISE EXCEPTION 'INV4 FAIL: % coaches con invite_code vacío: %', v_n, v_detail; END IF;

  -- (INV5 retirado: la coexistencia team+org de UNA CUENTA es válida — multi-contexto con switcher.
  --  El gate de addExistingCoachAction evita NUEVOS vínculos org->team; los existentes son legítimos.)

  -- INV6: clients.team_id siempre apunta a un team vivo.
  SELECT count(*) INTO v_n
  FROM public.clients cl
  LEFT JOIN public.teams t ON t.id = cl.team_id AND t.deleted_at IS NULL
  WHERE cl.team_id IS NOT NULL AND t.id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV6 FAIL: % clients apuntando a team borrado', v_n; END IF;

  -- INV7: workspace_preferences sin formas inválidas nuevas (el CHECK lo garantiza; doble-cinturón).
  SELECT count(*) INTO v_n
  FROM public.workspace_preferences wp
  WHERE wp.last_workspace_type IN ('coach_team','student_team')
    AND (
      (wp.last_workspace_type = 'coach_team' AND (wp.last_coach_id IS NULL OR wp.last_org_id IS NOT NULL))
      OR (wp.last_workspace_type = 'student_team' AND (wp.last_client_id IS NULL OR wp.last_org_id IS NOT NULL))
    );
  IF v_n > 0 THEN RAISE EXCEPTION 'INV7 FAIL: % workspace_preferences team con forma inválida', v_n; END IF;
END $$;

SELECT 'IDENTITY INVARIANTS OK' AS result;
