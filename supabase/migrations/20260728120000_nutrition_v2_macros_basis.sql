-- ============================================================================
-- EVA Nutricion V2 — NUT-001: base declarada de macros (per_100 / per_serving)
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G1): private.nutrition_v2_entry_factor
-- (20260714210000:62-77) escala g/ml dividiendo por serving_size y la unidad contable
-- IGNORA serving_size — exactamente lo inverso al motor canonico per-100
-- (packages/nutrition-engine/macros.ts:120-135). Ademas el catalogo tiene DOS
-- convenciones vivas: el importado (scripts/import-food-catalog-cl.mjs) es per-100 y
-- el seed de intercambios (_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql)
-- guarda kcal POR PORCION. Ninguna formula unica es correcta para ambos conjuntos: hay
-- que DECLARAR la base en el dato.
--
-- Que hace esta migracion (100% ADITIVA, forward-only):
--   1. public.foods.macros_basis ('per_100' | 'per_serving', default 'per_100') +
--      backfill a 'per_serving' de las filas del seed de intercambios
--      (exchange_group_id is not null, las unicas cargadas por porcion).
--   2. public.nutrition_intake_entries.snapshot_macros_basis (NULL = LEGADO).
--   3. private.nutrition_v2_entry_factor gana p_basis (default null).
--      *** NULL => FORMULA HISTORICA BYTE-IDENTICA ***. Las filas ya persistidas no
--      tienen basis, asi que su matematica NO cambia: prohibido reescribir el historial.
--   4. public.record_nutrition_intake_v2 congela la base en la entry.
--   5. Los dos consumidores vivos del factor (nutrition_v2_intake_item_json y
--      nutrition_v2_intake_totals) pasan el basis de la fila.
--
-- Semantica del factor cuando el basis SI viene:
--   per_100     : g/ml => qty/100 · contable => qty*serving/100 · porcion => qty
--   per_serving : g/ml => qty/coalesce(serving,1) · contable/porcion => qty
--   null/otro   : formula historica (20260714210000) sin cambios
-- La rama de porcion se preserva explicitamente porque el sintetico de porciones manda
-- p_unit = 'porción' con servingSize null a proposito
-- (apps/web/.../nutrition-v2/_actions/intake.actions.ts:495-560).
--
-- Grants: public.foods y public.nutrition_intake_entries tienen grants A NIVEL DE
-- TABLA (baseline:3545 y 20260618180002:24), no column-level, asi que las columnas
-- nuevas quedan cubiertas sin re-grant. La escritura real pasa igual por el RPC
-- SECURITY DEFINER + el guard de mutacion de 20260716210000.
--
-- Cambio de firma: record_nutrition_intake_v2 y nutrition_v2_entry_factor ganan un
-- parametro con DEFAULT. Un create-or-replace NO puede agregar parametros, y crear un
-- overload deja la llamada de N args AMBIGUA ("function is not unique"). Por eso se usa
-- drop function if exists <firma vieja> + create en la MISMA transaccion, que es el
-- precedente del repo (20260717130000:39 hizo lo mismo con publish_nutrition_plan_v2).
-- No hay DDL destructiva de datos; los grants se re-asertan abajo.
--
-- ROLLBACK (una pasada): re-aplicar 20260714210000 (factor de 3 args + los dos read
-- models) y 20260718140000 (record_ de 16 args); las columnas nuevas pueden quedarse
-- (son nullable / con default y nadie mas las lee).
-- ============================================================================

-- ── 1) foods.macros_basis ────────────────────────────────────────────────────
alter table public.foods
  add column if not exists macros_basis text not null default 'per_100';

do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.foods'::regclass
      and conname = 'foods_macros_basis_check'
  ) then
    alter table public.foods
      add constraint foods_macros_basis_check
        check (macros_basis in ('per_100', 'per_serving'));
  end if;
end;
$do$;

comment on column public.foods.macros_basis is
  'Base de los macros/calorias de la fila: per_100 (por 100 g/ml, convencion del '
  'catalogo importado y del motor canonico) o per_serving (por la porcion descrita '
  'en serving_size/serving_unit, convencion del seed de intercambios). NUT-001.';

-- Backfill acotado: SOLO las filas del seed de intercambios estan cargadas por porcion
-- (_POST_DEPLOY_20260611093002_nutrition_exchanges_seed.sql:71-132). El resto del
-- catalogo queda en el default 'per_100'.
update public.foods
set macros_basis = 'per_serving'
where exchange_group_id is not null
  and macros_basis is distinct from 'per_serving';

-- ── 2) nutrition_intake_entries.snapshot_macros_basis (NULL = legado) ────────
alter table public.nutrition_intake_entries
  add column if not exists snapshot_macros_basis text;

do $do$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.nutrition_intake_entries'::regclass
      and conname = 'nutrition_intake_entries_snapshot_macros_basis_check'
  ) then
    alter table public.nutrition_intake_entries
      add constraint nutrition_intake_entries_snapshot_macros_basis_check
        check (snapshot_macros_basis is null
               or snapshot_macros_basis in ('per_100', 'per_serving'));
  end if;
end;
$do$;

comment on column public.nutrition_intake_entries.snapshot_macros_basis is
  'Base de macros congelada al registrar. NULL = entry LEGADA: conserva la formula '
  'historica de private.nutrition_v2_entry_factor. Nunca hacer backfill ciego: '
  'reescribiria el historial del alumno. NUT-001.';

-- ── 3) private.nutrition_v2_entry_factor (+ p_basis) ─────────────────────────
drop function if exists private.nutrition_v2_entry_factor(numeric, text, numeric);

create or replace function private.nutrition_v2_entry_factor(
  p_quantity numeric,
  p_unit text,
  p_serving_size numeric,
  p_basis text default null
)
returns numeric
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_basis = 'per_100' then
      case
        when lower(coalesce(p_unit, '')) in ('g', 'ml')
          then greatest(coalesce(p_quantity, 0), 0) / 100
        when lower(coalesce(p_unit, '')) in ('porción', 'porcion')
          then greatest(coalesce(p_quantity, 0), 0)
        else greatest(coalesce(p_quantity, 0), 0)
             * greatest(coalesce(p_serving_size, 100), 0.0001) / 100
      end
    when p_basis = 'per_serving' then
      case
        when lower(coalesce(p_unit, '')) in ('g', 'ml')
          then greatest(coalesce(p_quantity, 0), 0)
               / greatest(coalesce(p_serving_size, 1), 0.0001)
        else greatest(coalesce(p_quantity, 0), 0)
      end
    -- LEGADO (p_basis null o desconocido): cuerpo verbatim de 20260714210000:69-76.
    else
      case
        when lower(coalesce(p_unit, '')) in ('g', 'ml')
          then greatest(coalesce(p_quantity, 0), 0)
               / greatest(coalesce(p_serving_size, 100), 0.0001)
        else greatest(coalesce(p_quantity, 0), 0)
      end
  end;
$fn$;

revoke all on function private.nutrition_v2_entry_factor(numeric, text, numeric, text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_entry_factor(numeric, text, numeric, text) is
  'Factor de escala de macros del intake. p_basis null => formula historica intacta '
  '(entries legadas). per_100 / per_serving aplican la base declarada del alimento. NUT-001.';

-- ── 4) read models vigentes: pasan el basis congelado de la fila ─────────────
--    Base copiada VERBATIM de 20260720120000:41-98 (item json) y 20260714210000:123-146
--    (totals). UNICO cambio: el 4to argumento del factor.
create or replace function private.nutrition_v2_intake_item_json(
  p_entry public.nutrition_intake_entries
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'foodId', p_entry.food_id,
    'customName', p_entry.custom_name,
    'quantity', p_entry.quantity,
    'unit', p_entry.unit,
    'mealSlot', coalesce(p_entry.meal_slot_v2, p_entry.meal_slot),
    'source', coalesce(p_entry.intake_source_v2, p_entry.source),
    'captureMethod', coalesce(p_entry.capture_method_v2, p_entry.capture_method),
    'occurredAt', coalesce(p_entry.occurred_at, p_entry.created_at),
    'status', p_entry.entry_status,
    'revision', p_entry.revision,
    'correctsEntryId', p_entry.corrects_entry_id,
    'prescriptionItemId', p_entry.prescription_item_id,
    -- [media/category] resueltos en lectura por food_id (null-safe: food custom => null).
    'media', private.food_catalog_v2_media_json(p_entry.food_id),
    'category', (select f.category from public.foods f where f.id = p_entry.food_id),
    'snapshot', jsonb_build_object(
      'name', coalesce(p_entry.snapshot_name, p_entry.custom_name, 'Alimento'),
      'brand', p_entry.snapshot_brand,
      'calories', p_entry.snapshot_calories,
      'proteinG', p_entry.snapshot_protein_g,
      'carbsG', p_entry.snapshot_carbs_g,
      'fatsG', p_entry.snapshot_fats_g,
      'fiberG', p_entry.snapshot_fiber_g,
      'servingSize', p_entry.snapshot_serving_size,
      'servingUnit', p_entry.snapshot_serving_unit,
      -- Base de escala congelada al registrar (NULL = fila legado, formula vieja).
      -- Imprescindible en lectura: buildCorrectionPayload la propaga para que una
      -- correccion no degrade la fila nueva a la formula legado.
      'macrosBasis', p_entry.snapshot_macros_basis
    ),
    'totals', jsonb_build_object(
      'calories', round(coalesce(p_entry.snapshot_calories, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'proteinG', round(coalesce(p_entry.snapshot_protein_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'carbsG', round(coalesce(p_entry.snapshot_carbs_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'fatsG', round(coalesce(p_entry.snapshot_fats_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1),
      'fiberG', round(coalesce(p_entry.snapshot_fiber_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size, p_entry.snapshot_macros_basis), 1)
    )
  )
  -- Porciones (SPEC R4, Q1 byte-identico): las llaves exchangeGroupCode/exchangePortions
  -- se AGREGAN condicionalmente, SOLO cuando el intake las trae (sintetico de marcar-
  -- porcion: codigo de grupo congelado + porciones marcadas). Un intake real tiene ambas
  -- null => el objeto queda SIN esas llaves. NutritionIntakeReadItemSchema
  -- las declara .optional().nullable() => ambas formas (ausente / presente) parsean.
  || case
       when p_entry.exchange_group_code is not null or p_entry.exchange_portions is not null
         then jsonb_build_object(
           'exchangeGroupCode', p_entry.exchange_group_code,
           'exchangePortions', p_entry.exchange_portions
         )
       else '{}'::jsonb
     end;
$$;
create or replace function private.nutrition_v2_intake_totals(
  p_client_id uuid,
  p_local_date date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'calories', round(coalesce(sum(coalesce(e.snapshot_calories, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size, e.snapshot_macros_basis)), 0), 1),
    'proteinG', round(coalesce(sum(coalesce(e.snapshot_protein_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size, e.snapshot_macros_basis)), 0), 1),
    'carbsG', round(coalesce(sum(coalesce(e.snapshot_carbs_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size, e.snapshot_macros_basis)), 0), 1),
    'fatsG', round(coalesce(sum(coalesce(e.snapshot_fats_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size, e.snapshot_macros_basis)), 0), 1),
    'fiberG', round(coalesce(sum(coalesce(e.snapshot_fiber_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size, e.snapshot_macros_basis)), 0), 1),
    'entryCount', count(*)::integer
  )
  from public.nutrition_intake_entries e
  where e.client_id = p_client_id
    and e.log_date = p_local_date
    and e.idempotency_key is not null
    and e.entry_status = 'active';
$$;

revoke all on function private.nutrition_v2_intake_item_json(public.nutrition_intake_entries)
  from public, anon, authenticated;
revoke all on function private.nutrition_v2_intake_totals(uuid, date)
  from public, anon, authenticated;

-- ── 5) record_nutrition_intake_v2 congela la base ────────────────────────────
--    Base copiada VERBATIM de 20260718140000:147-346 (definicion viva). Cambios:
--      · nuevo parametro p_snapshot_macros_basis text default null;
--      · v_macros_basis se resuelve del parametro O de p_snapshot->>'macrosBasis'
--        (doble transporte: los clientes pueden desplegar en cualquier orden);
--      · se persiste en snapshot_macros_basis.
--    Todo lo demas es identico (validaciones, idempotencia, columnas legacy, audit).
drop function if exists public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb
);
create or replace function public.record_nutrition_intake_v2(
  p_client_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_food_id uuid,
  p_custom_name text,
  p_quantity numeric,
  p_unit text,
  p_meal_slot text,
  p_source text,
  p_capture_method text,
  p_plan_version_id uuid,
  p_prescription_item_id uuid,
  p_idempotency_key text,
  p_note text,
  p_snapshot jsonb,
  p_snapshot_macros_basis text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_entry_id uuid;
  v_snapshot_id uuid;
  v_plan_id uuid;
  v_actor_role text;
  v_legacy_source text;
  v_legacy_capture text;
  v_legacy_slot text;
  v_macros_basis text;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_intake_scope_denied' using errcode = '42501';
  end if;
  -- Gate de acceso del coach: SOLO cuando el propio alumno registra.
  if auth.uid() = p_client_id and not private.student_write_allowed(p_client_id) then
    raise exception 'coach_account_paused' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'nutrition_v2_invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_local_date is null or p_occurred_at is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_invalid_intake_time' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_unit is null or char_length(btrim(p_unit)) not between 1 and 32 then
    raise exception 'nutrition_v2_invalid_quantity' using errcode = '22023';
  end if;
  if p_food_id is null and nullif(btrim(p_custom_name), '') is null then
    raise exception 'nutrition_v2_food_or_name_required' using errcode = '22023';
  end if;
  if p_source not in ('offplan', 'prescription', 'substitution', 'recipe', 'manual', 'legacy') then
    raise exception 'nutrition_v2_invalid_source' using errcode = '22023';
  end if;
  if p_capture_method not in ('search', 'barcode', 'recent', 'favorite', 'recipe', 'prescription', 'manual', 'legacy') then
    raise exception 'nutrition_v2_invalid_capture_method' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'nutrition_v2_invalid_snapshot' using errcode = '22023';
  end if;

  -- Base de macros congelada con el registro (NUT-001). Transporte doble para no
  -- depender del orden de despliegue de los clientes: parametro explicito o clave
  -- 'macrosBasis' del propio snapshot. NULL = legado (formula historica intacta).
  v_macros_basis := nullif(btrim(coalesce(p_snapshot_macros_basis, p_snapshot ->> 'macrosBasis')), '');
  if v_macros_basis is not null and v_macros_basis not in ('per_100', 'per_serving') then
    raise exception 'nutrition_v2_invalid_macros_basis' using errcode = '22023';
  end if;

  select id into v_existing_id
  from public.nutrition_intake_entries
  where client_id = p_client_id
    and idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_plan_version_id is not null then
    select p.id into v_plan_id
    from public.nutrition_plan_versions_v2 v
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where v.id = p_plan_version_id
      and p.client_id = p_client_id
      and v.status in ('published', 'superseded');
    if v_plan_id is null then
      raise exception 'nutrition_v2_plan_version_scope_denied' using errcode = '42501';
    end if;
  end if;

  if p_prescription_item_id is not null and not exists (
    select 1
    from public.nutrition_prescription_items_v2 pi
    join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where pi.id = p_prescription_item_id
      and p.client_id = p_client_id
      and (p_plan_version_id is null or pi.version_id = p_plan_version_id)
  ) then
    raise exception 'nutrition_v2_prescription_scope_denied' using errcode = '42501';
  end if;

  v_snapshot_id := private.nutrition_v2_ensure_day_snapshot(p_client_id, p_local_date, p_timezone);
  v_actor_role := private.nutrition_v2_actor_role(p_client_id);

  v_legacy_source := case
    when p_capture_method = 'recent' then 'recent'
    else 'offplan'
  end;
  v_legacy_capture := case
    when p_capture_method in ('search', 'barcode', 'recent', 'manual') then p_capture_method
    when p_capture_method = 'favorite' then 'recent'
    else 'manual'
  end;
  v_legacy_slot := case
    when p_meal_slot in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'other') then p_meal_slot
    when p_meal_slot is null then null
    else 'other'
  end;

  insert into public.nutrition_intake_entries (
    client_id,
    log_date,
    food_id,
    custom_name,
    quantity,
    unit,
    source,
    meal_slot,
    capture_method,
    note,
    snapshot_name,
    snapshot_brand,
    snapshot_calories,
    snapshot_protein_g,
    snapshot_carbs_g,
    snapshot_fats_g,
    snapshot_fiber_g,
    snapshot_serving_size,
    snapshot_serving_unit,
    snapshot_macros_basis,
    idempotency_key,
    actor_user_id,
    actor_role,
    entry_status,
    occurred_at,
    timezone,
    plan_version_id,
    day_snapshot_id,
    prescription_item_id,
    intake_source_v2,
    capture_method_v2,
    meal_slot_v2,
    exchange_group_code,
    exchange_portions,
    revision
  ) values (
    p_client_id,
    p_local_date,
    p_food_id,
    nullif(btrim(p_custom_name), ''),
    p_quantity,
    btrim(p_unit),
    v_legacy_source,
    v_legacy_slot,
    v_legacy_capture,
    nullif(btrim(p_note), ''),
    coalesce(nullif(btrim(p_snapshot ->> 'name'), ''), nullif(btrim(p_custom_name), ''), 'Alimento'),
    nullif(btrim(p_snapshot ->> 'brand'), ''),
    nullif(p_snapshot ->> 'calories', '')::numeric,
    nullif(p_snapshot ->> 'proteinG', '')::numeric,
    nullif(p_snapshot ->> 'carbsG', '')::numeric,
    nullif(p_snapshot ->> 'fatsG', '')::numeric,
    nullif(p_snapshot ->> 'fiberG', '')::numeric,
    nullif(p_snapshot ->> 'servingSize', '')::numeric,
    nullif(btrim(p_snapshot ->> 'servingUnit'), ''),
    v_macros_basis,
    p_idempotency_key,
    auth.uid(),
    v_actor_role,
    'active',
    p_occurred_at,
    p_timezone,
    p_plan_version_id,
    v_snapshot_id,
    p_prescription_item_id,
    p_source,
    p_capture_method,
    nullif(btrim(p_meal_slot), ''),
    nullif(btrim(p_snapshot ->> 'exchangeGroupCode'), ''),
    nullif(p_snapshot ->> 'exchangePortions', '')::numeric,
    1
  )
  returning id into v_entry_id;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    p_plan_version_id,
    v_entry_id,
    'intake.recorded',
    'nutrition_intake_entry',
    v_entry_id,
    p_idempotency_key,
    jsonb_build_object('source', p_source, 'captureMethod', p_capture_method, 'mealSlot', p_meal_slot)
  );

  return v_entry_id;
end;
$$;

revoke all on function public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) from public, anon;

grant execute on function public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) to authenticated;

comment on function public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) is
  'Idempotent audited V2 intake write. Legacy intake columns remain populated compatibly. '
  'p_snapshot_macros_basis (o snapshot.macrosBasis) congela la base de macros del alimento; '
  'NULL = legado y conserva la formula historica de escala. NUT-001.';
