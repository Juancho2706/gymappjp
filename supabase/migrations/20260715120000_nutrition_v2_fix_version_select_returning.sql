-- Fix P0: publicar plan desde el Builder V2 fallaba con 42501.
--
-- Causa raíz: PostgREST usa INSERT ... RETURNING, y Postgres evalúa la política
-- SELECT sobre la fila recién insertada. La política SELECT de
-- nutrition_plan_versions_v2 usaba private.nutrition_v2_can_read_version(id),
-- que AUTO-CONSULTA nutrition_plan_versions_v2: dentro del snapshot de la misma
-- sentencia la fila nueva no es visible → EXISTS vacío → 42501.
--
-- Fix aditivo: evaluar la legibilidad desde las columnas propias de la fila
-- (plan_id, status) leyendo solo nutrition_plans_v2 (fila padre ya committeada).
-- Semántica IDÉNTICA a nutrition_v2_can_read_version:
--   can_read_client(plan.client_id) AND
--   (can_manage_client(plan.client_id) OR status IN ('published','superseded'))
-- can_read_version original se conserva intacta (la usan las políticas de
-- variantes/franjas/items con el version_id del PADRE, donde no hay
-- auto-referencia). No se debilita aislamiento: misma base can_read_client /
-- can_manage_client. Idempotente: CREATE OR REPLACE + ALTER POLICY.

create or replace function private.nutrition_v2_can_read_version_row(
  p_plan_id uuid,
  p_status text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plans_v2 p
    where p.id = p_plan_id
      and private.nutrition_v2_can_read_client(p.client_id)
      and (
        private.nutrition_v2_can_manage_client(p.client_id)
        or p_status in ('published', 'superseded')
      )
  );
$$;

revoke all on function private.nutrition_v2_can_read_version_row(uuid, text) from public, anon;
grant execute on function private.nutrition_v2_can_read_version_row(uuid, text) to authenticated, service_role;

alter policy nutrition_plan_versions_v2_select
on public.nutrition_plan_versions_v2
using (private.nutrition_v2_can_read_version_row(plan_id, status));
