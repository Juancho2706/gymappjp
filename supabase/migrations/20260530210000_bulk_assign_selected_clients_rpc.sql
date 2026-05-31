-- Atomic bulk assign of a specific client list to a coach.
-- Replaces the 2-step UPDATE+upsert in bulkAssignSelectedClientsAction (race-condition risk).
-- All writes (clients + coach_client_assignments + audit_log) in one transaction.
-- Called with service_role from server action — no direct RLS exposure.

CREATE OR REPLACE FUNCTION public.bulk_assign_selected_clients(
    p_org_id       uuid,
    p_client_ids   uuid[],
    p_coach_id     uuid,
    p_actor_id     uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_now   timestamptz := now();
BEGIN
    -- Verify all clients belong to this org (cross-tenant guard inside RPC)
    IF EXISTS (
        SELECT 1 FROM unnest(p_client_ids) AS cid
        WHERE NOT EXISTS (
            SELECT 1 FROM clients WHERE id = cid AND org_id = p_org_id
        )
    ) THEN
        RAISE EXCEPTION 'client_not_in_org';
    END IF;

    -- Update clients.coach_id
    UPDATE clients
    SET coach_id = p_coach_id
    WHERE id = ANY(p_client_ids)
      AND org_id = p_org_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Upsert coach_client_assignments
    INSERT INTO coach_client_assignments (org_id, client_id, coach_id, assigned_at, assigned_by)
    SELECT p_org_id, unnest(p_client_ids), p_coach_id, v_now, p_actor_id
    ON CONFLICT (org_id, client_id, coach_id) DO UPDATE
        SET assigned_at = EXCLUDED.assigned_at,
            assigned_by = EXCLUDED.assigned_by;

    -- Write audit event
    INSERT INTO org_audit_logs (org_id, actor_id, action, target_type, target_id, metadata)
    VALUES (
        p_org_id,
        p_actor_id,
        'client.bulk_assigned',
        'coach',
        p_coach_id,
        jsonb_build_object(
            'client_ids', to_jsonb(p_client_ids),
            'count', v_count,
            'coach_id', p_coach_id
        )
    );

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_assign_selected_clients(uuid, uuid[], uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_assign_selected_clients(uuid, uuid[], uuid, uuid) TO service_role;
