-- ============================================================================
-- EVA Nutrition V2 — Porciones (intercambios) como capa aditiva sobre
-- structured/hybrid. Spec: specs/nutrition-portions/SPEC.md (R2/R4/R5).
-- Tarea: specs/nutrition-portions/TASKS.md T0.1.
-- ----------------------------------------------------------------------------
-- ORDEN (hallazgo D1): (1) tabla nutrition_slot_exchange_targets_v2; (2) 2
-- columnas nullable en nutrition_intake_entries; (3) create or replace de
-- record_/correct_nutrition_intake_v2 PARTIENDO del cuerpo del gate
-- 20260718120000_student_access_grace_gate.sql (conserva
-- private.student_write_allowed — money-safety) + transporte de porciones via
-- p_snapshot; (4) build_prescription_snapshot con exchangeTargets[] por franja.
--
-- ADITIVA / forward-only: cero DROP/rename de objetos existentes; el freeze de
-- los snapshot_* lo hace la capa de persistencia del draft (T0.3), no esta
-- migracion ni el publish RPC (que queda INTACTO — A1).
--
-- Timestamp POSTERIOR a 20260718120000 (gate) a proposito: el paso (3) recrea
-- record_nutrition_intake_v2 encima del cuerpo del gate; correr antes lo
-- regresaria (perderia el gate de pausa del coach).
--
-- NO se aplica a prod dentro del build (BEGIN/ROLLBACK + advisors + GO CEO en la
-- fase de operacion). Rollback comentado al pie.
--
-- RLS (leccion incidente 2026-06-09): espejo EXACTO de
-- nutrition_prescription_items_v2 — helpers STABLE SECURITY DEFINER
-- private.nutrition_v2_can_read_version / _can_edit_version sobre version_id
-- (re-derivan el scope desde el PLAN: version -> plan -> client — hallazgo S1),
-- nunca EXISTS correlacionado per-row. La FK compuesta (meal_slot_id,
-- version_id) impide colar un slot de otra version bajo un version_id editable.
-- ============================================================================

-- ── 1) Tabla de targets de porciones por franja (unica DDL de dominio — R2). ──
create table public.nutrition_slot_exchange_targets_v2 (
  id                uuid primary key default gen_random_uuid(),
  version_id        uuid not null,
  meal_slot_id      uuid not null,
  exchange_group_id uuid not null references public.exchange_groups(id) on delete restrict,
  portions          numeric not null
                    check (portions > 0 and portions <= 99 and (portions * 2) = floor(portions * 2)),
  notes             text,
  order_index       integer not null default 0 check (order_index >= 0),
  -- Snapshot congelado al persistir el draft (exchange_groups NO esta versionado
  -- — riesgo #1). Toda fila persistida los lleva completos (T0.3); no existen
  -- filas con snapshot_* NULL en ningun estado del flujo de la app.
  snapshot_group_code       text,
  snapshot_group_name       text,
  snapshot_ref_calories     numeric,
  snapshot_ref_protein_g    numeric,
  snapshot_ref_carbs_g      numeric,
  snapshot_ref_fats_g       numeric,
  -- ENRIQUECIDO (A2, opcion a): [{code, portions, ref:{calories,proteinG,carbsG,
  -- fatsG}}] con los ref_* congelados de cada grupo base referenciado (LEG->P+C).
  snapshot_composed_of      jsonb,
  snapshot_macros_confirmed boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint nstet_slot_version_fkey
    foreign key (meal_slot_id, version_id)
    references public.nutrition_meal_slots_v2(id, version_id) on delete cascade,
  unique (meal_slot_id, exchange_group_id)
);

-- Indices obligatorios (advisors marcan FK sin indice — hallazgo D2). El leading
-- meal_slot_id de la FK compuesta ya lo cubre el UNIQUE de arriba (mismo trato
-- que nutrition_prescription_items_v2_slot_order_idx para items).
create index nstet_version_id_idx
  on public.nutrition_slot_exchange_targets_v2 (version_id);
create index nstet_exchange_group_id_idx
  on public.nutrition_slot_exchange_targets_v2 (exchange_group_id);

comment on table public.nutrition_slot_exchange_targets_v2 is
  'Targets de porciones (intercambios) por franja V2. Capa opcional sobre '
  'structured/hybrid. snapshot_* congelados al persistir el draft (grupos no '
  'versionados); snapshot_composed_of enriquecido con ref_* de los grupos base.';

-- updated_at automatico (patron V2: private.nutrition_v2_set_updated_at).
create trigger nutrition_slot_exchange_targets_v2_set_updated_at
before update on public.nutrition_slot_exchange_targets_v2
for each row execute function private.nutrition_v2_set_updated_at();

-- Grants: espejo de items — REVOKE total + grants explicitos; anon queda sin
-- privilegios (RLS es techo de filas, no de privilegios de tabla).
alter table public.nutrition_slot_exchange_targets_v2 enable row level security;
revoke all on public.nutrition_slot_exchange_targets_v2 from public, anon, authenticated;
grant select, insert, update, delete on public.nutrition_slot_exchange_targets_v2 to authenticated;
grant all on public.nutrition_slot_exchange_targets_v2 to service_role;

-- RLS espejo EXACTO de nutrition_prescription_items_v2 (SELECT/INSERT/UPDATE/
-- DELETE via helpers de version) + policy _service (patron obligatorio del repo).
create policy nutrition_slot_exchange_targets_v2_select
on public.nutrition_slot_exchange_targets_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(version_id));

create policy nutrition_slot_exchange_targets_v2_insert
on public.nutrition_slot_exchange_targets_v2
for insert
to authenticated
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_slot_exchange_targets_v2_update
on public.nutrition_slot_exchange_targets_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(version_id))
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_slot_exchange_targets_v2_delete
on public.nutrition_slot_exchange_targets_v2
for delete
to authenticated
using (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_slot_exchange_targets_v2_service
on public.nutrition_slot_exchange_targets_v2
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');

-- ── 2) Columnas aditivas nullable en el intake canonico (R4). ─────────────────
--    Codigo del grupo congelado (sin FK) + porciones marcadas (paso 0,5, <=99).
alter table public.nutrition_intake_entries
  add column if not exists exchange_group_code text,
  add column if not exists exchange_portions numeric;

alter table public.nutrition_intake_entries
  add constraint nutrition_intake_entries_v2_exchange_portions_check
    check (
      exchange_portions is null
      or (exchange_portions > 0 and exchange_portions <= 99
          and (exchange_portions * 2) = floor(exchange_portions * 2))
    );

comment on column public.nutrition_intake_entries.exchange_group_code is
  'Codigo de grupo de intercambio congelado del snapshot (sin FK). Poblado en '
  'intakes sinteticos de marcar-porcion; NULL en el resto.';
comment on column public.nutrition_intake_entries.exchange_portions is
  'Porciones marcadas por el intake sintetico (paso 0,5, <=99). NULL = no aporta '
  'cobertura marcada; la entry correctora de un void lo pone NULL (B3).';

-- ── 3) record_/correct_nutrition_intake_v2 desde el cuerpo del gate. ──────────
--    Base = 20260718120000_student_access_grace_gate.sql (conserva la llamada a
--    private.student_write_allowed). Unico agregado: extraer exchangeGroupCode /
--    exchangePortions de p_snapshot hacia las 2 columnas nuevas (transporte B1;
--    firma y grants INTACTOS — no hay re-otorgamiento).
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
  p_snapshot jsonb
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

-- Wrapper de correccion/void. Mismo cuerpo del gate; UNICO agregado: la entry
-- correctora escribe exchange_portions = NULL (contribucion cero — belt B3, el
-- otro cinturon es el read-model que solo suma cadenas activas). Firma intacta.
create or replace function public.correct_nutrition_intake_v2(
  p_corrects_entry_id uuid,
  p_correction_reason text,
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
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.nutrition_intake_entries%rowtype;
  v_new_id uuid;
  v_plan_id uuid;
begin
  if p_correction_reason is null or char_length(btrim(p_correction_reason)) not between 3 and 1000 then
    raise exception 'nutrition_v2_correction_reason_required' using errcode = '22023';
  end if;

  select * into v_original
  from public.nutrition_intake_entries
  where id = p_corrects_entry_id
  for update;

  if v_original.id is null or v_original.client_id <> p_client_id then
    raise exception 'nutrition_v2_original_entry_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not private.nutrition_v2_can_read_client(v_original.client_id) then
    raise exception 'nutrition_v2_correction_scope_denied' using errcode = '42501';
  end if;
  -- Gate de acceso del coach: SOLO cuando el propio alumno corrige.
  if auth.uid() = p_client_id and not private.student_write_allowed(p_client_id) then
    raise exception 'coach_account_paused' using errcode = '42501';
  end if;
  if v_original.idempotency_key is null then
    raise exception 'nutrition_v2_legacy_entry_requires_legacy_flow' using errcode = '22023';
  end if;
  if v_original.entry_status <> 'active' then
    raise exception 'nutrition_v2_only_active_entries_can_correct' using errcode = '22023';
  end if;

  v_new_id := public.record_nutrition_intake_v2(
    p_client_id,
    p_local_date,
    p_occurred_at,
    p_timezone,
    p_food_id,
    p_custom_name,
    p_quantity,
    p_unit,
    p_meal_slot,
    p_source,
    p_capture_method,
    p_plan_version_id,
    p_prescription_item_id,
    p_idempotency_key,
    p_note,
    p_snapshot
  );

  -- La entry correctora NUNCA aporta cobertura de porciones marcadas (void
  -- neutraliza — B3), independiente de lo que traiga p_snapshot del cliente.
  update public.nutrition_intake_entries
  set corrects_entry_id = v_original.id,
      revision = v_original.revision + 1,
      exchange_portions = null
  where id = v_new_id;

  update public.nutrition_intake_entries
  set entry_status = 'corrected',
      corrected_by_entry_id = v_new_id,
      correction_reason = btrim(p_correction_reason),
      updated_at = now()
  where id = v_original.id;

  if p_plan_version_id is not null then
    select plan_id into v_plan_id
    from public.nutrition_plan_versions_v2
    where id = p_plan_version_id;
  end if;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    p_plan_version_id,
    v_new_id,
    'intake.corrected',
    'nutrition_intake_entry',
    v_new_id,
    p_idempotency_key,
    jsonb_build_object('correctsEntryId', v_original.id, 'reason', btrim(p_correction_reason))
  );

  return v_new_id;
end;
$$;

-- Firma identica => sin drop; grants ya vigentes (20260714190500). Re-asercion
-- idempotente por si un fixer del gate cambio los revoke/grant.
revoke all on function public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.correct_nutrition_intake_v2(uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.correct_nutrition_intake_v2(uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) to authenticated;

-- Assert (B1): el cuerpo recreado DEBE conservar la llamada al gate de pausa del
-- coach. Si un create-or-replace lo regresa, esta migracion falla en voz alta.
do $$
begin
  if position(
    'student_write_allowed' in
    pg_get_functiondef(
      'public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'nutrition_portions_v2: record_nutrition_intake_v2 perdio el gate student_write_allowed';
  end if;
  if position(
    'student_write_allowed' in
    pg_get_functiondef(
      'public.correct_nutrition_intake_v2(uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'nutrition_portions_v2: correct_nutrition_intake_v2 perdio el gate student_write_allowed';
  end if;
end $$;

-- ── 4) build_prescription_snapshot con exchangeTargets[] por franja. ──────────
--    create or replace desde la version canonica vigente (20260714190500, sin
--    cambios posteriores). UNICO agregado: exchangeTargets[] por meal slot, leido
--    de los snapshot_* congelados (el read-model reconstruye el dict de grupos
--    desde estos snapshots — R3/A2; engine y 18 tests intactos).
create or replace function private.nutrition_v2_build_prescription_snapshot(
  p_version_id uuid,
  p_variant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', jsonb_build_object(
      'id', v.id,
      'number', v.version_number,
      'strategy', v.strategy,
      'effectiveFrom', v.effective_from,
      'timezone', v.timezone
    ),
    'variant', case
      when dv.id is null then null
      else jsonb_build_object(
        'id', dv.id,
        'key', dv.variant_key,
        'label', dv.label,
        'dayOfWeek', dv.day_of_week,
        'isDefault', dv.is_default,
        'targets', jsonb_build_object(
          'calories', dv.target_calories,
          'proteinG', dv.target_protein_g,
          'carbsG', dv.target_carbs_g,
          'fatsG', dv.target_fats_g,
          'fiberG', dv.target_fiber_g,
          'sodiumMg', dv.target_sodium_mg,
          'waterMl', dv.target_water_ml
        )
      )
    end,
    'mealSlots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ms.id,
          'code', ms.slot_code,
          'name', ms.name,
          'startTime', case when ms.start_time is null then null else to_char(ms.start_time, 'HH24:MI') end,
          'endTime', case when ms.end_time is null then null else to_char(ms.end_time, 'HH24:MI') end,
          'mode', ms.slot_mode,
          'required', ms.is_required,
          'instructions', ms.instructions,
          'targets', jsonb_build_object(
            'calories', ms.target_calories,
            'proteinG', ms.target_protein_g,
            'carbsG', ms.target_carbs_g,
            'fatsG', ms.target_fats_g
          ),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pi.id,
                'foodId', pi.food_id,
                'recipeId', pi.recipe_id,
                'name', coalesce(pi.snapshot_name, pi.custom_name),
                'brand', pi.snapshot_brand,
                'quantity', pi.quantity,
                'unit', pi.unit,
                'minimumQuantity', pi.minimum_quantity,
                'maximumQuantity', pi.maximum_quantity,
                'optional', pi.is_optional,
                'substitutionGroupId', pi.substitution_group_id,
                'notes', pi.notes,
                'macros', jsonb_build_object(
                  'calories', pi.snapshot_calories,
                  'proteinG', pi.snapshot_protein_g,
                  'carbsG', pi.snapshot_carbs_g,
                  'fatsG', pi.snapshot_fats_g,
                  'fiberG', pi.snapshot_fiber_g
                )
              ) order by pi.order_index, pi.created_at
            )
            from public.nutrition_prescription_items_v2 pi
            where pi.meal_slot_id = ms.id
          ), '[]'::jsonb),
          -- Capa de porciones: targets congelados de la franja. Ref y composedOf
          -- enriquecido salen de los snapshot_* (nunca del catalogo vivo).
          'exchangeTargets', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', et.id,
                'exchangeGroupId', et.exchange_group_id,
                'code', et.snapshot_group_code,
                'name', et.snapshot_group_name,
                'portions', et.portions,
                'notes', et.notes,
                'macrosConfirmed', et.snapshot_macros_confirmed,
                'ref', jsonb_build_object(
                  'calories', et.snapshot_ref_calories,
                  'proteinG', et.snapshot_ref_protein_g,
                  'carbsG', et.snapshot_ref_carbs_g,
                  'fatsG', et.snapshot_ref_fats_g
                ),
                'composedOf', et.snapshot_composed_of
              ) order by et.order_index, et.created_at
            )
            from public.nutrition_slot_exchange_targets_v2 et
            where et.meal_slot_id = ms.id
          ), '[]'::jsonb)
        ) order by ms.order_index, ms.created_at
      )
      from public.nutrition_meal_slots_v2 ms
      where ms.day_variant_id = dv.id
    ), '[]'::jsonb)
  )
  from public.nutrition_plan_versions_v2 v
  left join public.nutrition_day_variants_v2 dv
    on dv.id = p_variant_id
   and dv.version_id = v.id
  where v.id = p_version_id;
$$;

-- Firma identica => sin drop; grants ya vigentes (20260714190500). Re-asercion
-- idempotente del privilegio (funcion privada, solo owner/definer).
revoke all on function private.nutrition_v2_build_prescription_snapshot(uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- ROLLBACK (una pasada — NO se aplica en el build; referencia de operacion):
--
--   -- 4) restaurar build_prescription_snapshot SIN exchangeTargets: re-aplicar
--   --    el cuerpo de 20260714190500_nutrition_v2_security_rpc.sql
--   --    (create or replace function private.nutrition_v2_build_prescription_snapshot).
--
--   -- 3) restaurar record_/correct_nutrition_intake_v2 SIN el transporte de
--   --    porciones: re-aplicar los cuerpos de
--   --    20260718120000_student_access_grace_gate.sql (CONSERVAN el gate
--   --    student_write_allowed — NO volver a 20260714190500, que lo perderia).
--
--   -- 2) columnas del intake.
--   alter table public.nutrition_intake_entries
--     drop constraint if exists nutrition_intake_entries_v2_exchange_portions_check;
--   alter table public.nutrition_intake_entries
--     drop column if exists exchange_portions,
--     drop column if exists exchange_group_code;
--
--   -- 1) tabla de targets (cascade limpia policies/trigger/indices).
--   drop table if exists public.nutrition_slot_exchange_targets_v2 cascade;
-- ============================================================================
