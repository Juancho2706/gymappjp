-- ============================================================================
-- EVA Nutricion — T2.6 F4 (fix de QA): la escritura de la porcion pegajosa
-- pasa a RPC guardada.  Spec: docs/specs/nutrition-authoring-speed/SPEC.md
-- ----------------------------------------------------------------------------
-- POR QUE. La primera version escribia con el upsert de PostgREST y daba 403 en
-- LIVE (visto en edge_logs durante el QA en preview). PostgREST arma
-- `INSERT ... ON CONFLICT DO UPDATE SET` con TODAS las columnas del payload
-- —coach_id, food_id y client_id incluidas— y esas no tienen grant de UPDATE a
-- proposito: la identidad de la fila es inmutable desde la app. O sea, el grant
-- column-level que protege la tabla era justo lo que rechazaba el upsert.
--
-- La salida NO es aflojar los grants sino mover la escritura a una funcion
-- guardada: el coach sale de auth.uid() (nunca del payload), se comprueba que el
-- alumno sea propio y el alimento legible, y recien ahi se escriben las dos
-- memorias (la del alumno y la general) en una sentencia.
--
-- SECURITY DEFINER porque necesita escribir columnas que `authenticated` no
-- puede tocar directamente; los guards de adentro son el control real.
--
-- ADITIVA / forward-only. Rollback al pie.
-- ============================================================================
create or replace function public.coach_food_last_qty_remember(
  p_client_id uuid,
  p_food_id   uuid,
  p_quantity  numeric,
  p_unit      text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid := (select auth.uid());
begin
  if v_coach is null then raise exception 'unauthenticated'; end if;

  -- Datos fuera de rango NO son un error del coach: es una comodidad que simplemente no se guarda.
  if p_quantity is null or p_quantity <= 0 or p_quantity > 9999 then return; end if;
  if p_unit not in ('g','ml','un') then return; end if;

  -- El alumno tiene que ser propio y el alimento legible. Sin esto, un coach podria sembrar filas
  -- apuntando al alumno de otro y confirmar su existencia por el error del unique.
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = v_coach) then return; end if;
  if not private.food_catalog_v2_can_read_food(p_food_id) then return; end if;

  insert into public.coach_food_last_qty (coach_id, food_id, client_id, quantity, unit)
  values (v_coach, p_food_id, p_client_id, p_quantity, p_unit),
         (v_coach, p_food_id, null,        p_quantity, p_unit)
  on conflict (coach_id, food_id, client_id)
  do update set quantity = excluded.quantity, unit = excluded.unit, updated_at = now();
end;
$$;

revoke all on function public.coach_food_last_qty_remember(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.coach_food_last_qty_remember(uuid, uuid, numeric, text) to authenticated, service_role;

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   drop function if exists public.coach_food_last_qty_remember(uuid, uuid, numeric, text);
-- ============================================================================
