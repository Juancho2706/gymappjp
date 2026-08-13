-- ============================================================================
-- EVA Nutricion — T2.6 F4: lectura de la porcion pegajosa con la precedencia en SQL
-- Spec: docs/specs/nutrition-authoring-speed/SPEC.md · Tarea: TASKS.md F4
-- ----------------------------------------------------------------------------
-- `coach_food_last_qty` guarda hasta dos filas por alimento: la del alumno
-- (`client_id` con valor) y la general del coach (`client_id` null). Gana la del
-- alumno. Resolverlo en la app significaria traer las dos y descartar una en
-- cada carga del builder; `distinct on` devuelve directo la ganadora.
--
-- SECURITY INVOKER a proposito: la RLS de la tabla ya limita a las filas del
-- coach autenticado, y una funcion definer aca solo agregaria superficie. El
-- coach NO se toma de un parametro —seria confiar en lo que manda la UI—: sale
-- de auth.uid().
--
-- ADITIVA / forward-only: funcion nueva, cero cambios de tabla. Rollback al pie.
-- ============================================================================
create or replace function public.coach_food_last_qty_for_client(p_client_id uuid)
returns table (food_id uuid, quantity numeric, unit text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (l.food_id) l.food_id, l.quantity, l.unit
  from public.coach_food_last_qty l
  where l.coach_id = (select auth.uid())
    and (l.client_id = p_client_id or l.client_id is null)
  order by l.food_id, l.client_id nulls last
$$;

revoke all on function public.coach_food_last_qty_for_client(uuid) from public, anon;
grant execute on function public.coach_food_last_qty_for_client(uuid) to authenticated, service_role;

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   drop function if exists public.coach_food_last_qty_for_client(uuid);
-- ============================================================================
