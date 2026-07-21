-- EVA Nutrition V2 — FIX "Retirar/Editar registro" del alumno (42501 prescription_scope_denied).
--
-- Sintoma (reportado por el CEO, evidencia en logs prod): al intentar RETIRAR un alimento que
-- marco por error, el alumno recibe "No tienes permiso para modificar este registro"
-- (SCOPE_DENIED / 42501). Tambien afecta "Editar cantidad". Los registros de comida libre
-- (prescription_item_id null) SI se pueden retirar.
--
-- Causa raiz: `correct_nutrition_intake_v2` (que crea la entry correctora del void/edit) delega
-- en `record_nutrition_intake_v2` pasando `p_plan_version_id` / `p_prescription_item_id` TAL CUAL
-- vienen del cliente. La UI del alumno arma esos campos con la version del plan de HOY
-- (context.planVersionId) pero conserva el prescription_item_id del registro ORIGINAL. Si el coach
-- re-publico / reemplazo el plan despues de que el alumno marco, la version de hoy (Y) != la version
-- del item original (X), y el guard de `record_...`:
--     (p_plan_version_id is null OR pi.version_id = p_plan_version_id)
-- falla con `nutrition_v2_prescription_scope_denied` (42501). Caracterizacion en prod: ~25 registros,
-- 3 alumnos (16 y 20 jul), justo los alumnos cuyo coach reedito el plan.
--
-- Fix: la entry correctora debe HEREDAR la vinculacion (version + item) del registro ORIGINAL, que
-- por construccion es un par internamente consistente (el original se inserto valido; verificado en
-- prod: el 100% de los intakes prescritos activos tienen pi.version_id = entry.plan_version_id). Asi
-- el guard de `record_...` siempre pasa y jamas depende de un valor stale del cliente. Ademas el audit
-- pasa a usar la version del original (metadata consistente). El caso comida libre queda igual
-- (v_original.prescription_item_id null -> el guard de item se salta, exactamente como hoy).
--
-- 100% ADITIVA / RE-EJECUTABLE: `create or replace` con la MISMA firma (sin drop). No toca tablas,
-- RLS, policies, indices ni grants. `record_nutrition_intake_v2` queda INTACTO. Sin downtime.
--
-- ROLLBACK (una pasada): re-aplicar el cuerpo previo de esta funcion (definicion viva anterior a
-- esta migracion) restaurando los args `p_plan_version_id` / `p_prescription_item_id` en la llamada
-- interna y el audit. El unico efecto de revertir es reintroducir el bug 42501; ninguna escritura de
-- datos cambia de forma.

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
