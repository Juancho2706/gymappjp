-- F1.4 (plan 03 — modulos compra-only) — Reasignacion de alumno por org admin SIN UPDATE user-scoped.
--
-- Contexto: la app enterprise (apps/enterprise) es un cliente Expo / React Native. NO tiene servidor:
-- corre en el dispositivo con la anon key + sesion del usuario (authenticated). NO puede portar la
-- service_role key (filtraria el secreto admin en cada bundle). Hoy assignClientToCoach hace
-- `UPDATE clients SET coach_id` directo como authenticated (org-admin.ts:170-175).
--
-- Prerrequisito DURO de F2.1b: esa migracion hermana hara
-- `REVOKE UPDATE ON clients FROM authenticated` + `GRANT UPDATE(<columnas MENOS coach_id/org_id/team_id>)`.
-- Tras ese revoke, el UPDATE user-scoped de coach_id muere con 42501 y la reasignacion de alumnos por
-- org admin se rompe. Esta migracion mueve ese write a una RPC SECURITY DEFINER ANTES de la migracion
-- hermana, replicando el patron de bulk_assign_selected_clients / bulk_reassign_clients_with_audit.
--
-- Regla "org del JWT, jamas del body": la RPC NO recibe p_org_id ni p_actor_id. Deriva la org y el actor
-- de auth.uid() internamente y exige que el caller sea org_owner/org_admin ACTIVO de la org del cliente
-- (helper is_org_admin_member, SECURITY DEFINER, ya existente). Por eso es seguro concederla a
-- authenticated: toda la autorizacion es interna y derivada del JWT, no del argumento. El unico parametro
-- que viaja del cliente es el par (client_id, coach_id) a vincular, validado contra la org del caller.
--
-- Aditiva / idempotente / forward-only (CREATE OR REPLACE FUNCTION). No DROP destructivo.

CREATE OR REPLACE FUNCTION public.assign_org_client_to_coach(
    p_client_id uuid,
    p_coach_id  uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id        uuid := auth.uid();
    v_org_id          uuid;
    v_previous_coach  uuid;
    v_now             timestamptz := now();
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    -- La org sale del cliente (no del body); el cliente debe existir y tener org.
    SELECT org_id, coach_id
      INTO v_org_id, v_previous_coach
    FROM clients
    WHERE id = p_client_id;

    IF v_org_id IS NULL THEN
        -- Cliente inexistente o standalone (sin org): no es reasignable por un org admin.
        RAISE EXCEPTION 'client_not_in_org';
    END IF;

    -- Guard de membership: el caller debe ser org_owner/org_admin ACTIVO de ESA org (JWT, no body).
    IF NOT public.is_org_admin_member(v_org_id) THEN
        RAISE EXCEPTION 'not_org_admin';
    END IF;

    -- El coach destino debe ser miembro ACTIVO de la misma org.
    IF NOT EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = v_org_id
          AND om.coach_id = p_coach_id
          AND om.status = 'active'
          AND om.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'coach_not_in_org';
    END IF;

    UPDATE clients
    SET coach_id = p_coach_id
    WHERE id = p_client_id
      AND org_id = v_org_id;

    -- Espejo del assignment (unico real: org_id+client_id); mover al nuevo coach.
    INSERT INTO coach_client_assignments (org_id, client_id, coach_id, assigned_at, assigned_by, deleted_at)
    VALUES (v_org_id, p_client_id, p_coach_id, v_now, v_actor_id, NULL)
    ON CONFLICT (org_id, client_id) DO UPDATE
        SET coach_id    = EXCLUDED.coach_id,
            assigned_at = EXCLUDED.assigned_at,
            assigned_by = EXCLUDED.assigned_by,
            deleted_at  = NULL;

    INSERT INTO org_audit_logs (org_id, actor_id, action, target_type, target_id, metadata)
    VALUES (
        v_org_id,
        v_actor_id,
        'client.assigned',
        'client',
        p_client_id,
        jsonb_build_object(
            'coach_id', p_coach_id,
            'previous_coach_id', v_previous_coach,
            'source', 'assign_org_client_to_coach'
        )
    );
END;
$$;

-- Self-authorizing (toda autorizacion es interna y derivada del JWT) -> seguro para authenticated.
-- service_role tambien (paridad con el resto del panel server-side).
REVOKE ALL ON FUNCTION public.assign_org_client_to_coach(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_org_client_to_coach(uuid, uuid) TO authenticated, service_role;
