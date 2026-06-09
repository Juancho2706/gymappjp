-- Hardening team_foundation: las funciones-trigger NO deben ser invocables por RPC.
-- Disparan como triggers (corren como owner) sin necesidad de grant EXECUTE.
-- Quita advisors 0028/0029 sobre estas 3 funciones. Aplicada a prod 2026-06-09.
REVOKE EXECUTE ON FUNCTION public.teams_guard_owner_fields()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.team_members_guard()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.team_members_seat_guard()   FROM PUBLIC, anon, authenticated;
