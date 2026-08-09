-- ============================================================================
-- EVA Nutricion V2 — T2.4 (F1): opciones de reemplazo del alumno, con macros VIGENTES
-- SPEC: docs/specs/nutrition-substitution-intake/SPEC.md
-- APLICADA EN LIVE el 2026-08-09 (version 20260809222811).
-- ----------------------------------------------------------------------------
-- Problema que resuelve. La fila de `nutrition_item_substitutions_v2` congela sus
-- `snapshot_*` al publicar, y cuando `quantity` es NULL (el 100% de las filas vivas)
-- ese snapshot corresponde a UNA PORCION DEL SUSTITUTO, no a lo prescrito. En prod
-- eso hace que el item "Lomo liso 120 g / 240 kcal" ofrezca "Posta de vacuno cocida
-- / 17 kcal". Para calcular la equivalencia hay que leer los macros VIGENTES del
-- sustituto, ya mergeados con el override del coach (T2.1).
--
-- Que hace: devuelve, para el dia pedido, las opciones autorizadas agrupadas por item
-- prescrito, con los macros vigentes del sustituto. El calculo de la cantidad
-- equivalente NO vive aca: vive en `packages/nutrition-v2/substitution-intake.ts`, que
-- es el mismo modulo que usan las dos UIs. Aca solo viajan DATOS.
--
-- Version del dia: sale del SNAPSHOT congelado (`nutrition_day_snapshots_v2.version_id`)
-- y solo si el dia todavia no tiene snapshot se cae al selector determinista — el MISMO
-- de `private.nutrition_v2_effective_permissions` (20260728130000:74-92) y de
-- `private.nutrition_v2_ensure_day_snapshot`. Motivo: `ensure_day_snapshot` devuelve el
-- snapshot existente sin recalcular, asi que con una re-publicacion intradia el selector
-- puro entregaria `prescription_item_id` de una version que el Today NO esta mostrando.
-- Medido en LIVE antes de aplicar: 27 de 439 dias recientes divergen.
--
-- 100% ADITIVA / forward-only: una funcion nueva. CERO cambios a tablas, RLS, grants o
-- funciones existentes. NO toca `get_nutrition_today_v2` ni ninguna RPC del hot-path.
-- Es SOLO LECTURA: no congela snapshot.
--
-- Sobre SECURITY DEFINER: no agrega privilegio. El alumno ya puede leer por RLS las tres
-- fuentes (la tabla de reemplazos por `can_read_version`, `foods`, y los overrides de SU
-- coach por la policy `cfo_select_client_coach`). La funcion existe para (a) un round-trip
-- en vez de tres selects + N+1 sobre `foods`, (b) dejar el merge del override en UN lugar
-- — el mismo `private.food_catalog_v2_item_json` que usa el coach — y (c) que la
-- resolucion de version no se reimplemente en web y RN. El scope se re-verifica con
-- `nutrition_v2_can_read_client`.
--
-- Matriz con JWT reales, corrida en transaccion con ROLLBACK antes de aplicar:
--   1 alumno propio ............ OK  items=1, version = la del snapshot del dia
--   2 alumno pidiendo otro ..... 42501 nutrition_v2_substitutions_scope_denied
--   3 coach del pool ........... OK  items=1
--   4 coach ajeno .............. 42501 nutrition_v2_substitutions_scope_denied
--   5 anon ..................... 42501 permission denied for function
--   6 dia sin plan vigente ..... OK  items=0, versionId null (degrada, no rompe)
--
-- ROLLBACK (una pasada): drop function if exists public.get_nutrition_substitution_options_v2(uuid, date);
-- ============================================================================

create or replace function public.get_nutrition_substitution_options_v2(
  p_client_id uuid,
  p_local_date date
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
  v_items jsonb;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_substitutions_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null then
    raise exception 'nutrition_v2_substitutions_invalid_input' using errcode = '22023';
  end if;

  -- (1) Version que el alumno esta viendo HOY: la congelada en el snapshot del dia.
  --     Verificado en LIVE: 27 de 439 dias recientes tienen una version de snapshot
  --     DISTINTA de la que elegiria el selector determinista (re-publicacion intradia).
  select s.version_id into v_version_id
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date;

  -- (2) Sin snapshot todavia: mismo selector determinista que ensure_day_snapshot /
  --     effective_permissions (20260728130000:74-92). NO se crea el snapshot aca.
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

  select c.coach_id into v_coach_id from public.clients c where c.id = p_client_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'prescriptionItemId', item.prescription_item_id,
        'mealSlotCode', item.slot_code,
        'item', jsonb_build_object(
          'quantity', item.quantity, 'unit', item.unit,
          'name', item.snapshot_name, 'calories', item.snapshot_calories
        ),
        'options', item.options
      )
      order by item.slot_order, item.item_order
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      pi.id                as prescription_item_id,
      ms.slot_code         as slot_code,
      ms.order_index       as slot_order,
      pi.order_index       as item_order,
      pi.quantity          as quantity,
      pi.unit              as unit,
      pi.snapshot_name     as snapshot_name,
      pi.snapshot_calories as snapshot_calories,
      jsonb_agg(
        jsonb_build_object(
          'substitutionId', s.id,
          'foodId', s.food_id,
          'recipeId', s.recipe_id,
          'customName', s.custom_name,
          -- Instruccion explicita del coach (null = "resolvelo por equivalencia").
          'quantity', s.quantity,
          'unit', s.unit,
          -- Macros VIGENTES (catalogo + override del coach), proyectados a lo que la
          -- equivalencia necesita. El merge sale de food_catalog_v2_item_json (una sola
          -- implementacion, la misma que ve el coach) pero sin arrastrar media/GTIN/sodio.
          'food', case when s.food_id is null then null else (
            select jsonb_build_object(
              'name', f ->> 'name',
              'brand', f -> 'brand',
              'calories', f -> 'calories',
              'proteinG', f -> 'proteinG',
              'carbsG', f -> 'carbsG',
              'fatsG', f -> 'fatsG',
              'fiberG', f -> 'fiberG',
              'macrosBasis', f -> 'macrosBasis',
              'servingSize', f -> 'servingSize',
              'servingUnit', f -> 'servingUnit',
              'hasOverride', f -> 'hasOverride'
            )
            -- `as t(f)`: la funcion devuelve un jsonb ESCALAR; sin nombrar la columna,
            -- `f -> 'x'` se resolveria contra el alias de tabla y no compila.
            from private.food_catalog_v2_item_json(s.food_id, v_coach_id) as t(f)
          ) end,
          -- Referencia historica; NO se usa para calcular (es la que produce el "17 kcal").
          'frozen', jsonb_build_object(
            'name', coalesce(s.snapshot_name, s.custom_name),
            'brand', s.snapshot_brand,
            'calories', s.snapshot_calories
          )
        )
        order by s.order_index, s.id
      ) as options
    from public.nutrition_item_substitutions_v2 s
    join public.nutrition_prescription_items_v2 pi on pi.id = s.prescription_item_id
    join public.nutrition_meal_slots_v2 ms on ms.id = pi.meal_slot_id
    where s.version_id = v_version_id
    group by pi.id, ms.slot_code, ms.order_index, pi.order_index,
             pi.quantity, pi.unit, pi.snapshot_name, pi.snapshot_calories
  ) as item;

  return jsonb_build_object(
    'schemaVersion', 1,
    'localDate', p_local_date,
    'versionId', v_version_id,
    'items', v_items
  );
end;
$fn$;

revoke all on function public.get_nutrition_substitution_options_v2(uuid, date)
  from public, anon;

grant execute on function public.get_nutrition_substitution_options_v2(uuid, date)
  to authenticated;

comment on function public.get_nutrition_substitution_options_v2(uuid, date) is
  'Reemplazos autorizados del dia por item prescrito, con los macros VIGENTES del sustituto '
  '(catalogo + override del coach). La version sale del snapshot del dia; sin snapshot, del '
  'selector determinista. Solo lectura: no congela snapshot ni toca el hot-path. La cantidad '
  'equivalente NO se calcula aca: vive en packages/nutrition-v2/substitution-intake.ts. T2.4.';

-- ============================================================================
-- ROLLBACK (una pasada — referencia de operacion):
--   drop function if exists public.get_nutrition_substitution_options_v2(uuid, date);
-- ============================================================================
