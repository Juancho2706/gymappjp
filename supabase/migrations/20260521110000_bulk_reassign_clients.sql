CREATE OR REPLACE FUNCTION bulk_reassign_clients(
  p_from_coach_id uuid,
  p_to_coach_id   uuid,
  p_org_id        uuid
) RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE clients
  SET coach_id = p_to_coach_id
  WHERE org_id   = p_org_id
    AND coach_id = p_from_coach_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE coach_client_assignments
  SET coach_id = p_to_coach_id
  WHERE org_id   = p_org_id
    AND coach_id = p_from_coach_id
    AND deleted_at IS NULL;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION bulk_reassign_clients(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_reassign_clients(uuid, uuid, uuid) TO service_role;
