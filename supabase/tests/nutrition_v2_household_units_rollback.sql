-- Nutricion V2 — W2 «Cantidades honestas»: smoke de la MEDIDA CASERA congelada.
--
-- Cubre los invariantes que introduce
-- `supabase/migrations/20260906202957_nutrition_v2_household_units.sql`
-- (SPEC docs/specs/nutrition-cantidades-honestas/SPEC.md §5.4; auditoria
--  AUDIT-W2.0-unit-paths.md §3.a filas a1..a7):
--   A. publicar un item «2 huevos» ⇒ la fila queda en GRAMOS (122 g) con el par casero
--      congelado (household_label = 'huevo', household_grams = 61), y los DOS read models
--      del plan (`get_nutrition_today_v2` y `get_nutrition_plan_read_v2`) emiten
--      `householdLabel`/`householdGrams`;
--   B. un «Lo comi» sobre ese item ⇒ `intakeItems[].householdLabel/householdGrams` resueltos
--      desde el item prescrito (private.nutrition_v2_intake_item_json, a7);
--   C. `unit = 'casera'` NO se persiste: 23514 por
--      `nutrition_prescription_items_v2_unit_not_casera` (el cierre real — sin el, las tres
--      formulas de macros caen en la rama contable; auditoria §2);
--   D. `household_grams = 5000` ⇒ 23514 por `..._household_grams_range` (rango [1, 1000]);
--   E. par roto (etiqueta sin gramos) ⇒ 23514 por `..._household_pair`.
--
-- Seguro por construccion:
--   * toma un coach standalone con un alumno que HOY no tiene ningun plan V2 ni snapshot
--     de dia (asi el snapshot del dia lo deriva esta misma publicacion);
--   * solo escribe filas del dominio V2 de ese alumno;
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- COMO CORRERLO: con una conexion SQL PRIVILEGIADA (la misma con la que se aplican las
-- migraciones — la RPC es SECURITY DEFINER y el smoke hace `reset role` para preparar el
-- fixture). En LIVE: pegar el archivo completo en `execute_sql` / psql. NUNCA reemplazar el
-- ROLLBACK final por COMMIT, y nunca correrlo por partes (el fixture vive en la transaccion).
--
-- NOTA de owner: el smoke asume que las funciones se aplicaron con el owner habitual de las
-- migraciones (postgres), que es el rol que los guards de identidad exceptuan.

begin;

create temporary table nut_hh_ctx (
  coach_id uuid not null,
  client_id uuid not null,
  local_date date not null,
  timezone text not null,
  root_id uuid,
  version_1 uuid,
  item_ok uuid,
  entry_id uuid
) on commit drop;

-- El smoke corre los escenarios con `set local role authenticated`: sin este grant, la tabla
-- temporal (owner = rol de la sesion) queda inaccesible al cambiar de rol.
grant select, insert, update on nut_hh_ctx to authenticated;

insert into nut_hh_ctx (coach_id, client_id, local_date, timezone)
select
  c.coach_id,
  c.id,
  (now() at time zone 'America/Santiago')::date,
  'America/Santiago'
from public.clients c
where c.org_id is null
  and c.team_id is null
  and c.coach_id is not null
  and c.is_archived = false
  and not exists (select 1 from public.nutrition_plans_v2 p where p.client_id = c.id)
  -- Sin snapshot previo: el del dia lo deriva esta publicacion y refleja la version nueva.
  and not exists (select 1 from public.nutrition_day_snapshots_v2 s where s.client_id = c.id)
limit 1;

do $$
begin
  if not exists (select 1 from nut_hh_ctx) then
    raise exception 'nutrition_v2_household_smoke_requires_standalone_client_without_plan';
  end if;
end;
$$;

update nut_hh_ctx set item_ok = gen_random_uuid();

-- Draft canonico: 1 variante -> 1 franja -> 1 item. El item viaja YA TRADUCIDO a gramos
-- (asi lo emite `buildItemInsertRow`, apps/web/.../_lib/plan-draft-rows.ts): la unidad
-- «casera» del editor nunca llega aca. Los parametros permiten forzar los tres rechazos.
create or replace function pg_temp.hh_draft(
  p_item_id uuid,
  p_quantity numeric default 122,
  p_unit text default 'g',
  p_household_label text default 'huevo',
  p_household_grams numeric default 61
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'clientId', ctx.client_id,
    'name', 'Smoke medida casera W2',
    'strategy', 'structured',
    'timezone', ctx.timezone,
    'permissions', jsonb_build_object('canRegisterFreely', true, 'canSubstitute', false),
    'visibleNotes', null,
    'protocolNotes', null,
    'variants', jsonb_build_array(jsonb_build_object(
      'variant_key', 'default',
      'label', 'Todos los dias',
      'day_of_week', null,
      'is_default', true,
      'target_calories', 2000,
      'target_protein_g', null,
      'target_carbs_g', null,
      'target_fats_g', null,
      'target_fiber_g', null,
      'target_sodium_mg', null,
      'target_water_ml', null,
      'order_index', 0,
      'mealSlots', jsonb_build_array(jsonb_build_object(
        'slot_code', 'slot-1',
        'name', 'Desayuno',
        'start_time', '08:00',
        'end_time', null,
        'slot_mode', 'anchor',
        'is_required', false,
        'target_calories', null,
        'target_protein_g', null,
        'target_carbs_g', null,
        'target_fats_g', null,
        'instructions', null,
        'order_index', 0,
        'items', jsonb_build_array(jsonb_build_object(
          'id', p_item_id,
          'food_id', null,
          'recipe_id', null,
          'custom_name', 'Huevo',
          'quantity', p_quantity,
          'unit', p_unit,
          -- [W2] el par casero congelado que agrega esta migracion.
          'household_label', p_household_label,
          'household_grams', p_household_grams,
          'minimum_quantity', null,
          'maximum_quantity', null,
          'is_optional', false,
          'substitution_group_id', null,
          'notes', null,
          'order_index', 0,
          'snapshot_name', 'Huevo',
          'snapshot_brand', null,
          'snapshot_calories', 189,
          'snapshot_protein_g', 16,
          'snapshot_carbs_g', 1,
          'snapshot_fats_g', 13,
          'snapshot_fiber_g', 0,
          'substitutions', '[]'::jsonb
        )),
        'exchangeTargets', '[]'::jsonb
      ))
    ))
  )
  from nut_hh_ctx ctx;
$$;

select set_config('request.jwt.claim.sub', (select coach_id::text from nut_hh_ctx), true);
set local role authenticated;

-- ============================================================================
-- A — publicar «2 huevos (122 g)»: la fila queda en gramos con el par congelado,
--     y los dos read models del plan lo emiten.
-- ============================================================================
do $$
declare
  ctx nut_hh_ctx%rowtype;
  v_res jsonb;
  v_today jsonb;
  v_plan jsonb;
  v_item jsonb;
begin
  select * into ctx from nut_hh_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.hh_draft(ctx.item_ok), ctx.local_date, 'smoke-w2-household-a'
  );
  update nut_hh_ctx
  set root_id = (v_res ->> 'planId')::uuid,
      version_1 = (v_res ->> 'versionId')::uuid;

  -- (A.1) La FILA: gramos honestos + par congelado.
  if not exists (
    select 1
    from public.nutrition_prescription_items_v2 pi
    where pi.id = ctx.item_ok
      and pi.quantity = 122
      and pi.unit = 'g'
      and pi.household_label = 'huevo'
      and pi.household_grams = 61
  ) then
    raise exception 'SMOKE FALLO (A.1): el item no quedo en 122 g con el par huevo/61';
  end if;

  -- (A.2) get_nutrition_today_v2: el par viaja dentro del snapshot congelado del dia
  --       (private.nutrition_v2_build_prescription_snapshot, a5).
  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);
  v_item := v_today -> 'mealSlots' -> 0 -> 'prescriptionItems' -> 0;
  if v_item is null or v_item ->> 'id' is distinct from ctx.item_ok::text then
    raise exception 'SMOKE FALLO (A.2): el Today no trajo el item publicado (snapshot del dia sin la version nueva)';
  end if;
  if v_item ->> 'householdLabel' is distinct from 'huevo'
     or (v_item ->> 'householdGrams')::numeric is distinct from 61 then
    raise exception 'SMOKE FALLO (A.2): get_nutrition_today_v2 no emitio householdLabel/householdGrams (%)', v_item;
  end if;
  if (v_item ->> 'quantity')::numeric is distinct from 122 or v_item ->> 'unit' is distinct from 'g' then
    raise exception 'SMOKE FALLO (A.2): el Today cambio la cantidad/unidad prescrita';
  end if;

  -- (A.3) get_nutrition_plan_read_v2 (a6).
  v_plan := public.get_nutrition_plan_read_v2(ctx.client_id, ctx.local_date, ctx.timezone);
  v_item := v_plan -> 'dayVariants' -> 0 -> 'mealSlots' -> 0 -> 'prescriptionItems' -> 0;
  if v_item ->> 'householdLabel' is distinct from 'huevo'
     or (v_item ->> 'householdGrams')::numeric is distinct from 61 then
    raise exception 'SMOKE FALLO (A.3): get_nutrition_plan_read_v2 no emitio el par casero (%)', v_item;
  end if;
end;
$$;

-- ============================================================================
-- B — «Lo comi» sobre ese item: el registro hereda el rotulo en LECTURA
--     (private.nutrition_v2_intake_item_json resuelve por prescription_item_id).
-- ============================================================================
do $$
declare
  ctx nut_hh_ctx%rowtype;
  v_entry uuid;
  v_today jsonb;
  v_intake jsonb;
begin
  select * into ctx from nut_hh_ctx;

  -- Snapshot POR UNIDAD con servingSize = 1 y base per_serving: la unica forma correcta de
  -- mandar un «Lo comi» prescrito (prescribedSnapshotMacros, packages/nutrition-v2/
  -- intake-normalize.ts:60-72). El par casero NO viaja en el payload: es del item.
  v_entry := public.record_nutrition_intake_v2(
    p_client_id => ctx.client_id,
    p_local_date => ctx.local_date,
    p_occurred_at => now(),
    p_timezone => ctx.timezone,
    p_food_id => null::uuid,
    p_custom_name => 'Huevo',
    p_quantity => 122,
    p_unit => 'g',
    p_meal_slot => 'slot-1',
    p_source => 'prescription',
    p_capture_method => 'prescription',
    p_plan_version_id => ctx.version_1,
    p_prescription_item_id => ctx.item_ok,
    p_idempotency_key => 'smoke-w2-household-intake-b',
    p_note => null::text,
    p_snapshot => jsonb_build_object(
      'name', 'Huevo',
      'calories', 189::numeric / 122,
      'proteinG', 16::numeric / 122,
      'carbsG', 1::numeric / 122,
      'fatsG', 13::numeric / 122,
      'fiberG', 0,
      'servingSize', 1,
      'servingUnit', 'g',
      'macrosBasis', 'per_serving'
    ),
    p_snapshot_macros_basis => 'per_serving'
  );
  update nut_hh_ctx set entry_id = v_entry;

  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);
  v_intake := v_today -> 'mealSlots' -> 0 -> 'intakeItems' -> 0;
  if v_intake is null or v_intake ->> 'id' is distinct from v_entry::text then
    raise exception 'SMOKE FALLO (B): el registro no quedo colgado de la franja slot-1';
  end if;
  if v_intake ->> 'householdLabel' is distinct from 'huevo'
     or (v_intake ->> 'householdGrams')::numeric is distinct from 61 then
    raise exception 'SMOKE FALLO (B): intakeItems no resolvio el par casero del item prescrito (%)', v_intake;
  end if;
  -- El registro LIBRE (sin prescription_item_id) no tiene de donde resolverlo y queda con el
  -- par en null: limitacion declarada en SPEC §5.3 / auditoria §2. Aca solo se verifica que
  -- el `totals` NO se movio (a7 no toca el bloque de macros): 189 kcal reconstruidas.
  if (v_intake -> 'totals' ->> 'calories')::numeric is distinct from 189.0 then
    raise exception 'SMOKE FALLO (B): a7 movio los totals del registro (%)', v_intake -> 'totals';
  end if;
end;
$$;

-- ============================================================================
-- C — unit = 'casera' NO se persiste (el cierre real de la arquitectura W2)
-- ============================================================================
do $$
declare
  ctx nut_hh_ctx%rowtype;
  v_versions integer;
begin
  select * into ctx from nut_hh_ctx;
  select count(*) into v_versions
  from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_id;

  begin
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.hh_draft(gen_random_uuid(), 2, 'casera', 'huevo', 61),
      ctx.local_date, 'smoke-w2-household-c', null, ctx.root_id
    );
    raise exception 'SMOKE FALLO (C): se publico un item con unit = casera';
  exception
    when sqlstate '23514' then
      if position('unit_not_casera' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO (C): 23514 de OTRO constraint (%)', sqlerrm;
      end if;
  end;

  if (select count(*) from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_id) <> v_versions then
    raise exception 'SMOKE FALLO (C): el rechazo dejo una version escrita';
  end if;
end;
$$;

-- ============================================================================
-- D — household_grams fuera del rango [1, 1000]
-- ============================================================================
do $$
declare
  ctx nut_hh_ctx%rowtype;
begin
  select * into ctx from nut_hh_ctx;

  begin
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.hh_draft(gen_random_uuid(), 5000, 'g', 'huevo', 5000),
      ctx.local_date, 'smoke-w2-household-d', null, ctx.root_id
    );
    raise exception 'SMOKE FALLO (D): se publico un item con household_grams = 5000';
  exception
    when sqlstate '23514' then
      if position('household_grams_range' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO (D): 23514 de OTRO constraint (%)', sqlerrm;
      end if;
  end;
end;
$$;

-- ============================================================================
-- E — par roto: etiqueta sin gramos (viajan JUNTOS o no viajan)
-- ============================================================================
do $$
declare
  ctx nut_hh_ctx%rowtype;
begin
  select * into ctx from nut_hh_ctx;

  begin
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.hh_draft(gen_random_uuid(), 122, 'g', 'huevo', null::numeric),
      ctx.local_date, 'smoke-w2-household-e', null, ctx.root_id
    );
    raise exception 'SMOKE FALLO (E): se publico un item con etiqueta casera SIN gramos';
  exception
    when sqlstate '23514' then
      if position('household_pair' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO (E): 23514 de OTRO constraint (%)', sqlerrm;
      end if;
  end;

  -- Simetrico: gramos sin etiqueta tambien rompe el par.
  begin
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.hh_draft(gen_random_uuid(), 122, 'g', null::text, 61),
      ctx.local_date, 'smoke-w2-household-e2', null, ctx.root_id
    );
    raise exception 'SMOKE FALLO (E2): se publico un item con gramos caseros SIN etiqueta';
  exception
    when sqlstate '23514' then
      if position('household_pair' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO (E2): 23514 de OTRO constraint (%)', sqlerrm;
      end if;
  end;

  -- Y el camino de siempre (sin medida casera) sigue publicando igual que antes de W2.
  perform public.persist_and_publish_nutrition_plan_v2(
    pg_temp.hh_draft(gen_random_uuid(), 200, 'g', null::text, null::numeric),
    ctx.local_date, 'smoke-w2-household-e3', null, ctx.root_id
  );
end;
$$;

reset role;

rollback;
