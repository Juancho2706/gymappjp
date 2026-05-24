CREATE OR REPLACE FUNCTION bulk_reassign_clients_with_audit(
  p_from_coach_id uuid,
  p_to_coach_id   uuid,
  p_org_id        uuid,
  p_actor_id      uuid,
  p_member_id     uuid
) RETURNS integer
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
  v_from_role text;
  v_to_member_id uuid;
BEGIN
  SELECT role
    INTO v_from_role
  FROM organization_members
  WHERE id = p_member_id
    AND org_id = p_org_id
    AND coach_id = p_from_coach_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_from_role IS NULL THEN
    RAISE EXCEPTION 'Source member not found';
  END IF;

  IF v_from_role = 'org_owner' THEN
    RAISE EXCEPTION 'Cannot remove organization owner';
  END IF;

  SELECT id
    INTO v_to_member_id
  FROM organization_members
  WHERE org_id = p_org_id
    AND coach_id = p_to_coach_id
    AND status = 'active'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_to_member_id IS NULL THEN
    RAISE EXCEPTION 'Target coach is not active in organization';
  END IF;

  UPDATE clients
  SET coach_id = p_to_coach_id
  WHERE org_id = p_org_id
    AND coach_id = p_from_coach_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE coach_client_assignments
  SET coach_id = p_to_coach_id
  WHERE org_id = p_org_id
    AND coach_id = p_from_coach_id
    AND deleted_at IS NULL;

  UPDATE organization_members
  SET deleted_at = now(),
      status = 'suspended'
  WHERE id = p_member_id
    AND org_id = p_org_id;

  INSERT INTO org_audit_logs (
    org_id,
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) VALUES (
    p_org_id,
    p_actor_id,
    'clients.bulk_reassigned',
    'coach',
    p_from_coach_id,
    jsonb_build_object(
      'to_coach_id', p_to_coach_id,
      'clients_moved', v_count,
      'source', 'bulk_reassign_clients_with_audit'
    )
  );

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION bulk_reassign_clients_with_audit(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_reassign_clients_with_audit(uuid, uuid, uuid, uuid, uuid) TO service_role;
