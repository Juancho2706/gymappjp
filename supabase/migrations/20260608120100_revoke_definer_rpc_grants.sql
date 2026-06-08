-- F15: org-mutation SECURITY DEFINER RPCs were EXECUTE-granted to anon + authenticated.
-- Because they are SECURITY DEFINER and exposed via PostgREST (/rest/v1/rpc/<fn>), any
-- anon or authenticated caller could invoke them directly with arbitrary UUIDs and
-- reassign/assign clients across orgs, bypassing the org-admin checks the server actions
-- enforce. These functions are only ever called from server actions through the
-- service_role admin client (admin.rpc(...) in org.actions.ts), which keeps EXECUTE.
--
-- bulk_reassign_clients (3-arg) has NO app caller at all (superseded by _with_audit).
--
-- Verified against prod: grants were {service_role, authenticated, anon}; callers use
-- the service_role client. Revoking anon+authenticated does not affect legitimate use.
--
-- NOTE (separate follow-up): the read-only get_* SECURITY DEFINER functions are also
-- anon-executable and leak data by arbitrary id; those are revoked in a later migration
-- after per-function caller verification (check_platform_email_availability must stay
-- anon-executable for pre-auth signup, so a blanket revoke is unsafe).
--
-- Rollback:
--   GRANT EXECUTE ON FUNCTION public.bulk_reassign_clients(uuid, uuid, uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.bulk_assign_selected_clients(uuid, uuid[], uuid, uuid) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.bulk_reassign_clients_with_audit(uuid, uuid, uuid, uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bulk_reassign_clients(uuid, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_assign_selected_clients(uuid, uuid[], uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_reassign_clients_with_audit(uuid, uuid, uuid, uuid, uuid) FROM anon, authenticated;
