-- INVARIANTES DE SEPARACIÓN de los 3 flujos (coach_standalone / enterprise_coach / coach_team).
-- Complementa tests/team/identity-consistency.sql (INV1..INV7) — este archivo cubre INV8..INV14.
-- Solo SELECTs (read-only, apto prod). Requiere rol con lectura de auth.users (postgres/service via MCP execute_sql).
-- Esperado: una fila 'SEPARATION INVARIANTS OK'. Cualquier violación hace RAISE EXCEPTION con detalle.
DO $$
DECLARE v_n int; v_detail text; v_uid uuid;
BEGIN
  -- INV8: ningún client puede pertenecer a una org Y a un team a la vez (enterprise y pool son mundos aislados).
  SELECT count(*), string_agg(cl.id::text, ',') INTO v_n, v_detail
  FROM public.clients cl
  WHERE cl.org_id IS NOT NULL AND cl.team_id IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV8 FAIL: % clients con org_id Y team_id simultáneos: %', v_n, v_detail; END IF;

  -- INV9: toda membresía ACTIVA coincide con la forma de su client:
  --   standalone => client.coach_id NOT NULL, org_id NULL, team_id NULL
  --   enterprise => client.org_id = cm.org_id
  --   team       => client.team_id = cm.team_id
  -- (IS NOT DISTINCT FROM para que un NULL en el client cuente como violación, no como "unknown").
  SELECT count(*), string_agg(cm.account_id::text || '(' || cm.scope || ')', ',') INTO v_n, v_detail
  FROM public.client_memberships cm
  JOIN public.clients cl ON cl.id = cm.client_id
  WHERE cm.status = 'active' AND cm.deleted_at IS NULL
    AND NOT (
      (cm.scope = 'standalone' AND cl.coach_id IS NOT NULL AND cl.org_id IS NULL AND cl.team_id IS NULL)
      OR (cm.scope = 'enterprise' AND cl.org_id IS NOT DISTINCT FROM cm.org_id)
      OR (cm.scope = 'team' AND cl.team_id IS NOT DISTINCT FROM cm.team_id)
    );
  IF v_n > 0 THEN RAISE EXCEPTION 'INV9 FAIL: % membresías activas que no coinciden con la forma de su client: %', v_n, v_detail; END IF;

  -- INV10: todo alumno de pool activo (clients.team_id set, no archivado) debe tener AMBOS
  -- consentimientos vigentes (granted_at set, revoked_at NULL):
  -- pool_multidisciplinary_access Y health_data_processing.
  -- EXCEPCIÓN conocida (check estilo WARNING): el fixture E2E "Diana" queda intencionalmente
  -- SIN consentimiento para validar el consent gate de /t/[slug]/consent. Allowlist de tamaño 1:
  -- solo se lanza excepción si hay MÁS de 1 violador. Si se agrega otro fixture pendiente a
  -- propósito, revisar este umbral con criterio (no subirlo a ciegas).
  SELECT count(*), string_agg(cl.id::text, ',') INTO v_n, v_detail
  FROM public.clients cl
  WHERE cl.team_id IS NOT NULL
    AND cl.is_archived = false
    AND NOT (
      EXISTS (
        SELECT 1 FROM public.client_consents cc
        WHERE cc.client_id = cl.id AND cc.purpose = 'pool_multidisciplinary_access'
          AND cc.granted_at IS NOT NULL AND cc.revoked_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM public.client_consents cc
        WHERE cc.client_id = cl.id AND cc.purpose = 'health_data_processing'
          AND cc.granted_at IS NOT NULL AND cc.revoked_at IS NULL
      )
    );
  IF v_n > 1 THEN RAISE EXCEPTION 'INV10 FAIL: % alumnos de pool sin ambos consentimientos vigentes (umbral permitido: 1 fixture Diana): %', v_n, v_detail; END IF;

  -- INV11: workout_programs / nutrition_plans asignados a un client heredan exactamente su org_id
  -- (templates con client_id NULL exentos; en standalone/team ambos org_id son NULL y coinciden).
  SELECT count(*), string_agg(v.src, ',') INTO v_n, v_detail
  FROM (
    SELECT 'wp:' || wp.id::text AS src
    FROM public.workout_programs wp
    JOIN public.clients cl ON cl.id = wp.client_id
    WHERE wp.org_id IS DISTINCT FROM cl.org_id
    UNION ALL
    SELECT 'np:' || np.id::text
    FROM public.nutrition_plans np
    JOIN public.clients cl ON cl.id = np.client_id
    WHERE np.org_id IS DISTINCT FROM cl.org_id
  ) v;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV11 FAIL: % programas/planes cuyo org_id no coincide con el de su client: %', v_n, v_detail; END IF;

  -- INV12: saved_meals org-scoped solo de coaches que son miembros ACTIVOS de esa org
  -- (sin filas activas en organization_members no hay derecho a escribir catálogo de la org).
  SELECT count(*), string_agg(sm.id::text, ',') INTO v_n, v_detail
  FROM public.saved_meals sm
  WHERE sm.org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = sm.org_id AND om.coach_id = sm.coach_id
        AND om.status = 'active' AND om.deleted_at IS NULL
    );
  IF v_n > 0 THEN RAISE EXCEPTION 'INV12 FAIL: % saved_meals org-scoped cuyo coach no es miembro activo de esa org: %', v_n, v_detail; END IF;

  -- INV13: forma de las personas E2E (Wave 2). Corre SOLO si el seed existe (guard por slug del coach solo);
  -- en una DB sin seed E2E este bloque entero se salta sin fallar.
  IF EXISTS (SELECT 1 FROM public.coaches WHERE slug = 'e2e-aurora-strength') THEN

    -- INV13a: el coach standalone no tiene NINGÚN vínculo team ni org (ni siquiera revocado).
    SELECT count(*) INTO v_n
    FROM public.coaches c
    WHERE c.slug = 'e2e-aurora-strength'
      AND (
        EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.coach_id = c.id)
        OR EXISTS (SELECT 1 FROM public.organization_members om WHERE om.coach_id = c.id)
      );
    IF v_n > 0 THEN RAISE EXCEPTION 'INV13a FAIL: coach standalone e2e-aurora-strength tiene filas en team_members u organization_members'; END IF;

    -- INV13b: el coach enterprise es org_managed y tiene membresía de org activa.
    SELECT u.id INTO v_uid FROM auth.users u WHERE u.email = 'e2e-org-coach@evatest.cl';
    SELECT count(*) INTO v_n
    FROM public.coaches c
    WHERE c.id = v_uid
      AND c.subscription_status = 'org_managed'
      AND EXISTS (
        SELECT 1 FROM public.organization_members om
        WHERE om.coach_id = c.id AND om.status = 'active' AND om.deleted_at IS NULL
      );
    IF v_n <> 1 THEN RAISE EXCEPTION 'INV13b FAIL: e2e-org-coach no es org_managed con membresía org activa (matches=%)', v_n; END IF;

    -- INV13c: los 2 coaches del pool (owner + miembro) son team_managed con team_members activa.
    SELECT count(*) INTO v_n
    FROM auth.users u
    JOIN public.coaches c ON c.id = u.id
    WHERE u.email IN ('e2e-team-owner@evatest.cl', 'e2e-team-coach@evatest.cl')
      AND c.subscription_status = 'team_managed'
      AND EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.coach_id = c.id AND tm.status = 'active' AND tm.deleted_at IS NULL
      );
    IF v_n <> 2 THEN RAISE EXCEPTION 'INV13c FAIL: coaches de pool E2E inválidos (esperaba 2 team_managed con membresía activa, hay %)', v_n; END IF;

    -- INV13d: el org owner es admin puro — NO debe tener fila en coaches.
    SELECT count(*) INTO v_n
    FROM auth.users u
    JOIN public.coaches c ON c.id = u.id
    WHERE u.email = 'e2e-org-owner@evatest.cl';
    IF v_n > 0 THEN RAISE EXCEPTION 'INV13d FAIL: e2e-org-owner tiene fila en coaches (debe ser org_owner puro sin cuenta de coach)'; END IF;
  END IF;

  -- INV14: ningún coach managed (org o team) con preapproval MP propio — la facturación la lleva
  -- la org/el team, nunca una suscripción individual de MercadoPago en paralelo.
  SELECT count(*), string_agg(c.slug, ',') INTO v_n, v_detail
  FROM public.coaches c
  WHERE c.subscription_status IN ('org_managed', 'team_managed')
    AND c.subscription_mp_id IS NOT NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'INV14 FAIL: % coaches managed con subscription_mp_id propio: %', v_n, v_detail; END IF;
END $$;

SELECT 'SEPARATION INVARIANTS OK' AS result;
