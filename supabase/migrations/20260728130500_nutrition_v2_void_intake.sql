-- ============================================================================
-- EVA Nutricion V2 — NUT-010 (opcion A): "Retirar" es un estado TERMINAL
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G7): "Retirar registro" no existia como
-- gesto propio. Web y RN construian una CORRECCION de contribucion cero que conservaba
-- cantidad, unidad, franja y `prescription_item_id`, y `correct_nutrition_intake_v2`
-- insertaba un reemplazo ACTIVO. Los macros del dia SI volvian a cero (esa parte del
-- sistema era correcta), pero el resto no:
--   A. El item prescrito seguia en `consumedPrescriptionItemIds` (packages/nutrition-v2/
--      bulk-mark.ts) porque la correctora es activa y heredaba el item -> la fila del plan
--      perdia el boton "Lo comi" para siempre; la unica salida era un registro libre sin
--      vinculo, dejando la adherencia mal atribuida.
--   B. `bulkMarkSlotState` devolvia 'complete' y el medidor decia "Comida completa" sin
--      que se hubiera comido nada.
--   C. La correctora aparecia en "Consumido hoy" con sus propios botones Editar/Retirar, y
--      retirarla generaba OTRA correctora: cadena infinita sin estado terminal.
--   D. La cobertura de porciones DERIVADA sobrevivia al retiro: la rama `derivadas`
--      (20260720120000:263-283) suma `quantity / exchange_portion_grams` para entries
--      activas con `exchange_portions is null` y unidad g/ml — y la correctora cumple
--      TODAS (el RPC le fuerza `exchange_portions = null`, y conserva food_id/quantity/
--      unit). Retirar 150 g de un alimento de un grupo NO bajaba la cobertura del grupo.
--   E. `entryCount` (20260714210000:139) contaba la correctora: el coach veia
--      "1 registro · 0 kcal" despues de un retiro.
--
-- Fix: RPC dedicada `void_nutrition_intake_v2` que marca la fila `entry_status = 'voided'`
-- y NO inserta nada. Como TODOS los read models ya filtran `entry_status = 'active'`,
-- A, B, C, D y E se resuelven de una sola vez SIN tocar una linea de SQL de lectura — esa
-- es la razon principal para preferir esta opcion sobre parchear bulk-mark y `derivadas`
-- con heuristicas ("nota = Registro retirado" o "macros en cero") que confundirian un
-- retiro con una correccion legitima a 0 kcal (agua, edulcorante).
--
-- La trazabilidad NO se pierde: la correctora era el rastro del retiro y desaparece, pero
-- se emite `intake.voided` en `nutrition_v2_audit_log` con el motivo, y la fila original
-- queda en la tabla con `correction_reason` y `updated_at`.
--
-- `entry_status` YA admite 'voided' desde 20260714190000:214 (constraint
-- `nutrition_intake_entries_v2_status_check`), asi que no hay DDL de constraint que hacer.
-- Se deja un guard idempotente que lo verifica y solo recrea el check POR NOMBRE si algun
-- entorno quedo con la lista corta; nunca se edita la migracion ya aplicada.
--
-- COMPATIBILIDAD HACIA ATRAS: `correct_nutrition_intake_v2` queda INTACTO. Los retiros
-- encolados offline con el payload viejo (correccion de contribucion cero) tienen que
-- drenar por su camino al menos un ciclo de release. Y los correctores de contribucion
-- cero YA escritos en prod siguen activos: su limpieza es un backfill con GO explicito del
-- owner, propuesto en dry-run en
-- supabase/migrations/_PENDING_AUDIT_nutrition_v2_void_backfill.sql. NO se hace aqui: mover
-- lo que cuenta como activo cambia numeros de dias CERRADOS (historial y adherencia).
--
-- ADITIVA: funcion nueva + grant. Sin cambios de tablas, RLS, indices ni de las RPC vivas.
-- ROLLBACK (una pasada): `drop function if exists public.void_nutrition_intake_v2(uuid, uuid, text, text);`
-- y revertir los clientes al camino de correccion (que sigue vivo).
-- ============================================================================

-- ── 0) Verificacion idempotente del estado 'voided' en el check ──────────────
do $do$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into v_def
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.nutrition_intake_entries'::regclass
    and c.conname = 'nutrition_intake_entries_v2_status_check';

  if v_def is null then
    alter table public.nutrition_intake_entries
      add constraint nutrition_intake_entries_v2_status_check
        check (entry_status in ('active', 'corrected', 'voided'));
  elsif position('voided' in v_def) = 0 then
    -- Recreado POR NOMBRE (aditivo: la lista solo crece, ninguna fila existente deja de
    -- cumplirlo). No se edita la migracion historica.
    alter table public.nutrition_intake_entries
      drop constraint nutrition_intake_entries_v2_status_check;
    alter table public.nutrition_intake_entries
      add constraint nutrition_intake_entries_v2_status_check
        check (entry_status in ('active', 'corrected', 'voided'));
  end if;
end;
$do$;

-- ── 1) void_nutrition_intake_v2 ──────────────────────────────────────────────
create or replace function public.void_nutrition_intake_v2(
  p_client_id uuid,
  p_entry_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.nutrition_intake_entries%rowtype;
  v_plan_id uuid;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 1000 then
    raise exception 'nutrition_v2_void_reason_required' using errcode = '22023';
  end if;

  select * into v_entry
  from public.nutrition_intake_entries
  where id = p_entry_id
  for update;

  -- Misma bateria de guards que correct_nutrition_intake_v2, en el MISMO orden.
  if v_entry.id is null or v_entry.client_id <> p_client_id then
    raise exception 'nutrition_v2_original_entry_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not private.nutrition_v2_can_read_client(v_entry.client_id) then
    raise exception 'nutrition_v2_void_scope_denied' using errcode = '42501';
  end if;
  -- Gate de acceso del coach: SOLO cuando el propio alumno retira.
  if auth.uid() = p_client_id and not private.student_write_allowed(p_client_id) then
    raise exception 'coach_account_paused' using errcode = '42501';
  end if;
  if v_entry.idempotency_key is null then
    raise exception 'nutrition_v2_legacy_entry_requires_legacy_flow' using errcode = '22023';
  end if;

  -- IDEMPOTENTE POR ESTADO: doble-retiro (doble tap, replay de la cola offline, deshacer de
  -- una tanda ya deshecha) es un no-op exitoso. Preserva el comportamiento que
  -- voidSlotIntakeBatchAction lograba antes parcheando por substring del mensaje de error.
  if v_entry.entry_status = 'voided' then
    return v_entry.id;
  end if;
  if v_entry.entry_status <> 'active' then
    raise exception 'nutrition_v2_only_active_entries_can_void' using errcode = '22023';
  end if;

  -- NO se gatea por permisos del plan (NUT-009): retirar lo propio siempre se puede.
  -- Bloquearlo dejaria al alumno con un registro erroneo imborrable, peor que la regla
  -- que protegeria.
  update public.nutrition_intake_entries
  set entry_status = 'voided',
      correction_reason = btrim(p_reason),
      updated_at = now()
  where id = v_entry.id;

  if v_entry.plan_version_id is not null then
    select plan_id into v_plan_id
    from public.nutrition_plan_versions_v2
    where id = v_entry.plan_version_id;
  end if;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    v_entry.plan_version_id,
    v_entry.id,
    'intake.voided',
    'nutrition_intake_entry',
    v_entry.id,
    coalesce(nullif(btrim(p_idempotency_key), ''), 'void-' || v_entry.id::text),
    jsonb_build_object(
      'reason', btrim(p_reason),
      'prescriptionItemId', v_entry.prescription_item_id,
      'mealSlot', coalesce(v_entry.meal_slot_v2, v_entry.meal_slot)
    )
  );

  return v_entry.id;
end;
$$;

revoke all on function public.void_nutrition_intake_v2(uuid, uuid, text, text)
  from public, anon;

grant execute on function public.void_nutrition_intake_v2(uuid, uuid, text, text)
  to authenticated;

comment on function public.void_nutrition_intake_v2(uuid, uuid, text, text) is
  'Retiro TERMINAL y auditado de un intake V2: marca entry_status = voided SIN insertar '
  'ninguna entry. Los read models filtran active, asi que el registro desaparece de '
  'consumido, del bulk-mark, de la cobertura de porciones (marcadas Y derivadas) y del '
  'entryCount. Idempotente por estado: retirar dos veces devuelve el mismo id. NUT-010.';
