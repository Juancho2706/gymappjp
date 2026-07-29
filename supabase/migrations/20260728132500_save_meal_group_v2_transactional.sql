-- NUT-028 — Guardado transaccional de grupos de comidas (`saved_meals` + `saved_meal_items`).
--
-- Estado previo (web y RN): update del grupo -> DELETE de todos sus items -> INSERT de los
-- nuevos -> SELECT, en cuatro round-trips PostgREST independientes. Si el INSERT fallaba
-- (red, FK de un `food_id` borrado mientras el modal estaba abierto, RLS), el grupo quedaba
-- persistido con CERO items y la composicion anterior era irrecuperable: no hay soft-delete
-- ni historial. Ademas, en web un guardado con `items: []` ejecutaba el DELETE, saltaba el
-- INSERT por un `if (items.length > 0)` y devolvia `success: true` — vaciado silencioso sin
-- ningun fallo intermedio.
--
-- Esta funcion hace update/insert del grupo + delete + insert de items dentro de una sola
-- invocacion => atomico por definicion (la funcion corre en la transaccion implicita del
-- statement; cualquier excepcion revierte todo). Ademas rechaza duro la lista vacia.
--
-- SECURITY INVOKER a proposito: la RLS existente de `saved_meals` (`coach_id = auth.uid()`)
-- y de `saved_meal_items` (dueño del saved_meal) sigue siendo el guardian real. SECURITY
-- DEFINER aqui seria un agujero: bypassearia esa RLS.
--
-- Aditivo: no toca DDL, no reemplaza ninguna firma existente, no borra el camino viejo
-- (binarios RN ya publicados siguen escribiendo directo contra las mismas tablas).

create or replace function public.save_meal_group_v2(
  p_name text,
  p_items jsonb,
  p_group_id uuid default null,
  p_org_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_coach uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_group_id uuid;
  v_result jsonb;
begin
  if v_coach is null then
    raise exception 'meal_group_auth_required' using errcode = '42501';
  end if;

  if char_length(v_name) = 0 or char_length(v_name) > 120 then
    raise exception 'meal_group_name_invalid' using errcode = '22023';
  end if;

  -- Guard central del hallazgo: un grupo sin alimentos no es un grupo. Antes de tocar
  -- nada, cortamos el camino de vaciado silencioso.
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'meal_group_items_required' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as it
    where nullif(btrim(coalesce(it->>'food_id', '')), '') is null
  ) then
    raise exception 'meal_group_item_food_required' using errcode = '22023';
  end if;

  if p_group_id is null then
    -- `org_id` lo deriva el llamador desde el workspace ACTIVO (nunca del body del cliente):
    -- en enterprise el grupo pertenece a la org, en standalone/team a la libreria del coach.
    insert into public.saved_meals (name, coach_id, org_id)
    values (v_name, v_coach, p_org_id)
    returning id into v_group_id;
  else
    update public.saved_meals
    set name = v_name
    where id = p_group_id
      and coach_id = v_coach
    returning id into v_group_id;

    if v_group_id is null then
      -- No existe o no es del coach (la RLS ya lo habria filtrado): fail-closed.
      raise exception 'meal_group_not_found' using errcode = '42501';
    end if;

    delete from public.saved_meal_items where saved_meal_id = v_group_id;
  end if;

  insert into public.saved_meal_items (saved_meal_id, food_id, quantity, unit)
  select
    v_group_id,
    (it->>'food_id')::uuid,
    -- `quantity` es integer en el esquema: se redondea explicitamente (mismo resultado
    -- que el cast implicito de PostgREST) y nunca negativo.
    greatest(round(coalesce(nullif(it->>'quantity', ''), '0')::numeric), 0)::integer,
    coalesce(nullif(btrim(coalesce(it->>'unit', '')), ''), 'g')
  from jsonb_array_elements(p_items) as it;

  select to_jsonb(m) || jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'food_id', i.food_id,
          'quantity', i.quantity,
          'unit', i.unit,
          'food', to_jsonb(f)
        )
        order by i.id
      )
      from public.saved_meal_items i
      left join public.foods f on f.id = i.food_id
      where i.saved_meal_id = m.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.saved_meals m
  where m.id = v_group_id;

  return v_result;
end;
$$;

revoke all on function public.save_meal_group_v2(text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.save_meal_group_v2(text, jsonb, uuid, uuid) to authenticated;

comment on function public.save_meal_group_v2(text, jsonb, uuid, uuid) is
  'Atomic upsert of a coach meal group and its full item composition (NUT-028). '
  'SECURITY INVOKER: saved_meals/saved_meal_items RLS remains the authorization boundary. '
  'Rejects empty item lists instead of silently wiping the group.';
