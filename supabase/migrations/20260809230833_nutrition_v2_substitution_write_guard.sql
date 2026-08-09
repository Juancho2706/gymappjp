-- ============================================================================
-- EVA Nutricion V2 — T2.4 (F2): la etiqueta 'substitution' deja de ser declarativa
-- SPEC: docs/specs/nutrition-substitution-intake/SPEC.md
-- APLICADA EN LIVE el 2026-08-09 (version 20260809230833).
-- ----------------------------------------------------------------------------
-- Problema. `record_nutrition_intake_v2` valida que el `prescription_item_id` sea de un plan del
-- alumno, pero NUNCA valido ninguna relacion entre el `food_id` escrito y ese item. Como
-- `authenticated` tiene EXECUTE directo sobre la RPC via PostgREST, un guard puesto solo en la
-- server action web o en la route movil seria cosmetico.
--
-- Ademas, D3 de la SPEC (sustituir sobre un item ya registrado = correccion automatica) chocaba
-- con el guard NUT-009 vigente: `correct_` pasa `p_check_quantity = (p_quantity is distinct from
-- v_original.quantity)` y el check compara contra la cantidad PRESCRITA del item, ciego a la
-- unidad. Una sustitucion-correccion siempre cambia la cantidad (otro alimento, a veces otra
-- unidad: 130 g de leche frente a "1 un" de yogurt = 12.900% de delta). Medido en LIVE: 3 de las
-- 6 versiones publicadas con reemplazos tienen `canAdjustPrescribedQuantity = false`, incluida la
-- unica que ademas tiene `canRegisterFreely = false` — o sea, justo la alumna que T2.4 desbloquea.
--
-- Que hace, en tres piezas:
--   (1) private.nutrition_v2_assert_substitution_authorized — NUEVA.
--   (2) record_nutrition_intake_v2 — `create or replace`, MISMA firma (17 args), base copiada
--       VERBATIM de 20260728130000:274-509. UNICO delta: el guard de sustitucion.
--   (3) correct_nutrition_intake_v2 — `create or replace`, MISMA firma (18 args), base copiada
--       VERBATIM de 20260728130000:528-674. UNICO delta: `p_check_quantity` exime a
--       source = 'substitution'.
--
-- Matriz corrida en transaccion con ROLLBACK ANTES de aplicar (JWT reales, alumno
-- cea1b430 con canRegisterFreely=false y canAdjustPrescribedQuantity=false):
--   1 sustitucion autorizada ................. OK (es el objetivo de T2.4)
--   2 alimento NO autorizado ................. 42501 nutrition_v2_substitution_not_authorized
--   3 item de otro alumno .................... 42501 (lo ataja el guard de franja, antes del nuevo)
--   4 substitution sin prescription_item_id .. 42501 ..._not_authorized:missing_item
--   5 correccion-sustitucion, canAdjust=false. OK  <- el bloqueo que este delta resuelve
--   6 correccion NORMAL, canAdjust=false ...... 42501 quantity_adjustment (no se aflojo de mas)
--   7 delegacion con alimento no autorizado ... 42501 (el guard corre dentro de correct_)
--   8 coach con sustitucion no autorizada ..... 42501 (sin excepcion por rol)
--   9 intake prescrito normal ................. OK (sin regresion)
-- Verificado despues del rollback: el helper no existia y los md5 de record_/correct_ seguian
-- siendo los de 20260728130000 (2ef5dc2b… y e84fadb6…).
--
-- Verificado DESPUES de aplicar: `get_nutrition_today_v2` byte-identica (md5 732f641a… antes y
-- despues), una sola version de cada firma, el helper sin EXECUTE para `authenticated`, advisors
-- de seguridad sin un solo hallazgo nuevo (87 antes, 87 despues), y la matriz repetida contra las
-- funciones ya aplicadas — incluyendo que el registro LIBRE con canRegisterFreely=false sigue
-- devolviendo 42501 free_registration.
--
-- Lo que este guard NO cubre (sinceridad explicita): un alumno puede seguir llamando `record_`
-- con source = 'prescription' y un food arbitrario contra un item suyo. Eso es pre-existente y
-- es el modelo de confianza S2 declarado en 20260728130000:46-50. Lo que se cierra aca es que la
-- ETIQUETA 'substitution' no se puede mentir.
--
-- ROLLBACK (una pasada): re-aplicar 20260728130000 tal cual (contiene las dos funciones en su
-- version previa) y luego
--   drop function if exists private.nutrition_v2_assert_substitution_authorized(uuid, uuid, text);
-- ============================================================================

-- ── (1) Guard de autorizacion del reemplazo ──────────────────────────────────
create or replace function private.nutrition_v2_assert_substitution_authorized(
  p_prescription_item_id uuid,
  p_food_id uuid,
  p_custom_name text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $ass$
begin
  if p_prescription_item_id is null then
    raise exception 'nutrition_v2_substitution_not_authorized:missing_item' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.nutrition_item_substitutions_v2 s
    where s.prescription_item_id = p_prescription_item_id
      and (
        (p_food_id is not null and s.food_id = p_food_id)
        or (
          p_food_id is null
          and s.food_id is null
          and nullif(btrim(p_custom_name), '') is not null
          and lower(btrim(coalesce(s.custom_name, s.snapshot_name, ''))) = lower(btrim(p_custom_name))
        )
      )
  ) then
    return;
  end if;

  raise exception 'nutrition_v2_substitution_not_authorized' using errcode = '42501';
end;
$ass$;

revoke all on function private.nutrition_v2_assert_substitution_authorized(uuid, uuid, text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_assert_substitution_authorized(uuid, uuid, text) is
  'Exige que el alimento escrito con source = ''substitution'' sea un reemplazo que el coach '
  'autorizo para ESE item prescrito. Lanza nutrition_v2_substitution_not_authorized (42501). T2.4.';

-- ── (2) record_nutrition_intake_v2 + guard ───────────────────────────────────
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
as $rec$
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
  v_delegated boolean;
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

  -- NUT-009: permisos del plan. Va DESPUES del short-circuit de idempotencia a proposito.
  v_delegated := coalesce(
    nullif(current_setting('eva.nutrition_v2_delegated_correction', true), ''),
    '0'
  ) = '1';
  if not v_delegated then
    perform private.nutrition_v2_assert_intake_permission(
      p_client_id,
      p_local_date,
      p_prescription_item_id,
      p_source,
      p_meal_slot,
      p_quantity,
      true,
      false
    );
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

  -- T2.4 (UNICO DELTA de esta migracion sobre 20260728130000): la etiqueta 'substitution'
  -- no se puede mentir. Hasta aca, `record_` nunca valido ninguna relacion entre el food
  -- escrito y el item prescrito, y `authenticated` tiene EXECUTE directo por PostgREST: un
  -- guard puesto solo en la server action web o en la route movil seria cosmetico.
  --
  -- Ubicacion deliberada: DESPUES del short-circuit de idempotencia (un reintento de algo ya
  -- escrito sigue siendo no-op) y del chequeo de scope del item, y FUERA del `if not
  -- v_delegated` — una correccion delegada desde `correct_` tambien tiene que validar la
  -- autorizacion. Sin excepcion por rol: el coach que quiere otro alimento edita el plan.
  if p_source = 'substitution' then
    perform private.nutrition_v2_assert_substitution_authorized(
      p_prescription_item_id, p_food_id, p_custom_name
    );
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
$rec$;

comment on function public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) is
  'Idempotent audited V2 intake write. Legacy intake columns remain populated compatibly. '
  'p_snapshot_macros_basis (o snapshot.macrosBasis) congela la base de macros del alimento; '
  'NULL = legado y conserva la formula historica de escala (NUT-001). Impone los permisos del '
  'alumno (canRegisterFreely / canMoveMealSlot) con errcode 42501 (NUT-009). Con '
  'source = ''substitution'' exige que el alimento sea un reemplazo autorizado para ese item '
  'prescrito, tambien en la delegacion desde correct_ y tambien para el coach (T2.4).';

-- ── (3) correct_nutrition_intake_v2 + exencion del tope para sustituciones ───
create or replace function public.correct_nutrition_intake_v2(
  p_corrects_entry_id uuid,
  p_correction_reason text,
  p_client_id uuid,
  p_local_date date,
  p_occurred_at timestamp with time zone,
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
set search_path to ''
as $cor$
declare
  v_original public.nutrition_intake_entries%rowtype;
  v_new_id uuid;
  v_plan_id uuid;
  v_existing_correction uuid;
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
  -- NUT-031: idempotencia de la CORRECCION.
  select e.id into v_existing_correction
  from public.nutrition_intake_entries e
  where e.client_id = p_client_id
    and e.idempotency_key = p_idempotency_key
    and e.corrects_entry_id = v_original.id;
  if v_existing_correction is not null then
    return v_existing_correction;
  end if;

  if v_original.idempotency_key is null then
    raise exception 'nutrition_v2_legacy_entry_requires_legacy_flow' using errcode = '22023';
  end if;
  if v_original.entry_status <> 'active' then
    raise exception 'nutrition_v2_only_active_entries_can_correct' using errcode = '22023';
  end if;

  -- NUT-009: la correccion se evalua contra el vinculo del ORIGINAL.
  --
  -- T2.4 (UNICO DELTA de esta migracion): `p_check_quantity` exime a source = 'substitution'.
  -- Cambiar un alimento por un reemplazo AUTORIZADO no es "ajustar la cantidad prescrita": el
  -- tope compara `p_quantity` contra la cantidad prescrita de OTRO alimento, a veces en otra
  -- unidad (130 g de leche frente a "1 un" de yogurt = 12.900% de delta), asi que bloqueaba el
  -- cambio de alimento por una regla que no habla de eso. Medido en LIVE: 3 de las 6 versiones
  -- publicadas con reemplazos tienen canAdjustPrescribedQuantity = false, incluida la unica que
  -- ademas tiene canRegisterFreely = false. La autorizacion del reemplazo la impone
  -- `record_` con nutrition_v2_assert_substitution_authorized; el resto del guard (mover de
  -- franja) queda intacto, y una correccion NORMAL con canAdjust = false sigue fallando.
  perform private.nutrition_v2_assert_intake_permission(
    p_client_id,
    p_local_date,
    v_original.prescription_item_id,
    p_source,
    p_meal_slot,
    p_quantity,
    false,
    p_source is distinct from 'substitution'
      and p_quantity is distinct from v_original.quantity
  );

  -- La entry correctora HEREDA la vinculacion (version + item) del registro ORIGINAL.
  perform set_config('eva.nutrition_v2_delegated_correction', '1', true);
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
    v_original.plan_version_id,
    v_original.prescription_item_id,
    p_idempotency_key,
    p_note,
    p_snapshot
  );
  perform set_config('eva.nutrition_v2_delegated_correction', '0', true);

  -- La entry correctora NUNCA aporta cobertura de porciones marcadas (B3).
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

  if v_original.plan_version_id is not null then
    select plan_id into v_plan_id
    from public.nutrition_plan_versions_v2
    where id = v_original.plan_version_id;
  end if;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    v_original.plan_version_id,
    v_new_id,
    'intake.corrected',
    'nutrition_intake_entry',
    v_new_id,
    p_idempotency_key,
    jsonb_build_object('correctsEntryId', v_original.id, 'reason', btrim(p_correction_reason))
  );

  return v_new_id;
end;
$cor$;

comment on function public.correct_nutrition_intake_v2(
  uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text,
  text, uuid, uuid, text, text, jsonb
) is
  'Correccion auditada de un intake V2. La entry correctora hereda la vinculacion '
  '(version + item) del registro ORIGINAL. Reintento con la MISMA idempotency_key sobre '
  'una correccion ya aplicada devuelve el id previo en vez de 22023 (NUT-031). Impone '
  'canAdjustPrescribedQuantity + quantityAdjustmentPercent + canMoveMealSlot con errcode '
  '42501 (NUT-009), EXCEPTO el tope de cantidad cuando source = ''substitution'': cambiar de '
  'alimento autorizado no es ajustar la cantidad prescrita (T2.4). El RETIRO ya no pasa por '
  'aqui: void_nutrition_intake_v2 (NUT-010).';

-- ============================================================================
-- ROLLBACK (referencia de operacion):
--   1) re-aplicar 20260728130000 (restituye record_ y correct_ a su version previa);
--   2) drop function if exists private.nutrition_v2_assert_substitution_authorized(uuid, uuid, text);
-- ============================================================================
