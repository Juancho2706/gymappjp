-- ============================================================================
-- EVA Nutricion V2 — NUT-009: los permisos del alumno se IMPONEN en el boundary
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G7): `student_permissions` del plan
-- (canRegisterFreely, canAdjustPrescribedQuantity + quantityAdjustmentPercent,
-- canMoveMealSlot) nunca goberno una escritura. Grep sobre TODAS las migraciones: 18 usos
-- de `student_permissions` y ninguno como predicado de autorizacion — solo definicion de
-- columna, escritura al publicar/snapshotear y LECTURA en los read models. La UI mostraba
-- el chip "Solo alimentos prescritos" y a la vez el boton "Registrar alimento": cualquier
-- alumno normal rompia la regla sin enterarse. No es un exploit (el scope sigue siendo
-- self, `auth.uid() = p_client_id`), es una feature vendida al coach que no funcionaba.
--
-- Que hace esta migracion (100% ADITIVA, forward-only):
--   1. private.nutrition_v2_effective_permissions(client, date): merge de defaults con
--      la MISMA expresion que el read model
--      (`nutrition_v2_default_permissions() || coalesce(student_permissions,'{}')`,
--      20260720120000:174-175). *** ESTE MERGE ES OBLIGATORIO ***: miles de dias
--      historicos tienen `student_permissions = '{}'` y sin el default pasarian a tener
--      TODO en false, bloqueando escrituras que hoy funcionan. Si el dia aun no tiene
--      snapshot congelado, cae a la version vigente del plan con el MISMO selector
--      determinista de `nutrition_v2_ensure_day_snapshot` (20260728121000:126-136); si no
--      hay plan, defaults puros (permisivos).
--   2. private.nutrition_v2_prescribed_ref(item): cantidad/unidad/franja PRESCRITAS del
--      item, que son la referencia del tope de % y de "mover de franja".
--   3. public.get_nutrition_student_permissions_v2(client, date, item): lectura para los
--      clientes (server action web + gateway movil), que aplican la misma regla ANTES de
--      escribir para devolver un error tipado con copy humano. NO crea snapshot.
--   4. record_nutrition_intake_v2: guard de `canRegisterFreely` (registro LIBRE) y
--      `canMoveMealSlot` (item del plan en otra franja).
--   5. correct_nutrition_intake_v2: guard de `canAdjustPrescribedQuantity` + tope
--      `quantityAdjustmentPercent` + `canMoveMealSlot`, y marca la delegacion en record_.
--
-- Alcance DELIBERADO de cada regla (por que NO es mas amplio):
--   · Registro libre = `p_source = 'offplan'` Y `p_prescription_item_id is null`. El
--     sintetico de marcar-porcion manda `source = 'prescription'`, asi que queda EXENTO
--     por SPEC R1 (docs/archive/specs/nutrition-portions/SPEC.md:118-124: la libertad de
--     elegir DENTRO del grupo la da el propio target). El deshacer-porcion manda
--     `source = 'manual'`: tambien exento.
--   · Ajuste de cantidad = SOLO entries con `prescription_item_id` (es literalmente
--     "ajustar la cantidad PRESCRITA"). Un alimento libre ya registrado se corrige
--     siempre: bloquearlo dejaria al alumno con un numero erroneo imborrable.
--   · Retirar NO se gatea en ningun caso (RPC `void_nutrition_intake_v2`, 20260728130500).
--   · El guard SOLO corre cuando `auth.uid() = p_client_id`. El coach escribiendo sobre su
--     alumno no esta sujeto a los permisos que el mismo definio.
--
-- NO INCLUIDO (deuda declarada, NO se cuela aqui): el recomputo server-side de los macros
-- desde `public.foods` ignorando el snapshot del cliente. Depende de NUT-001 (base de
-- escala) ya aplicado en 20260728120000 pero exige re-verificar el historial completo; el
-- modelo de confianza S2 (self-report) sigue documentado en
-- apps/web/.../nutrition-v2/_actions/intake.actions.ts. Queda para una ola posterior.
--
-- ADITIVA: `create or replace` con la MISMA firma en las dos RPC (17 y 18 args, tal como
-- quedaron en 20260728120000 y 20260728122000). Sin drop, sin cambios de tablas, RLS,
-- indices ni grants de las funciones existentes.
-- ROLLBACK (una pasada): re-aplicar 20260728120000 (record_) y 20260728122000 (correct_).
-- Las funciones nuevas pueden quedarse (nadie mas las llama).
-- ============================================================================

-- ── 1) Permisos efectivos del dia (merge IDENTICO al del read model) ─────────
create or replace function private.nutrition_v2_effective_permissions(
  p_client_id uuid,
  p_local_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
  v_found boolean := false;
begin
  select s.student_permissions, true into v_raw, v_found
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date;

  if not v_found then
    -- El dia todavia no tiene snapshot congelado (el alumno escribe antes de abrir "Hoy").
    -- Mismo selector determinista que private.nutrition_v2_ensure_day_snapshot.
    select v.student_permissions into v_raw
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

  return private.nutrition_v2_default_permissions() || coalesce(v_raw, '{}'::jsonb);
end;
$$;

revoke all on function private.nutrition_v2_effective_permissions(uuid, date)
  from public, anon, authenticated;

comment on function private.nutrition_v2_effective_permissions(uuid, date) is
  'Permisos del alumno vigentes para un dia: defaults || snapshot del dia (o, sin snapshot, '
  'la version vigente del plan). El merge con los defaults es OBLIGATORIO: sin el, los dias '
  'historicos con student_permissions = {} bloquearian toda escritura. NUT-009.';

-- ── 2) Referencia prescrita del item (cantidad / unidad / franja) ────────────
create or replace function private.nutrition_v2_prescribed_ref(
  p_prescription_item_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'quantity', pi.quantity,
    'unit', pi.unit,
    'mealSlot', ms.slot_code
  )
  from public.nutrition_prescription_items_v2 pi
  join public.nutrition_meal_slots_v2 ms on ms.id = pi.meal_slot_id
  where pi.id = p_prescription_item_id;
$$;

revoke all on function private.nutrition_v2_prescribed_ref(uuid)
  from public, anon, authenticated;

comment on function private.nutrition_v2_prescribed_ref(uuid) is
  'Cantidad/unidad/franja PRESCRITAS de un item: referencia del tope de ajuste y del guard '
  'de "mover de franja". NULL si el item no existe. NUT-009.';

-- ── 3) Lectura para los clientes (defensa en profundidad + copy honesto) ─────
create or replace function public.get_nutrition_student_permissions_v2(
  p_client_id uuid,
  p_local_date date,
  p_prescription_item_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_permissions_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null then
    raise exception 'nutrition_v2_permissions_invalid_input' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'permissions', private.nutrition_v2_effective_permissions(p_client_id, p_local_date),
    'prescribed', case
      when p_prescription_item_id is null then null
      else private.nutrition_v2_prescribed_ref(p_prescription_item_id)
    end
  );
end;
$$;

revoke all on function public.get_nutrition_student_permissions_v2(uuid, date, uuid)
  from public, anon;

grant execute on function public.get_nutrition_student_permissions_v2(uuid, date, uuid)
  to authenticated;

comment on function public.get_nutrition_student_permissions_v2(uuid, date, uuid) is
  'Permisos del alumno vigentes para un dia (+ la referencia prescrita del item, opcional). '
  'Solo LECTURA: no congela snapshot. La usan la server action web y el gateway movil para '
  'rechazar el gesto con un codigo tipado antes de intentar la escritura. NUT-009.';

-- ── 4) Guard compartido de permisos ──────────────────────────────────────────
--    Una sola implementacion para las dos RPC de escritura: si divergen, el bug vuelve.
create or replace function private.nutrition_v2_assert_intake_permission(
  p_client_id uuid,
  p_local_date date,
  p_prescription_item_id uuid,
  p_source text,
  p_meal_slot text,
  p_quantity numeric,
  p_check_free_registration boolean,
  p_check_quantity boolean
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perms jsonb;
  v_ref jsonb;
  v_prescribed_quantity numeric;
  v_prescribed_slot text;
  v_percent numeric;
  v_slot text;
begin
  -- El coach escribiendo sobre su alumno NO esta sujeto a los permisos que el definio.
  if auth.uid() is distinct from p_client_id then
    return;
  end if;

  v_perms := private.nutrition_v2_effective_permissions(p_client_id, p_local_date);

  -- (a) Registro LIBRE: solo el intake fuera del plan. El sintetico de porciones
  --     (source = 'prescription') y el deshacer (source = 'manual') quedan exentos.
  if p_check_free_registration
     and p_prescription_item_id is null
     and p_source = 'offplan'
     and coalesce((v_perms ->> 'canRegisterFreely')::boolean, true) is not true then
    raise exception 'nutrition_v2_permission_denied:free_registration' using errcode = '42501';
  end if;

  if p_prescription_item_id is null then
    return;
  end if;

  v_ref := private.nutrition_v2_prescribed_ref(p_prescription_item_id);
  v_prescribed_quantity := nullif(v_ref ->> 'quantity', '')::numeric;
  v_prescribed_slot := nullif(btrim(v_ref ->> 'mealSlot'), '');

  -- (b) Ajuste de cantidad PRESCRITA (+ tope opcional en %).
  if p_check_quantity then
    if coalesce((v_perms ->> 'canAdjustPrescribedQuantity')::boolean, true) is not true then
      raise exception 'nutrition_v2_permission_denied:quantity_adjustment' using errcode = '42501';
    end if;
    v_percent := nullif(v_perms ->> 'quantityAdjustmentPercent', '')::numeric;
    if v_percent is not null
       and v_prescribed_quantity is not null
       and v_prescribed_quantity > 0
       and abs(coalesce(p_quantity, 0) - v_prescribed_quantity) / v_prescribed_quantity
           > v_percent / 100 + 1e-9 then
      raise exception 'nutrition_v2_permission_denied:quantity_adjustment_range' using errcode = '42501';
    end if;
  end if;

  -- (c) Mover un item del plan a otra franja. Sin franja declarada (o sin franja prescrita
  --     conocida) no hay con que comparar: no se inventa una restriccion.
  v_slot := nullif(btrim(p_meal_slot), '');
  if v_slot is not null
     and v_prescribed_slot is not null
     and v_slot is distinct from v_prescribed_slot
     and coalesce((v_perms ->> 'canMoveMealSlot')::boolean, false) is not true then
    raise exception 'nutrition_v2_permission_denied:meal_slot_move' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.nutrition_v2_assert_intake_permission(
  uuid, date, uuid, text, text, numeric, boolean, boolean
) from public, anon, authenticated;

comment on function private.nutrition_v2_assert_intake_permission(
  uuid, date, uuid, text, text, numeric, boolean, boolean
) is
  'Guard unico de los permisos del alumno para escrituras de intake. Lanza '
  'nutrition_v2_permission_denied:<regla> con errcode 42501. No corre para el coach. NUT-009.';

-- ── 5) record_nutrition_intake_v2 + guard ────────────────────────────────────
--    Base copiada VERBATIM de 20260728120000:262-473 (definicion viva). UNICO cambio: el
--    bloque de guard, colocado JUSTO DESPUES del short-circuit de idempotencia — una key
--    repetida ya escrita no re-evalua permisos (la escritura ya ocurrio y devolver el id
--    previo tiene que seguir siendo un no-op, o la cola offline mataria en dead-letter una
--    operacion que SI se aplico).
--
--    Delegacion desde correct_: `correct_nutrition_intake_v2` marca la transaccion con
--    `eva.nutrition_v2_delegated_correction = '1'` antes de llamar aqui. Sin esa marca, una
--    correccion de un alimento LIBRE (que conserva source='offplan' y prescription_item_id
--    null del original) chocaria contra `canRegisterFreely` y el alumno quedaria sin poder
--    arreglar ni ese registro. La marca es LOCAL a la transaccion (`set_config(..., true)`),
--    no es un parametro del RPC — asi ningun cliente puede activarla desde PostgREST.
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

  -- NUT-009: permisos del plan. Va DESPUES del short-circuit de idempotencia a proposito: un
  -- reintento del MISMO gesto ya escrito debe seguir devolviendo el id previo aunque el coach
  -- haya endurecido los permisos entremedio (si no, la cola offline reintentaria y moriria en
  -- dead-letter una operacion que YA se aplico). `p_check_quantity` en false: un registro nuevo
  -- no es un ajuste de lo prescrito — "Lo comi" manda exactamente la cantidad del item.
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

comment on function public.record_nutrition_intake_v2(
  uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text,
  uuid, uuid, text, text, jsonb, text
) is
  'Idempotent audited V2 intake write. Legacy intake columns remain populated compatibly. '
  'p_snapshot_macros_basis (o snapshot.macrosBasis) congela la base de macros del alimento; '
  'NULL = legado y conserva la formula historica de escala (NUT-001). Impone los permisos del '
  'alumno (canRegisterFreely / canMoveMealSlot) con errcode 42501 (NUT-009).';

-- ── 6) correct_nutrition_intake_v2 + guard ───────────────────────────────────
--    Base copiada VERBATIM de 20260728122000:33-163 (definicion viva). Cambios:
--      · guard de permisos (ajuste de cantidad prescrita + tope + mover de franja) DESPUES
--        del short-circuit de idempotencia (NUT-031) y del chequeo de entry_status: un
--        reintento de algo YA aplicado sigue devolviendo el id previo aunque el coach haya
--        endurecido los permisos entremedio;
--      · marca `eva.nutrition_v2_delegated_correction` alrededor de la delegacion, para que
--        record_ no vuelva a evaluar `canRegisterFreely` sobre una correccion.
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
as $function$
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
  -- NUT-031: idempotencia de la CORRECCION. Si esta misma operacion (misma key) ya se
  -- aplico sobre ESTE original, devolver el id previo en vez de fallar por "original ya
  -- corregido". Va DESPUES del scope y del gate de pausa (no filtra existencia a nadie
  -- sin permiso) y ANTES del chequeo de entry_status (que es el que rompe el retry).
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

  -- NUT-009: la correccion se evalua contra el vinculo del ORIGINAL (que es el que manda,
  -- igual que la herencia de version/item de mas abajo). `p_check_free_registration` va en
  -- false: corregir un alimento libre YA registrado no es "registrar libre".
  perform private.nutrition_v2_assert_intake_permission(
    p_client_id,
    p_local_date,
    v_original.prescription_item_id,
    p_source,
    p_meal_slot,
    p_quantity,
    false,
    p_quantity is distinct from v_original.quantity
  );

  -- FIX: la entry correctora HEREDA la vinculacion (version + item) del registro ORIGINAL, no la
  -- que envia el cliente (que puede traer la version de HOY con el item de una version anterior si
  -- el coach re-publico el plan). El par del original es internamente consistente por construccion,
  -- asi que el guard `pi.version_id = p_plan_version_id` de record_ jamas falla. Comida libre:
  -- v_original.prescription_item_id null -> el guard se salta, identico a hoy.
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

  -- Audit con la version del registro ORIGINAL (consistente con la entry correctora heredada).
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
$function$;

comment on function public.correct_nutrition_intake_v2(
  uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text,
  text, uuid, uuid, text, text, jsonb
) is
  'Correccion auditada de un intake V2. La entry correctora hereda la vinculacion '
  '(version + item) del registro ORIGINAL. Reintento con la MISMA idempotency_key sobre '
  'una correccion ya aplicada devuelve el id previo en vez de 22023 (NUT-031). Impone '
  'canAdjustPrescribedQuantity + quantityAdjustmentPercent + canMoveMealSlot con errcode '
  '42501 (NUT-009). El RETIRO ya no pasa por aqui: void_nutrition_intake_v2 (NUT-010).';
