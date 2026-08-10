-- ============================================================================
-- EVA Nutricion V2 — T2.5 (F2): la RPC de opciones aprende el GRUPO de intercambio
-- SPEC: docs/specs/nutrition-exchange-swap/SPEC.md
-- ----------------------------------------------------------------------------
-- Que cambia respecto de T2.4 (`20260809222811`):
--
-- 1. La base deja de ser `nutrition_item_substitutions_v2` y pasa a ser
--    `nutrition_prescription_items_v2`. Antes solo viajaban los items CON reemplazo del
--    coach: 15 en toda la base. Ahora viajan todos los del dia, porque 832 tienen grupo
--    y ninguna fila. Los items sin reemplazos viajan con `options: []`, y los clientes de
--    T2.4 ya desplegados tratan eso como "no pintar nada" (leido en el codigo vivo:
--    `if (!entry || options.length === 0) return null`).
-- 2. Cada item suma `group`, `groupTotal` y — solo para el item que el sheet abrio —
--    `groupOptions`.
--
-- POR QUE ES `drop` + `create` Y NO `create or replace`:
--   Postgres no permite cambiar la lista de argumentos con `create or replace`: crearia
--   una SEGUNDA funcion y la llamada de 2 argumentos que hacen hoy la web y el movil
--   quedaria ambigua. Reproducido en LIVE con probe + rollback:
--     42725 :: function public.zz_probe_ambig(integer, integer) is not unique
--   Es decir: "los clientes viejos siguen llamandola igual" habria TUMBADO T2.4 en
--   produccion en el momento de aplicar. Los grants tampoco viajan con la firma nueva,
--   asi que se re-emiten explicitamente. Todo en una transaccion.
--
-- COSTO. Dos decisiones, las dos medidas:
--   * `private.food_catalog_v2_item_json` arrastra media y overrides, asi que solo se llama
--     para lo que se devuelve: las opciones del coach (pocas) y la PAGINA del grupo del item
--     pedido. Sin `p_prescription_item_id` no se computa ninguna pagina.
--   * `groupTotal` NO se cuenta por item. La primera version lo hacia y el resultado fue
--     medido en LIVE: 106 ms contra los 8 ms de T2.4, en una llamada que corre al abrir la
--     pantalla de Hoy. El motivo era recorrer los ~600 alimentos del grupo una vez por cada
--     uno de los 21 items. Ahora se cuenta UNA vez por conjunto de grupos distinto (a lo
--     sumo 9 en toda la base) y por item solo se restan las exclusiones propias: su propio
--     alimento y los que ya ofrece el coach, que son un puñado.
--
-- ORDEN DEL BLOQUE GRUPO. "Cercania calorica" no sirve como criterio: por construccion
-- TODAS las opciones igualan las kcal del item. Lo que las diferencia es cuan natural es
-- la cantidad que hay que comer. Como la cantidad equivalente es
-- `target_kcal / kcal_por_unidad` y la porcion de referencia del sustituto es su
-- `serving_size` (o 1 unidad contada), la razon entre ambas se reduce a
-- `target_kcal / kcal_de_una_porcion_del_sustituto`. O sea: se ordena por cuan cerca estan
-- las kcal de UNA PORCION del sustituto de las kcal del item, en escala logaritmica para
-- que el doble y la mitad pesen igual. Es solo ORDEN: la cantidad que se muestra y se
-- persiste la calcula `packages/nutrition-v2/substitution-intake.ts`, como en T2.4.
--
-- BUSQUEDA. `private.food_catalog_v2_normalize_text` reduce todo lo que no sea [a-z0-9] a
-- espacios, asi que los comodines `%` y `_` del `like` no sobreviven a la normalizacion y
-- no hace falta escaparlos. Si ese normalizador cambiara, hay que revisar esto.
--
-- MEMBRESIA Y VISIBILIDAD. El guard de F1 (`20260810161604`) pregunta "en que grupos esta
-- este alimento"; la RPC pregunta "que alimentos hay en estos grupos". Son las dos
-- direcciones de la MISMA relacion, asi que se escriben como dos helpers hermanos con la
-- misma semantica (overlay con dueno + legacy, `is_excluded` respetado, tenant filtrado).
-- La equivalencia entre ambos se verifico sobre el catalogo entero antes de aplicar: si
-- divergieran, el servidor ofreceria cosas que el guard rechaza.
--
-- ROLLBACK (una pasada):
--   drop function if exists public.get_nutrition_substitution_options_v2(uuid, date, uuid, text, integer, uuid);
--   drop function if exists private.nutrition_v2_exchange_group_members(uuid[], uuid, uuid);
--   -- y re-aplicar 20260809222811 completa (incluidos sus grants).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hermano set-based de `private.nutrition_v2_exchange_group_ids` (F1).
-- ---------------------------------------------------------------------------
create or replace function private.nutrition_v2_exchange_group_members(
  p_group_ids uuid[],
  p_coach_id uuid,
  p_org_id uuid
)
returns table (food_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  with visible as (
    select egf.food_id,
           egf.exchange_group_id as gid,
           case
             when egf.coach_id is not null then 0
             when egf.org_id is not null then 1
             else 2
           end as owner_rank,
           egf.is_excluded
    from public.exchange_group_foods egf
    where egf.exchange_group_id = any(p_group_ids)
      and (
        (egf.coach_id is null and egf.org_id is null)
        or egf.coach_id = p_coach_id
        or (egf.org_id is not null and egf.org_id = p_org_id)
      )
    union all
    select f.id, f.exchange_group_id, 3, false
    from public.foods f
    where f.exchange_group_id = any(p_group_ids)
  ),
  best as (
    -- Una fila por (alimento, grupo): gana el dueno mas cercano, y si ESE dijo
    -- "excluido", queda excluido. Identico criterio que el helper hermano.
    select distinct on (food_id, gid) food_id, gid, is_excluded
    from visible
    order by food_id, gid, owner_rank
  )
  select distinct food_id
  from best
  where not is_excluded;
$function$;

revoke all on function private.nutrition_v2_exchange_group_members(uuid[], uuid, uuid) from public, anon, authenticated;

comment on function private.nutrition_v2_exchange_group_members(uuid[], uuid, uuid) is
  'T2.5: alimentos que pertenecen a alguno de los grupos dados, con la misma semantica que '
  'private.nutrition_v2_exchange_group_ids (overlay con dueno + legacy, is_excluded respetado, '
  'tenant filtrado). Es la direccion inversa del mismo hecho: si divergen, la RPC ofreceria lo '
  'que el guard rechaza.';

-- ---------------------------------------------------------------------------
-- La RPC
-- ---------------------------------------------------------------------------
drop function if exists public.get_nutrition_substitution_options_v2(uuid, date);

create function public.get_nutrition_substitution_options_v2(
  p_client_id uuid,
  p_local_date date,
  p_prescription_item_id uuid default null,
  p_group_query text default null,
  p_group_limit integer default 20,
  p_group_food_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_version_id uuid;
  v_coach_id uuid;
  v_org_id uuid;
  v_limit integer;
  v_query text;
  v_items jsonb;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_substitutions_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null then
    raise exception 'nutrition_v2_substitutions_invalid_input' using errcode = '22023';
  end if;

  -- El cliente puede mandar lo que quiera por PostgREST: el tope se decide aca.
  v_limit := least(greatest(coalesce(p_group_limit, 20), 1), 50);
  v_query := nullif(private.food_catalog_v2_normalize_text(p_group_query), '');

  -- (1) Version que el alumno esta viendo HOY: la congelada en el snapshot del dia.
  select s.version_id into v_version_id
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date;

  -- (2) Sin snapshot todavia: mismo selector determinista que ensure_day_snapshot.
  if v_version_id is null then
    select v.id into v_version_id
    from public.nutrition_plans_v2 p
    join public.nutrition_plan_versions_v2 v on v.plan_id = p.id
    where p.client_id = p_client_id
      and p.lifecycle_status = 'active'
      and v.status in ('published', 'superseded')
      and v.effective_from <= p_local_date
      and (v.effective_to is null or v.effective_to >= p_local_date)
    order by v.effective_from desc, v.published_at desc nulls last, v.version_number desc, v.id desc
    limit 1;
  end if;

  if v_version_id is null then
    return jsonb_build_object(
      'schemaVersion', 1, 'localDate', p_local_date, 'versionId', null, 'items', '[]'::jsonb
    );
  end if;

  select c.coach_id, c.org_id into v_coach_id, v_org_id
  from public.clients c where c.id = p_client_id;

  with items as (
    -- Los items del dia, con sus grupos resueltos una sola vez por item.
    select pi.id, pi.food_id, pi.quantity, pi.unit, pi.order_index,
           pi.snapshot_name, pi.snapshot_calories,
           pi.snapshot_protein_g, pi.snapshot_carbs_g, pi.snapshot_fats_g,
           ms.slot_code, ms.order_index as slot_order,
           case when pi.food_id is null then '{}'::uuid[]
                else private.nutrition_v2_exchange_group_ids(pi.food_id, v_coach_id, v_org_id)
           end as gids
    from public.nutrition_prescription_items_v2 pi
    join public.nutrition_meal_slots_v2 ms on ms.id = pi.meal_slot_id
    where pi.version_id = v_version_id
  ),
  gsets as (
    -- Conjuntos de grupos DISTINTOS del dia: a lo sumo 9 en toda la base, contra 21+ items.
    select distinct gids from items where coalesce(array_length(gids, 1), 0) > 0
  ),
  gcount as (
    -- El conteo caro, una vez por conjunto.
    select gs.gids, count(*)::int as total
    from gsets gs
    join private.nutrition_v2_exchange_group_members(gs.gids, v_coach_id, v_org_id) m on true
    join public.foods f on f.id = m.food_id
    where coalesce(f.calories, 0) > 0
      and (
        (f.coach_id is null and f.org_id is null)
        or f.coach_id = v_coach_id
        or (f.org_id is not null and f.org_id = v_org_id)
      )
      and (v_query is null or f.name_search like '%' || v_query || '%')
    group by gs.gids
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'prescriptionItemId', pi.id,
        'mealSlotCode', pi.slot_code,
        'item', jsonb_build_object(
          'quantity', pi.quantity,
          'unit', pi.unit,
          'name', pi.snapshot_name,
          'calories', pi.snapshot_calories,
          'proteinG', pi.snapshot_protein_g,
          'carbsG', pi.snapshot_carbs_g,
          'fatsG', pi.snapshot_fats_g
        ),
        'options', coach.options,
        'group', grp.header,
        'groupTotal', tot.total,
        'groupOptions', page.options
      )
      order by pi.slot_order, pi.order_index
    ),
    '[]'::jsonb
  )
  into v_items
  from items pi

  -- Reemplazos autorizados por el coach (T2.4, verbatim salvo `origin`).
  cross join lateral (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'origin', 'coach',
        'substitutionId', s.id,
        'foodId', s.food_id,
        'recipeId', s.recipe_id,
        'customName', s.custom_name,
        'quantity', s.quantity,
        'unit', s.unit,
        'food', case when s.food_id is null then null else (
          select jsonb_build_object(
            'name', f ->> 'name', 'brand', f -> 'brand',
            'calories', f -> 'calories', 'proteinG', f -> 'proteinG',
            'carbsG', f -> 'carbsG', 'fatsG', f -> 'fatsG', 'fiberG', f -> 'fiberG',
            'macrosBasis', f -> 'macrosBasis', 'servingSize', f -> 'servingSize',
            'servingUnit', f -> 'servingUnit', 'hasOverride', f -> 'hasOverride'
          )
          -- `as t(f)`: la funcion devuelve un jsonb ESCALAR; sin nombrar la columna,
          -- `f -> 'x'` se resolveria contra el alias de tabla y no compila.
          from private.food_catalog_v2_item_json(s.food_id, v_coach_id) as t(f)
        ) end,
        'frozen', jsonb_build_object(
          'name', coalesce(s.snapshot_name, s.custom_name),
          'brand', s.snapshot_brand,
          'calories', s.snapshot_calories
        )
      )
      order by s.order_index, s.id
    ), '[]'::jsonb) as options
    from public.nutrition_item_substitutions_v2 s
    where s.prescription_item_id = pi.id
  ) coach

  -- Header: un alimento podria estar en mas de un grupo; se toma el primero por codigo
  -- para que la eleccion sea estable entre llamadas.
  cross join lateral (
    select (
      select jsonb_build_object('id', eg.id, 'code', eg.code, 'name', eg.name)
      from public.exchange_groups eg
      where eg.id = any(pi.gids)
      order by eg.code
      limit 1
    ) as header
  ) grp

  -- Conteo del grupo: viaja SIEMPRE, porque la fila necesita decir "N equivalentes".
  -- Sale del conteo por conjunto (`gcount`, una vez) menos las exclusiones PROPIAS del item:
  -- su alimento (que pertenece a su grupo por construccion) y los que ya ofrece el coach.
  -- La pertenencia de esos pocos se resuelve con el helper por-alimento, no re-escaneando
  -- el grupo entero: eso era lo que costaba 106 ms.
  cross join lateral (
    select case
      when coalesce(array_length(pi.gids, 1), 0) = 0
        or coalesce(pi.snapshot_calories, 0) <= 0
      then 0
      else greatest(
        coalesce((select gc.total from gcount gc where gc.gids = pi.gids), 0)
        - (
          select count(*)::int
          from public.foods fo
          where fo.id = pi.food_id
            and coalesce(fo.calories, 0) > 0
            and (
              (fo.coach_id is null and fo.org_id is null)
              or fo.coach_id = v_coach_id
              or (fo.org_id is not null and fo.org_id = v_org_id)
            )
            and (v_query is null or fo.name_search like '%' || v_query || '%')
        )
        - (
          select count(distinct f5.id)::int
          from public.nutrition_item_substitutions_v2 s5
          join public.foods f5 on f5.id = s5.food_id
          where s5.prescription_item_id = pi.id
            and f5.id is distinct from pi.food_id
            and coalesce(f5.calories, 0) > 0
            and (
              (f5.coach_id is null and f5.org_id is null)
              or f5.coach_id = v_coach_id
              or (f5.org_id is not null and f5.org_id = v_org_id)
            )
            and (v_query is null or f5.name_search like '%' || v_query || '%')
            and private.nutrition_v2_exchange_group_ids(f5.id, v_coach_id, v_org_id) && pi.gids
        ),
        0
      )
    end as total
  ) tot

  -- La pagina solo se computa para el item que el sheet abrio.
  cross join lateral (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'origin', 'group',
        'substitutionId', null,
        'foodId', c.food_id,
        'recipeId', null,
        'customName', null,
        'quantity', null,
        'unit', null,
        'food', (
          select jsonb_build_object(
            'name', f3 ->> 'name', 'brand', f3 -> 'brand',
            'calories', f3 -> 'calories', 'proteinG', f3 -> 'proteinG',
            'carbsG', f3 -> 'carbsG', 'fatsG', f3 -> 'fatsG', 'fiberG', f3 -> 'fiberG',
            'macrosBasis', f3 -> 'macrosBasis', 'servingSize', f3 -> 'servingSize',
            'servingUnit', f3 -> 'servingUnit', 'hasOverride', f3 -> 'hasOverride'
          )
          from private.food_catalog_v2_item_json(c.food_id, v_coach_id) as t3(f3)
        ),
        'frozen', jsonb_build_object('name', null, 'brand', null, 'calories', null)
      )
      order by c.distance, c.name, c.food_id
    ), '[]'::jsonb) as options
    from (
      select cand2.food_id, cand2.distance, cand2.name
      from (
        select f4.id as food_id,
               abs(ln(f4.calories::numeric / pi.snapshot_calories)) as distance,
               f4.name
        from private.nutrition_v2_exchange_group_members(pi.gids, v_coach_id, v_org_id) m4
        join public.foods f4 on f4.id = m4.food_id
        where p_prescription_item_id is not null
          and pi.id = p_prescription_item_id
          and coalesce(array_length(pi.gids, 1), 0) > 0
          and coalesce(pi.snapshot_calories, 0) > 0
          and f4.id is distinct from pi.food_id
          and coalesce(f4.calories, 0) > 0
          and (p_group_food_id is null or f4.id = p_group_food_id)
          and (
            (f4.coach_id is null and f4.org_id is null)
            or f4.coach_id = v_coach_id
            or (f4.org_id is not null and f4.org_id = v_org_id)
          )
          and not exists (
            select 1 from public.nutrition_item_substitutions_v2 s4
            where s4.prescription_item_id = pi.id and s4.food_id = f4.id
          )
          and (
            p_group_food_id is not null
            or v_query is null
            or f4.name_search like '%' || v_query || '%'
          )
      ) cand2
      order by cand2.distance, cand2.name, cand2.food_id
      limit v_limit
    ) c
  ) page

  ;

  return jsonb_build_object(
    'schemaVersion', 1,
    'localDate', p_local_date,
    'versionId', v_version_id,
    'items', v_items
  );
end;
$fn$;

revoke all on function public.get_nutrition_substitution_options_v2(uuid, date, uuid, text, integer, uuid)
  from public, anon;

grant execute on function public.get_nutrition_substitution_options_v2(uuid, date, uuid, text, integer, uuid)
  to authenticated;

comment on function public.get_nutrition_substitution_options_v2(uuid, date, uuid, text, integer, uuid) is
  'T2.5: opciones de reemplazo del dia por item prescrito. Bloque coach (filas autorizadas, macros '
  'vigentes) + bloque grupo de intercambio (misma membresia y visibilidad que el guard). El grupo se '
  'pagina solo para p_prescription_item_id; p_group_food_id resuelve UNA opcion para validarla en el '
  'boundary. Solo lectura: no congela snapshot ni toca el hot-path.';
