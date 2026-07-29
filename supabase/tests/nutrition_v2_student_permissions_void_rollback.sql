-- Nutricion V2 — smoke de permisos del alumno (NUT-009) y retiro terminal (NUT-010).
--
-- Cubre los invariantes NUEVOS de las migraciones 20260728130000 y 20260728130500:
--   NUT-009  el merge de defaults NO rompe planes legados ({} => permisivo)
--   NUT-009  canRegisterFreely=false bloquea el registro LIBRE con errcode 42501
--   NUT-009  canRegisterFreely=false NO bloquea "Lo comi" (item prescrito)
--   NUT-009  canAdjustPrescribedQuantity=false bloquea la correccion de cantidad prescrita
--   NUT-009  quantityAdjustmentPercent acota la desviacion (dentro pasa, fuera 42501)
--   NUT-009  canMoveMealSlot=false bloquea mover un item del plan a otra franja
--   NUT-010  void_ deja la entry 'voided' SIN insertar nada
--   NUT-010  tras el retiro: consumido.entryCount = 0 y la cobertura DERIVADA vuelve a 0
--   NUT-010  doble retiro es idempotente (mismo id, sin excepcion)
--
-- Seguro por construccion:
--   * toma un coach/alumno standalone existente y un alimento del catalogo YA clasificado;
--   * crea solo registros V2 con identificadores generados;
--   * usa current_date (NUT-016 acota el snapshot a [hoy-400, hoy+1]);
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- Correr con una conexion SQL privilegiada. NUNCA reemplazar el ROLLBACK final por COMMIT.

begin;

create temporary table nut_perms_ctx (
  client_id uuid not null,
  coach_id uuid not null,
  plan_id uuid not null,
  version_id uuid not null,
  variant_id uuid not null,
  slot_id uuid not null,
  slot_b_id uuid not null,
  item_id uuid not null,
  food_id uuid not null,
  group_id uuid not null,
  portion_grams numeric not null,
  test_date date not null
) on commit drop;

insert into nut_perms_ctx
select
  c.id,
  c.coach_id,
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  f.id,
  f.exchange_group_id,
  f.exchange_portion_grams,
  current_date
from public.clients c
cross join lateral (
  select f.id, f.exchange_group_id, f.exchange_portion_grams
  from public.foods f
  where f.exchange_group_id is not null
    and coalesce(f.exchange_portion_grams, 0) > 0
  order by f.id
  limit 1
) f
where c.org_id is null
  and c.team_id is null
  and c.coach_id is not null
  and c.is_archived = false
  and c.is_active is not false
limit 1;

do $$
begin
  if not exists (select 1 from nut_perms_ctx) then
    raise exception 'nutrition_v2_perms_smoke_requires_standalone_client_and_classified_food';
  end if;
end;
$$;

-- ── Arbol minimo: plan activo + version PUBLICADA vigente hoy ────────────────
--    student_permissions arranca en '{}' A PROPOSITO: es el estado de los planes legados,
--    y el merge con los defaults tiene que dejarlo PERMISIVO.
insert into public.nutrition_plans_v2 (
  id, client_id, coach_id, org_id, team_id, name, strategy, created_by, updated_by
)
select plan_id, client_id, coach_id, null, null,
       'Permisos + void smoke', 'structured', coach_id, coach_id
from nut_perms_ctx;

insert into public.nutrition_plan_versions_v2 (
  id, plan_id, version_number, status, strategy, timezone, effective_from,
  published_at, published_by, student_permissions, created_by, updated_by
)
select version_id, plan_id, 1, 'published', 'structured', 'America/Santiago', test_date,
       now(), coach_id, '{}'::jsonb, coach_id, coach_id
from nut_perms_ctx;

insert into public.nutrition_day_variants_v2 (
  id, version_id, variant_key, label, is_default,
  target_calories, target_protein_g, target_carbs_g, target_fats_g
)
select variant_id, version_id, 'default', 'Día base', true, 2100, 160, 230, 65
from nut_perms_ctx;

insert into public.nutrition_meal_slots_v2 (
  id, version_id, day_variant_id, slot_code, name, slot_mode, is_required, order_index
)
select slot_id, version_id, variant_id, 'lunch', 'Almuerzo', 'anchor', true, 0
from nut_perms_ctx;

insert into public.nutrition_meal_slots_v2 (
  id, version_id, day_variant_id, slot_code, name, slot_mode, is_required, order_index
)
select slot_b_id, version_id, variant_id, 'dinner', 'Cena', 'anchor', false, 1
from nut_perms_ctx;

insert into public.nutrition_prescription_items_v2 (
  id, version_id, meal_slot_id, food_id, quantity, unit,
  snapshot_name, snapshot_calories, snapshot_protein_g, snapshot_carbs_g, snapshot_fats_g
)
select item_id, version_id, slot_id, food_id, 200, 'g',
       'Alimento prescrito smoke', 180, 20, 22, 3
from nut_perms_ctx;

-- Target de intercambio en la franja: sin el, el read model NO calcula cobertura
-- (v_has_portions = false) y la asercion de `derivadas` no probaria nada.
insert into public.nutrition_slot_exchange_targets_v2 (
  version_id, meal_slot_id, exchange_group_id, portions, order_index,
  snapshot_group_code, snapshot_group_name,
  snapshot_ref_calories, snapshot_ref_protein_g, snapshot_ref_carbs_g, snapshot_ref_fats_g
)
select ctx.version_id, ctx.slot_id, ctx.group_id, 3, 0,
       eg.code, eg.name, 80, 2, 15, 0
from nut_perms_ctx ctx
join public.exchange_groups eg on eg.id = ctx.group_id;

update public.nutrition_plans_v2 p
set current_published_version_id = ctx.version_id
from nut_perms_ctx ctx
where p.id = ctx.plan_id;

-- Identidad: el propio alumno (los guards solo corren para auth.uid() = client_id).
select set_config(
  'request.jwt.claim.sub',
  (select client_id::text from nut_perms_ctx),
  true
);

-- ============================================================================
-- NUT-009 — plan LEGADO ('{}'): el merge de defaults lo deja permisivo
-- ============================================================================
do $$
declare
  ctx nut_perms_ctx%rowtype;
  perms jsonb;
begin
  select * into ctx from nut_perms_ctx;

  perform public.ensure_nutrition_day_snapshot_v2(ctx.client_id, ctx.test_date, 'America/Santiago');

  perms := public.get_nutrition_student_permissions_v2(ctx.client_id, ctx.test_date, null) -> 'permissions';
  if (perms ->> 'canRegisterFreely')::boolean is not true then
    raise exception 'SMOKE FALLO: un plan legado ({}) quedo con canRegisterFreely=false (NUT-009 merge)';
  end if;
  if (perms ->> 'canAdjustPrescribedQuantity')::boolean is not true then
    raise exception 'SMOKE FALLO: un plan legado ({}) quedo sin canAdjustPrescribedQuantity (NUT-009 merge)';
  end if;
  if (perms ->> 'canMoveMealSlot')::boolean is not false then
    raise exception 'SMOKE FALLO: canMoveMealSlot deberia ser false por defecto';
  end if;

  -- La referencia prescrita del item viaja para el tope de % y el guard de franja.
  perms := public.get_nutrition_student_permissions_v2(ctx.client_id, ctx.test_date, ctx.item_id) -> 'prescribed';
  if (perms ->> 'quantity')::numeric <> 200 or perms ->> 'mealSlot' <> 'lunch' then
    raise exception 'SMOKE FALLO: la referencia prescrita del item es incorrecta';
  end if;
end;
$$;

-- ============================================================================
-- NUT-010 — el retiro es TERMINAL y devuelve la cobertura DERIVADA a cero
-- ============================================================================
do $$
declare
  ctx nut_perms_ctx%rowtype;
  free_id uuid;
  void_id uuid;
  void_again uuid;
  today jsonb;
  derivadas numeric;
  entry_count integer;
  group_code text;
begin
  select * into ctx from nut_perms_ctx;
  select code into group_code from public.exchange_groups where id = ctx.group_id;

  -- Registro LIBRE de 150 g del alimento clasificado: alimenta la rama `derivadas`.
  free_id := public.record_nutrition_intake_v2(
    ctx.client_id,
    ctx.test_date,
    (ctx.test_date + time '13:00') at time zone 'America/Santiago',
    'America/Santiago',
    ctx.food_id,
    null,
    150,
    'g',
    'lunch',
    'offplan',
    'search',
    ctx.version_id,
    null,
    'intake:perms-smoke:free-001',
    null,
    '{"name":"Alimento smoke","calories":120,"proteinG":10,"carbsG":5,"fatsG":2,"servingSize":100,"servingUnit":"g","macrosBasis":"per_100"}'::jsonb
  );

  today := public.get_nutrition_today_v2(ctx.client_id, ctx.test_date, 'America/Santiago');
  entry_count := (today -> 'consumed' ->> 'entryCount')::integer;
  select coalesce(max((c ->> 'derivadas')::numeric), 0) into derivadas
  from jsonb_array_elements(coalesce(today -> 'dayCoverage', '[]'::jsonb)) c
  where c ->> 'groupCode' = group_code;

  if entry_count <> 1 then
    raise exception 'SMOKE FALLO: entryCount deberia ser 1 tras el registro (fue %)', entry_count;
  end if;
  if derivadas <= 0 then
    raise exception 'SMOKE FALLO: la cobertura DERIVADA no se computo (setup invalido para NUT-010 D)';
  end if;
  if round(derivadas, 4) <> round(150::numeric / ctx.portion_grams, 4) then
    raise exception 'SMOKE FALLO: derivadas esperadas % pero fueron %',
      round(150::numeric / ctx.portion_grams, 4), round(derivadas, 4);
  end if;

  -- RETIRO terminal.
  void_id := public.void_nutrition_intake_v2(
    ctx.client_id, free_id, 'Lo registre por error (smoke)', 'void:perms-smoke:001'
  );
  if void_id <> free_id then
    raise exception 'SMOKE FALLO: void_ deberia devolver el id de la entry retirada';
  end if;
  if (select entry_status from public.nutrition_intake_entries where id = free_id) <> 'voided' then
    raise exception 'SMOKE FALLO: la entry no quedo en estado voided (NUT-010)';
  end if;
  -- SIN entry nueva: el retiro no inserta nada (esa era la raiz del fantasma).
  if exists (
    select 1 from public.nutrition_intake_entries
    where corrects_entry_id = free_id
  ) then
    raise exception 'SMOKE FALLO: el retiro inserto una entry correctora (NUT-010 opcion A)';
  end if;
  if not exists (
    select 1 from public.nutrition_v2_audit_log
    where intake_entry_id = free_id and action = 'intake.voided'
  ) then
    raise exception 'SMOKE FALLO: el retiro no dejo rastro intake.voided en la auditoria';
  end if;

  today := public.get_nutrition_today_v2(ctx.client_id, ctx.test_date, 'America/Santiago');
  entry_count := (today -> 'consumed' ->> 'entryCount')::integer;
  select coalesce(max((c ->> 'derivadas')::numeric), 0) into derivadas
  from jsonb_array_elements(coalesce(today -> 'dayCoverage', '[]'::jsonb)) c
  where c ->> 'groupCode' = group_code;

  if entry_count <> 0 then
    raise exception 'SMOKE FALLO: entryCount quedo inflado tras el retiro (fue %) — NUT-010 E', entry_count;
  end if;
  if derivadas <> 0 then
    raise exception 'SMOKE FALLO: la cobertura DERIVADA sobrevivio al retiro (fue %) — NUT-010 D', derivadas;
  end if;

  -- Doble retiro: idempotente, mismo id y sin excepcion.
  void_again := public.void_nutrition_intake_v2(
    ctx.client_id, free_id, 'Reintento del mismo gesto', 'void:perms-smoke:001'
  );
  if void_again <> free_id then
    raise exception 'SMOKE FALLO: el doble retiro no fue idempotente';
  end if;
end;
$$;

-- ============================================================================
-- NUT-009 — canRegisterFreely = false: el registro LIBRE se rechaza con 42501
-- ============================================================================
update public.nutrition_day_snapshots_v2 s
set student_permissions = '{"canRegisterFreely": false}'::jsonb
from nut_perms_ctx ctx
where s.client_id = ctx.client_id and s.local_date = ctx.test_date;

do $$
declare
  ctx nut_perms_ctx%rowtype;
  prescribed_id uuid;
begin
  select * into ctx from nut_perms_ctx;

  begin
    perform public.record_nutrition_intake_v2(
      ctx.client_id, ctx.test_date,
      (ctx.test_date + time '14:00') at time zone 'America/Santiago', 'America/Santiago',
      ctx.food_id, null, 100, 'g', 'lunch', 'offplan', 'search',
      ctx.version_id, null, 'intake:perms-smoke:blocked-001', null,
      '{"name":"Alimento smoke","calories":120,"macrosBasis":"per_100"}'::jsonb
    );
    raise exception 'SMOKE FALLO: se registro un alimento LIBRE con canRegisterFreely=false (NUT-009)';
  exception
    when insufficient_privilege then
      if position('nutrition_v2_permission_denied' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO: 42501 inesperado (%), se esperaba nutrition_v2_permission_denied', sqlerrm;
      end if;
  end;

  -- "Lo comi" del item PRESCRITO sigue funcionando: la regla es solo para el registro libre.
  prescribed_id := public.record_nutrition_intake_v2(
    ctx.client_id, ctx.test_date,
    (ctx.test_date + time '14:05') at time zone 'America/Santiago', 'America/Santiago',
    ctx.food_id, null, 200, 'g', 'lunch', 'prescription', 'prescription',
    ctx.version_id, ctx.item_id, 'intake:perms-smoke:prescribed-001', null,
    '{"name":"Alimento prescrito smoke","calories":180,"macrosBasis":"per_100"}'::jsonb
  );
  if prescribed_id is null then
    raise exception 'SMOKE FALLO: canRegisterFreely=false bloqueo el "Lo comi" del plan (NUT-009 alcance)';
  end if;

  -- El sintetico de marcar-porcion (source=prescription, sin item) tambien queda EXENTO
  -- por SPEC R1: la libertad DENTRO del grupo la da el propio target.
  if public.record_nutrition_intake_v2(
       ctx.client_id, ctx.test_date,
       (ctx.test_date + time '14:10') at time zone 'America/Santiago', 'America/Santiago',
       null, 'Grupo de prueba', 1, 'porción', 'lunch', 'prescription', 'prescription',
       null, null, 'intake:perms-smoke:portion-001', null,
       '{"name":"Grupo de prueba","calories":80}'::jsonb
     ) is null then
    raise exception 'SMOKE FALLO: el sintetico de porciones quedo bloqueado (SPEC R1)';
  end if;
end;
$$;

-- ============================================================================
-- NUT-009 — mover de franja y tope de ajuste de cantidad
-- ============================================================================
update public.nutrition_day_snapshots_v2 s
set student_permissions = '{"canMoveMealSlot": false, "canAdjustPrescribedQuantity": true, "quantityAdjustmentPercent": 10}'::jsonb
from nut_perms_ctx ctx
where s.client_id = ctx.client_id and s.local_date = ctx.test_date;

do $$
declare
  ctx nut_perms_ctx%rowtype;
  base_id uuid;
begin
  select * into ctx from nut_perms_ctx;

  -- Mover el item prescrito de 'lunch' a 'dinner' sin canMoveMealSlot.
  begin
    perform public.record_nutrition_intake_v2(
      ctx.client_id, ctx.test_date,
      (ctx.test_date + time '20:00') at time zone 'America/Santiago', 'America/Santiago',
      ctx.food_id, null, 200, 'g', 'dinner', 'prescription', 'prescription',
      ctx.version_id, ctx.item_id, 'intake:perms-smoke:moved-001', null,
      '{"name":"Alimento prescrito smoke","calories":180}'::jsonb
    );
    raise exception 'SMOKE FALLO: se movio un item del plan de franja con canMoveMealSlot=false';
  exception
    when insufficient_privilege then
      if position('nutrition_v2_permission_denied' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO: 42501 inesperado al mover de franja (%)', sqlerrm;
      end if;
  end;

  -- Correccion DENTRO del tope (200 -> 210 = 5% <= 10%): pasa.
  base_id := (
    select id from public.nutrition_intake_entries
    where client_id = ctx.client_id and idempotency_key = 'intake:perms-smoke:prescribed-001'
  );
  if public.correct_nutrition_intake_v2(
       base_id, 'Comi un poco mas', ctx.client_id, ctx.test_date,
       (ctx.test_date + time '14:30') at time zone 'America/Santiago', 'America/Santiago',
       ctx.food_id, null, 210, 'g', 'lunch', 'prescription', 'prescription',
       ctx.version_id, ctx.item_id, 'correction:perms-smoke:in-range', null,
       '{"name":"Alimento prescrito smoke","calories":180}'::jsonb
     ) is null then
    raise exception 'SMOKE FALLO: una correccion DENTRO del tope fue rechazada (NUT-009)';
  end if;

  -- Correccion FUERA del tope (210 -> 300 = 50% > 10%): 42501.
  base_id := (
    select id from public.nutrition_intake_entries
    where client_id = ctx.client_id and idempotency_key = 'correction:perms-smoke:in-range'
  );
  begin
    perform public.correct_nutrition_intake_v2(
      base_id, 'Comi mucho mas', ctx.client_id, ctx.test_date,
      (ctx.test_date + time '14:40') at time zone 'America/Santiago', 'America/Santiago',
      ctx.food_id, null, 300, 'g', 'lunch', 'prescription', 'prescription',
      ctx.version_id, ctx.item_id, 'correction:perms-smoke:out-of-range', null,
      '{"name":"Alimento prescrito smoke","calories":180}'::jsonb
    );
    raise exception 'SMOKE FALLO: se acepto una correccion FUERA del tope de %% (NUT-009)';
  exception
    when insufficient_privilege then
      if position('nutrition_v2_permission_denied' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO: 42501 inesperado en el tope de cantidad (%)', sqlerrm;
      end if;
  end;
end;
$$;

-- ============================================================================
-- NUT-009 — canAdjustPrescribedQuantity = false bloquea el ajuste
-- ============================================================================
update public.nutrition_day_snapshots_v2 s
set student_permissions = '{"canAdjustPrescribedQuantity": false}'::jsonb
from nut_perms_ctx ctx
where s.client_id = ctx.client_id and s.local_date = ctx.test_date;

do $$
declare
  ctx nut_perms_ctx%rowtype;
  base_id uuid;
begin
  select * into ctx from nut_perms_ctx;
  base_id := (
    select id from public.nutrition_intake_entries
    where client_id = ctx.client_id and idempotency_key = 'correction:perms-smoke:in-range'
  );

  begin
    perform public.correct_nutrition_intake_v2(
      base_id, 'Quiero cambiar la cantidad', ctx.client_id, ctx.test_date,
      (ctx.test_date + time '15:00') at time zone 'America/Santiago', 'America/Santiago',
      ctx.food_id, null, 190, 'g', 'lunch', 'prescription', 'prescription',
      ctx.version_id, ctx.item_id, 'correction:perms-smoke:blocked', null,
      '{"name":"Alimento prescrito smoke","calories":180}'::jsonb
    );
    raise exception 'SMOKE FALLO: se ajusto la cantidad con canAdjustPrescribedQuantity=false';
  exception
    when insufficient_privilege then
      if position('nutrition_v2_permission_denied' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO: 42501 inesperado en el ajuste de cantidad (%)', sqlerrm;
      end if;
  end;

  -- RETIRAR siempre se puede, incluso con todos los permisos apagados: dejar al alumno
  -- con un registro erroneo imborrable seria peor que la regla que protege.
  if public.void_nutrition_intake_v2(ctx.client_id, base_id, 'Retiro con permisos apagados') <> base_id then
    raise exception 'SMOKE FALLO: el retiro quedo bloqueado por los permisos del plan (NUT-010)';
  end if;
end;
$$;

rollback;
