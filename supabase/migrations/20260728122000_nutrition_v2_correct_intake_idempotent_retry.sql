-- ============================================================================
-- EVA Nutricion V2 — NUT-031: el retry de una correccion ya aplicada es idempotente
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G9): en
-- `public.correct_nutrition_intake_v2` el chequeo `v_original.entry_status <> 'active'`
-- (20260721130000:85-87) corre ANTES del lookup por `idempotency_key`, que vive dentro de
-- `record_nutrition_intake_v2` (20260714190500:643-649). Como una correccion exitosa deja
-- el original en `corrected`, cualquier reintento con la MISMA key sobre una correccion
-- que YA se aplico levanta 22023 en vez de devolver el id previo. El gateway mobile mapea
-- 22023 a HTTP 500 (`_shared.ts:209-219`), la cola RN lo considera reintentable
-- (`nutrition-v2-offline.ts`), y gasta 8 intentos (~8,5 min) para terminar en dead-letter
-- pese a que la operacion SI se aplico. El equipo ya habia parcheado el sintoma en UNA
-- sola superficie (`voidSlotIntakeBatchAction`, por substring de mensaje).
--
-- Fix: short-circuit de idempotencia DENTRO de la RPC, insertado justo despues del gate
-- de pausa y ANTES del chequeo de `entry_status`. Orden final:
--   lock -> not-found/ownership -> scope -> gate de pausa -> IDEMPOTENCIA -> legacy ->
--   entry_status <> 'active' -> delegacion en record_.
-- El filtro `corrects_entry_id = v_original.id` es clave: garantiza que la key reutilizada
-- corresponde a ESTA correccion y no a un `record_` distinto que casualmente la comparta.
-- Es seguro porque `corrects_entry_id` se setea en la MISMA transaccion que crea la entry
-- (20260721130000:115-119), asi que no hay estado intermedio observable.
--
-- `record_nutrition_intake_v2` queda INTACTO (su idempotencia sigue siendo la red del
-- camino de registro). Sin cambios de tablas, RLS, indices ni grants.
--
-- Contrato observable: la RPC pasa de LANZAR a RETORNAR en ese caso. Hay tests y un
-- parche de cliente que asumen el lanzamiento; se ajustan en el mismo PR.
--
-- ADITIVA: `create or replace` con la MISMA firma de 18 args (sin drop).
-- ROLLBACK (una pasada): re-aplicar 20260721130000.
-- ============================================================================
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

  -- FIX: la entry correctora HEREDA la vinculacion (version + item) del registro ORIGINAL, no la
  -- que envia el cliente (que puede traer la version de HOY con el item de una version anterior si
  -- el coach re-publico el plan). El par del original es internamente consistente por construccion,
  -- asi que el guard `pi.version_id = p_plan_version_id` de record_ jamas falla. Comida libre:
  -- v_original.prescription_item_id null -> el guard se salta, identico a hoy.
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

revoke all on function public.correct_nutrition_intake_v2(
  uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text,
  text, uuid, uuid, text, text, jsonb
) from public, anon;

grant execute on function public.correct_nutrition_intake_v2(
  uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text,
  text, uuid, uuid, text, text, jsonb
) to authenticated;

comment on function public.correct_nutrition_intake_v2(
  uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text,
  text, uuid, uuid, text, text, jsonb
) is
  'Correccion/void auditado de un intake V2. La entry correctora hereda la vinculacion '
  '(version + item) del registro ORIGINAL. Reintento con la MISMA idempotency_key sobre '
  'una correccion ya aplicada devuelve el id previo en vez de 22023 — NUT-031.';
