-- Follow-up del plan de optimizacion: RPC batch-by-ids para streaks.
-- Problema: getDirectoryPulse (War Room) usa get_coach_clients_streaks (batch) que tiene guard
-- auth.uid()=coach. En la ruta mobile /api/mobile/coach/clients/pulse corre como service_role
-- (auth.uid() NULL) -> el batch devuelve 0 filas -> el JS caia en un fallback per-cliente N+1
-- (una llamada de red por alumno). Esta RPC resuelve TODOS los streaks de un array de client_ids
-- en UN solo round-trip, con guard multi-via que cubre service_role / coach / cliente / pool team.
-- Paridad validada: 20/20 filas, 0 diffs vs get_client_current_streak directo. Aditiva/idempotente.

CREATE OR REPLACE FUNCTION public.get_clients_streaks_by_ids(p_client_ids uuid[])
 RETURNS TABLE(client_id uuid, streak integer)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT c.id AS client_id,
         COALESCE(public.get_client_current_streak(c.id), 0)::integer AS streak
  FROM public.clients c
  WHERE c.id = ANY(p_client_ids)
    AND (
      auth.uid() IS NULL                                          -- service_role (ruta mobile, ya autenticada)
      OR c.coach_id = (SELECT auth.uid())                         -- coach dueño
      OR c.id = (SELECT auth.uid())                               -- el propio cliente
      OR c.id IN (SELECT public.current_user_pool_client_ids())   -- pool team
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_clients_streaks_by_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_clients_streaks_by_ids(uuid[]) TO authenticated, service_role;
