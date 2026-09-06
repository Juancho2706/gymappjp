-- Nutricion V2 — W3.1 «Cantidades honestas»: smoke del LINAJE de items prescritos.
--
-- Cubre los invariantes que introduce
-- `supabase/migrations/20260906210308_nutrition_v2_item_lineage.sql`
-- (SPEC docs/specs/nutrition-cantidades-honestas/SPEC.md §1 Causa 2 y §6.1):
--   A. publicar v1 con dos items (A y C) ⇒ `get_nutrition_today_v2` los trae;
--   B. «Lo comi» sobre A y sobre C ⇒ los dos registros cuelgan de la franja;
--   C. republicar el MISMO dia (v2, mismo plan) con A' (`source_item_id = A`, misma franja/
--      cantidad/unidad) y B' (id nuevo, sin linaje, cantidad distinta) ⇒ la fila A' guarda el
--      linaje; el Today trae A' y B'; el registro de A sale con `prescriptionItemId = A'` y
--      `originalPrescriptionItemId = A`;
--   D. el registro de C —cuyo item NO tiene sucesor en v2— sigue con `prescriptionItemId = C`
--      y `originalPrescriptionItemId` null: huerfano VISIBLE a proposito (W1.4 lo pinta y lo
--      deja retirar);
--   E. `source_item_id` que apunta a un item de OTRO plan, o a un uuid que no existe ⇒ la fila
--      queda con `source_item_id` NULL y la publicacion NO falla (el linaje es una ayuda de
--      lectura, no un requisito);
--   F. cadena de dos saltos: v4 con A'' (`source_item_id = A'`) ⇒ el registro original (hecho
--      sobre A) resuelve hasta A''.
--
-- Y el no-negociable de fondo (SPEC §2 y §8): CERO `update` sobre nutrition_intake_entries —
-- el smoke verifica que `prescription_item_id` en la TABLA sigue siendo el original en todos
-- los casos; lo unico que cambia es el JSON del read model.
--
-- Seguro por construccion:
--   * toma un coach standalone con un alumno que HOY no tiene ningun plan V2 ni snapshot de
--     dia (asi el snapshot del dia lo derivan estas mismas publicaciones);
--   * el «item de otro plan» del caso E se ELIGE de solo lectura (no se crea nada de otro
--     alumno); si la base no tiene ninguno, cae a un uuid random y el caso sigue siendo valido;
--   * solo escribe filas del dominio V2 de ese alumno;
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- COMO CORRERLO: con una conexion SQL PRIVILEGIADA (la misma con la que se aplican las
-- migraciones — las RPC son SECURITY DEFINER y el smoke hace `reset role` para preparar el
-- fixture). En LIVE: dentro de la MISMA transaccion, aplicar ANTES
-- `20260906202957_nutrition_v2_household_units.sql` y `20260906210308_nutrition_v2_item_lineage.sql`
-- (ninguna de las dos esta aplicada todavia), y recien despues pegar este archivo. NUNCA
-- reemplazar el ROLLBACK final por COMMIT, y nunca correrlo por partes (el fixture vive en la
-- transaccion).
--
-- NOTA de owner: el smoke asume que las funciones se aplicaron con el owner habitual de las
-- migraciones (postgres), que es el rol que los guards de identidad exceptuan.

begin;

create temporary table nut_lin_ctx (
  coach_id uuid not null,
  client_id uuid not null,
  local_date date not null,
  timezone text not null,
  -- Item de un plan de OTRO alumno (caso E). Puede quedar null si la base esta vacia.
  foreign_item_id uuid,
  root_id uuid,
  version_1 uuid,
  item_a uuid,
  item_c uuid,
  item_a2 uuid,
  item_b2 uuid,
  item_x uuid,
  item_y uuid,
  item_a3 uuid,
  entry_a uuid,
  entry_c uuid
) on commit drop;

-- El smoke corre los escenarios con `set local role authenticated`: sin este grant, la tabla
-- temporal (owner = rol de la sesion) queda inaccesible al cambiar de rol.
grant select, insert, update on nut_lin_ctx to authenticated;

insert into nut_lin_ctx (coach_id, client_id, local_date, timezone)
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
  -- Sin snapshot previo: el del dia lo derivan estas publicaciones y refleja la version nueva.
  and not exists (select 1 from public.nutrition_day_snapshots_v2 s where s.client_id = c.id)
limit 1;

do $$
begin
  if not exists (select 1 from nut_lin_ctx) then
    raise exception 'nutrition_v2_lineage_smoke_requires_standalone_client_without_plan';
  end if;
end;
$$;

-- Item real de un plan AJENO (el alumno del fixture no tiene ninguno, asi que cualquier item
-- existente sirve). Solo LECTURA: el caso E necesita un id que exista pero no pertenezca al
-- plan que se esta publicando. Si la base no tiene items V2, queda null y el caso E usa dos
-- uuids inexistentes (sigue probando la rama «no valida => NULL»).
update nut_lin_ctx ctx
set foreign_item_id = (
  select pi.id
  from public.nutrition_prescription_items_v2 pi
  join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
  join public.nutrition_plans_v2 p on p.id = v.plan_id
  where p.client_id <> ctx.client_id
  limit 1
);

update nut_lin_ctx
set item_a = gen_random_uuid(),
    item_c = gen_random_uuid(),
    item_a2 = gen_random_uuid(),
    item_b2 = gen_random_uuid(),
    item_x = gen_random_uuid(),
    item_y = gen_random_uuid(),
    item_a3 = gen_random_uuid(),
    foreign_item_id = coalesce(foreign_item_id, gen_random_uuid());

-- Item del borrador tal como lo emite `buildItemInsertRow` (plan-draft-rows.ts): cantidad ya
-- traducida a g/ml y, desde W3.1, `source_item_id` cuando el editor detecto que el item no
-- cambio (misma franja, mismo alimento/nombre, misma cantidad y unidad).
create or replace function pg_temp.lin_item(
  p_id uuid,
  p_name text,
  p_quantity numeric,
  p_source uuid default null,
  p_order integer default 0
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p_id,
    'food_id', null,
    'recipe_id', null,
    'custom_name', p_name,
    'quantity', p_quantity,
    'unit', 'g',
    'household_label', null,
    'household_grams', null,
    -- [W3.1] linaje declarado por el borrador; la RPC lo valida contra la base.
    'source_item_id', p_source,
    'minimum_quantity', null,
    'maximum_quantity', null,
    'is_optional', false,
    'substitution_group_id', null,
    'notes', null,
    'order_index', p_order,
    'snapshot_name', p_name,
    'snapshot_brand', null,
    'snapshot_calories', 100,
    'snapshot_protein_g', 10,
    'snapshot_carbs_g', 5,
    'snapshot_fats_g', 3,
    'snapshot_fiber_g', 0,
    'substitutions', '[]'::jsonb
  );
$$;

-- Draft canonico: 1 variante -> 1 franja ('slot-1') -> los items que se le pasen.
create or replace function pg_temp.lin_draft(p_items jsonb)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'clientId', ctx.client_id,
    'name', 'Smoke linaje W3.1',
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
        'items', p_items,
        'exchangeTargets', '[]'::jsonb
      ))
    ))
  )
  from nut_lin_ctx ctx;
$$;

-- Busca un registro por id dentro de los intakeItems de la primera franja del Today.
create or replace function pg_temp.lin_intake(p_today jsonb, p_entry_id uuid)
returns jsonb
language sql
immutable
as $$
  select ii.value
  from jsonb_array_elements(
    coalesce(p_today -> 'mealSlots' -> 0 -> 'intakeItems', '[]'::jsonb)
  ) ii
  where ii.value ->> 'id' = p_entry_id::text
  limit 1;
$$;

-- ¿La primera franja del Today trae el item prescrito p_item_id?
create or replace function pg_temp.lin_has_item(p_today jsonb, p_item_id uuid)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      coalesce(p_today -> 'mealSlots' -> 0 -> 'prescriptionItems', '[]'::jsonb)
    ) pi
    where pi.value ->> 'id' = p_item_id::text
  );
$$;

select set_config('request.jwt.claim.sub', (select coach_id::text from nut_lin_ctx), true);
set local role authenticated;

-- ============================================================================
-- A — v1 con dos items (A y C): el Today los trae y ninguno tiene linaje.
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_res jsonb;
  v_today jsonb;
begin
  select * into ctx from nut_lin_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.lin_draft(jsonb_build_array(
      pg_temp.lin_item(ctx.item_a, 'Huevo', 100, null::uuid, 0),
      pg_temp.lin_item(ctx.item_c, 'Palta', 50, null::uuid, 1)
    )),
    ctx.local_date,
    'smoke-w31-lineage-v1'
  );
  update nut_lin_ctx
  set root_id = (v_res ->> 'planId')::uuid,
      version_1 = (v_res ->> 'versionId')::uuid;

  if exists (
    select 1 from public.nutrition_prescription_items_v2 pi
    where pi.id in (ctx.item_a, ctx.item_c) and pi.source_item_id is not null
  ) then
    raise exception 'SMOKE FALLO (A.1): v1 no deberia tener linaje en ningun item';
  end if;

  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);
  if not pg_temp.lin_has_item(v_today, ctx.item_a) or not pg_temp.lin_has_item(v_today, ctx.item_c) then
    raise exception 'SMOKE FALLO (A.2): el Today no trajo los dos items de v1 (%)',
      v_today -> 'mealSlots' -> 0 -> 'prescriptionItems';
  end if;
end;
$$;

-- ============================================================================
-- B — «Lo comi» sobre A y sobre C (los dos con su prescription_item_id de v1).
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_entry_a uuid;
  v_entry_c uuid;
  v_today jsonb;
  v_intake jsonb;
begin
  select * into ctx from nut_lin_ctx;

  -- Snapshot POR UNIDAD con servingSize = 1 y base per_serving: la unica forma correcta de
  -- mandar un «Lo comi» prescrito (prescribedSnapshotMacros, packages/nutrition-v2/
  -- intake-normalize.ts:60-72).
  v_entry_a := public.record_nutrition_intake_v2(
    p_client_id => ctx.client_id,
    p_local_date => ctx.local_date,
    p_occurred_at => now(),
    p_timezone => ctx.timezone,
    p_food_id => null::uuid,
    p_custom_name => 'Huevo',
    p_quantity => 100,
    p_unit => 'g',
    p_meal_slot => 'slot-1',
    p_source => 'prescription',
    p_capture_method => 'prescription',
    p_plan_version_id => ctx.version_1,
    p_prescription_item_id => ctx.item_a,
    p_idempotency_key => 'smoke-w31-lineage-intake-a',
    p_note => null::text,
    p_snapshot => jsonb_build_object(
      'name', 'Huevo',
      'calories', 1,
      'proteinG', 0.1,
      'carbsG', 0.05,
      'fatsG', 0.03,
      'fiberG', 0,
      'servingSize', 1,
      'servingUnit', 'g',
      'macrosBasis', 'per_serving'
    ),
    p_snapshot_macros_basis => 'per_serving'
  );

  v_entry_c := public.record_nutrition_intake_v2(
    p_client_id => ctx.client_id,
    p_local_date => ctx.local_date,
    p_occurred_at => now(),
    p_timezone => ctx.timezone,
    p_food_id => null::uuid,
    p_custom_name => 'Palta',
    p_quantity => 50,
    p_unit => 'g',
    p_meal_slot => 'slot-1',
    p_source => 'prescription',
    p_capture_method => 'prescription',
    p_plan_version_id => ctx.version_1,
    p_prescription_item_id => ctx.item_c,
    p_idempotency_key => 'smoke-w31-lineage-intake-c',
    p_note => null::text,
    p_snapshot => jsonb_build_object(
      'name', 'Palta',
      'calories', 2,
      'proteinG', 0.2,
      'carbsG', 0.1,
      'fatsG', 0.06,
      'fiberG', 0,
      'servingSize', 1,
      'servingUnit', 'g',
      'macrosBasis', 'per_serving'
    ),
    p_snapshot_macros_basis => 'per_serving'
  );

  update nut_lin_ctx set entry_a = v_entry_a, entry_c = v_entry_c;

  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);

  -- Antes de republicar el alias esta vacio: cada registro apunta a su propio item y
  -- `originalPrescriptionItemId` viaja en null (clave SIEMPRE presente, como householdLabel).
  v_intake := pg_temp.lin_intake(v_today, v_entry_a);
  if v_intake is null then
    raise exception 'SMOKE FALLO (B.1): el registro de A no quedo colgado de slot-1';
  end if;
  if v_intake ->> 'prescriptionItemId' is distinct from ctx.item_a::text then
    raise exception 'SMOKE FALLO (B.1): sin republicar, prescriptionItemId deberia ser A (%)', v_intake;
  end if;
  -- `is distinct from` y no `<>`: la clave tiene que estar PRESENTE y valer JSON null
  -- (si faltara, `->` devolveria SQL NULL y un `<>` se evaluaria a NULL, tapando el fallo).
  if v_intake -> 'originalPrescriptionItemId' is distinct from 'null'::jsonb then
    raise exception 'SMOKE FALLO (B.1): sin alias, originalPrescriptionItemId deberia ser null (%)', v_intake;
  end if;

  v_intake := pg_temp.lin_intake(v_today, v_entry_c);
  if v_intake is null or v_intake ->> 'prescriptionItemId' is distinct from ctx.item_c::text then
    raise exception 'SMOKE FALLO (B.2): el registro de C no quedo apuntando a C (%)', v_intake;
  end if;
end;
$$;

-- ============================================================================
-- C + D — republicar el MISMO dia: A' hereda a A (linaje) y B' es nuevo; el registro
--         de A resuelve a A' y el de C queda huerfano visible.
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_res jsonb;
  v_today jsonb;
  v_intake jsonb;
begin
  select * into ctx from nut_lin_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.lin_draft(jsonb_build_array(
      -- A': mismo alimento, misma franja, misma cantidad y unidad => el editor conserva el linaje.
      pg_temp.lin_item(ctx.item_a2, 'Huevo', 100, ctx.item_a, 0),
      -- B': item NUEVO (cantidad distinta) => sin linaje, como cualquier alta.
      pg_temp.lin_item(ctx.item_b2, 'Pan', 80, null::uuid, 1)
    )),
    ctx.local_date,
    'smoke-w31-lineage-v2',
    null,
    ctx.root_id
  );
  if v_res ->> 'planId' is distinct from ctx.root_id::text then
    raise exception 'SMOKE FALLO (C.0): la republicacion creo otra raiz (%)', v_res;
  end if;

  -- (C.1) La FILA: A' guarda el linaje, B' no.
  if not exists (
    select 1 from public.nutrition_prescription_items_v2 pi
    where pi.id = ctx.item_a2 and pi.source_item_id = ctx.item_a
  ) then
    raise exception 'SMOKE FALLO (C.1): A'' no guardo source_item_id = A';
  end if;
  if exists (
    select 1 from public.nutrition_prescription_items_v2 pi
    where pi.id = ctx.item_b2 and pi.source_item_id is not null
  ) then
    raise exception 'SMOKE FALLO (C.1): B'' no deberia tener linaje';
  end if;

  -- (C.2) El Today ya es el de v2: trae A' y B', y NO trae A ni C.
  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);
  if not pg_temp.lin_has_item(v_today, ctx.item_a2) or not pg_temp.lin_has_item(v_today, ctx.item_b2) then
    raise exception 'SMOKE FALLO (C.2): el Today no trajo A'' y B'' (%)',
      v_today -> 'mealSlots' -> 0 -> 'prescriptionItems';
  end if;
  if pg_temp.lin_has_item(v_today, ctx.item_a) or pg_temp.lin_has_item(v_today, ctx.item_c) then
    raise exception 'SMOKE FALLO (C.2): el Today sigue trayendo items de v1';
  end if;

  -- (C.3) El registro hecho sobre A resuelve al item VIGENTE A'.
  v_intake := pg_temp.lin_intake(v_today, ctx.entry_a);
  if v_intake is null then
    raise exception 'SMOKE FALLO (C.3): el registro de A desaparecio de la franja';
  end if;
  if v_intake ->> 'prescriptionItemId' is distinct from ctx.item_a2::text then
    raise exception 'SMOKE FALLO (C.3): prescriptionItemId deberia resolver a A'' (%)', v_intake;
  end if;
  if v_intake ->> 'originalPrescriptionItemId' is distinct from ctx.item_a::text then
    raise exception 'SMOKE FALLO (C.3): originalPrescriptionItemId deberia ser A (%)', v_intake;
  end if;

  -- (D) El registro de C no tiene sucesor: sigue huerfano y VISIBLE, sin alias.
  v_intake := pg_temp.lin_intake(v_today, ctx.entry_c);
  if v_intake is null then
    raise exception 'SMOKE FALLO (D): el registro huerfano de C desaparecio de la franja';
  end if;
  if v_intake ->> 'prescriptionItemId' is distinct from ctx.item_c::text then
    raise exception 'SMOKE FALLO (D): el huerfano deberia conservar prescriptionItemId = C (%)', v_intake;
  end if;
  if v_intake -> 'originalPrescriptionItemId' is distinct from 'null'::jsonb then
    raise exception 'SMOKE FALLO (D): el huerfano no deberia traer originalPrescriptionItemId (%)', v_intake;
  end if;

  -- (C.4) NO-NEGOCIABLE: la tabla de eventos no se toco. Los dos registros siguen con su
  --       prescription_item_id ORIGINAL; el alias vive solo en el JSON de lectura.
  if not exists (
    select 1 from public.nutrition_intake_entries e
    where e.id = ctx.entry_a and e.prescription_item_id = ctx.item_a
  ) then
    raise exception 'SMOKE FALLO (C.4): se reescribio prescription_item_id del registro de A';
  end if;
  if not exists (
    select 1 from public.nutrition_intake_entries e
    where e.id = ctx.entry_c and e.prescription_item_id = ctx.item_c
  ) then
    raise exception 'SMOKE FALLO (C.4): se reescribio prescription_item_id del registro de C';
  end if;
end;
$$;

-- ============================================================================
-- E — linaje INVALIDO: item de otro plan y uuid inexistente ⇒ NULL, sin fallar.
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_res jsonb;
begin
  select * into ctx from nut_lin_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.lin_draft(jsonb_build_array(
      -- X: apunta a un item REAL pero de un plan de OTRO alumno.
      pg_temp.lin_item(ctx.item_x, 'Arroz', 120, ctx.foreign_item_id, 0),
      -- Y: apunta a un uuid que no existe en ninguna parte.
      pg_temp.lin_item(ctx.item_y, 'Pollo', 150, gen_random_uuid(), 1)
    )),
    ctx.local_date,
    'smoke-w31-lineage-v3',
    null,
    ctx.root_id
  );

  if v_res ->> 'versionId' is null then
    raise exception 'SMOKE FALLO (E.0): la publicacion con linaje invalido no devolvio version';
  end if;

  if exists (
    select 1 from public.nutrition_prescription_items_v2 pi
    where pi.id in (ctx.item_x, ctx.item_y) and pi.source_item_id is not null
  ) then
    raise exception 'SMOKE FALLO (E.1): un source_item_id invalido quedo persistido';
  end if;

  -- Y las dos filas existen: el linaje invalido se descarta, NO tumba la publicacion.
  if (select count(*) from public.nutrition_prescription_items_v2 pi
      where pi.id in (ctx.item_x, ctx.item_y)) <> 2 then
    raise exception 'SMOKE FALLO (E.2): la publicacion perdio items al descartar el linaje';
  end if;
end;
$$;

-- ============================================================================
-- F — cadena de dos saltos: A'' hereda de A', que heredaba de A.
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_today jsonb;
  v_intake jsonb;
begin
  select * into ctx from nut_lin_ctx;

  perform public.persist_and_publish_nutrition_plan_v2(
    pg_temp.lin_draft(jsonb_build_array(
      pg_temp.lin_item(ctx.item_a3, 'Huevo', 100, ctx.item_a2, 0)
    )),
    ctx.local_date,
    'smoke-w31-lineage-v4',
    null,
    ctx.root_id
  );

  if not exists (
    select 1 from public.nutrition_prescription_items_v2 pi
    where pi.id = ctx.item_a3 and pi.source_item_id = ctx.item_a2
  ) then
    raise exception 'SMOKE FALLO (F.1): A'''' no guardo source_item_id = A''';
  end if;

  v_today := public.get_nutrition_today_v2(ctx.client_id, ctx.local_date, ctx.timezone);

  -- El registro original (hecho sobre A, dos republicaciones atras) sube la cadena completa.
  v_intake := pg_temp.lin_intake(v_today, ctx.entry_a);
  if v_intake is null then
    raise exception 'SMOKE FALLO (F.2): el registro original desaparecio de la franja';
  end if;
  if v_intake ->> 'prescriptionItemId' is distinct from ctx.item_a3::text then
    raise exception 'SMOKE FALLO (F.2): la cadena de 2 saltos no resolvio hasta A'''' (%)', v_intake;
  end if;
  if v_intake ->> 'originalPrescriptionItemId' is distinct from ctx.item_a::text then
    raise exception 'SMOKE FALLO (F.2): originalPrescriptionItemId deberia seguir siendo A (%)', v_intake;
  end if;

  -- Y el registro de C sigue sin alias despues de tres republicaciones.
  v_intake := pg_temp.lin_intake(v_today, ctx.entry_c);
  if v_intake is null or v_intake ->> 'prescriptionItemId' is distinct from ctx.item_c::text then
    raise exception 'SMOKE FALLO (F.4): el huerfano de C cambio de id (%)', v_intake;
  end if;
end;
$$;

reset role;

-- ============================================================================
-- G — el mapa de alias, mirado de frente. Va DESPUES del `reset role` porque
--     private.nutrition_v2_item_alias_map esta revocada a `authenticated`: en produccion
--     solo la llama get_nutrition_today_v2, que es security definer.
-- ============================================================================
do $$
declare
  ctx nut_lin_ctx%rowtype;
  v_version uuid;
  v_rows integer;
begin
  select * into ctx from nut_lin_ctx;

  select s.version_id into v_version
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = ctx.client_id
    and s.local_date = ctx.local_date;
  if v_version is null then
    raise exception 'SMOKE FALLO (G.0): el snapshot del dia quedo sin version';
  end if;

  -- Los DOS ancestros de la cadena (A y A') resuelven al item vigente A''.
  if not exists (
    select 1 from private.nutrition_v2_item_alias_map(v_version) m
    where m.ancestor_id = ctx.item_a and m.current_id = ctx.item_a3
  ) then
    raise exception 'SMOKE FALLO (G.1): el mapa no resolvio A -> A''''';
  end if;
  if not exists (
    select 1 from private.nutrition_v2_item_alias_map(v_version) m
    where m.ancestor_id = ctx.item_a2 and m.current_id = ctx.item_a3
  ) then
    raise exception 'SMOKE FALLO (G.2): el mapa no resolvio A'' -> A''''';
  end if;

  -- Y nada mas: C, B', X e Y nunca fueron ancestros de nadie => exactamente 2 filas,
  -- una por ancestro (el `row_number` deja una sola fila por clave).
  select count(*) into v_rows from private.nutrition_v2_item_alias_map(v_version);
  if v_rows <> 2 then
    raise exception 'SMOKE FALLO (G.3): el mapa devolvio % filas, se esperaban 2', v_rows;
  end if;

  -- Una version SIN linaje devuelve el mapa vacio (el 100 % de los planes de hoy).
  if exists (select 1 from private.nutrition_v2_item_alias_map(ctx.version_1)) then
    raise exception 'SMOKE FALLO (G.4): v1 no tiene linaje y el mapa no vino vacio';
  end if;
end;
$$;

rollback;
