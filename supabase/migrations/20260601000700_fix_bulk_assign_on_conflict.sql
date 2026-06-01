-- Fix: bulk_assign_selected_clients used ON CONFLICT (org_id, client_id, coach_id)
-- but coach_client_assignments has UNIQUE(org_id, client_id) only.
-- Mismatch caused runtime error 42P10 (no matching unique constraint) when a
-- client was reassigned to a different coach. Correct conflict target is
-- (org_id, client_id) + update coach_id on conflict.

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
    IF EXISTS (
        SELECT 1 FROM unnest(p_client_ids) AS cid
        WHERE NOT EXISTS (
            SELECT 1 FROM clients WHERE id = cid AND org_id = p_org_id
        )
    ) THEN
        RAISE EXCEPTION 'client_not_in_org';
    END IF;

    UPDATE clients
    SET coach_id = p_coach_id
    WHERE id = ANY(p_client_ids)
      AND org_id = p_org_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Upsert by the real unique constraint (org_id, client_id); move to new coach
    INSERT INTO coach_client_assignments (org_id, client_id, coach_id, assigned_at, assigned_by, deleted_at)
    SELECT p_org_id, unnest(p_client_ids), p_coach_id, v_now, p_actor_id, NULL
    ON CONFLICT (org_id, client_id) DO UPDATE
        SET coach_id    = EXCLUDED.coach_id,
            assigned_at = EXCLUDED.assigned_at,
            assigned_by = EXCLUDED.assigned_by,
            deleted_at  = NULL;

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
