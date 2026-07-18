-- ============================================================================
-- EVA — Gate de acceso del ALUMNO segun la suscripcion del COACH (defensa en DB)
-- ----------------------------------------------------------------------------
-- POLITICA (CEO 2026-07-18):
--   Un alumno puede ESCRIBIR (registrar sets / check-ins / nutricion) si su coach
--   tiene acceso efectivo (espejo FIEL de hasEffectiveAccess en
--   apps/web/src/lib/coach-subscription-gate.ts:17-44 — incluye org_managed /
--   team_managed y la gracia hasta current_period_end de canceled/trialing/
--   paused/past_due) O si esta dentro de una GRACIA de 7 dias contados DESDE el
--   fin del periodo pagado. La lectura (SELECT: plan/historial/rachas) NUNCA se
--   bloquea: post-gracia el alumno queda en SOLO-LECTURA, jamas 404, jamas se
--   borran datos.
--
-- POR QUE EN LA DB: RN habla PostgREST directo (RLS) y las RPCs V2 son
--   SECURITY DEFINER; ninguna barrera de app (proxy/layout/actions) intercepta
--   esos caminos (ver LENTE B). El gate correcto vive aqui. Las capas de UI
--   (proxy /c, RN, banner) son el MENSAJE al alumno, no el candado del dato.
--
-- KILL-SWITCH: la clave Edge Config STUDENT_ACCESS_GATE (default ausente = gate
--   ACTIVO; 'false' = apagado) SOLO afecta las capas de UI/actions. La RLS y las
--   RPCs de esta migracion NO leen Edge Config: el candado de datos permanece
--   siempre activo por diseno (documentado). Apagar el gate desde Edge Config
--   silencia banners/redirects pero no reabre la escritura directa.
--
-- ANCLA DETERMINISTA (paid_access_ended_at):
--   El flujo terminal de refund/chargeback NULLea current_period_end al expirar
--   (apps/web/src/lib/payments/webhook-pipeline.ts:983 — 'expired',
--   current_period_end=null). Sin ancla, la gracia de 7 dias no tendria fecha.
--   Se agrega coaches.paid_access_ended_at: TODOS los caminos de expiracion
--   (webhook terminal citado; cron paid-expiry apps/web/src/lib/payments/
--   paid-expiry.ts — deja status 'active' con current_period_end vencido, que ya
--   sirve de ancla; admin coach-actions.ts) deben setearlo con el period_end
--   vigente al momento del corte, y la reactivacion debe limpiarlo (=null). El
--   seteo/limpieza en esos flujos de APP se hace en su propio job (fuera de esta
--   migracion, que es SOLO aditiva de schema). La gracia ancla en
--   coalesce(paid_access_ended_at, current_period_end).
--
-- BACKFILL joaquinamr7 (correr por separado; su current_period_end real quedo
--   NULL por el espejo manual del incidente 2026-07-16, se usa la hora del corte):
--   update public.coaches
--      set paid_access_ended_at = '2026-07-16T04:21:00Z'::timestamptz
--    where lower(coalesce(invite_code, slug)) = 'joaquinamr7'
--      and paid_access_ended_at is null;
--
-- ROLLBACK (una pasada):
--   drop policy if exists student_write_gate_ins_workout_logs on public.workout_logs;
--   drop policy if exists student_write_gate_upd_workout_logs on public.workout_logs;
--   drop policy if exists student_write_gate_ins_check_ins on public.check_ins;
--   drop policy if exists student_write_gate_upd_check_ins on public.check_ins;
--   drop policy if exists student_write_gate_ins_daily_nutrition_logs on public.daily_nutrition_logs;
--   drop policy if exists student_write_gate_upd_daily_nutrition_logs on public.daily_nutrition_logs;
--   drop policy if exists student_write_gate_ins_nutrition_meal_logs on public.nutrition_meal_logs;
--   drop policy if exists student_write_gate_upd_nutrition_meal_logs on public.nutrition_meal_logs;
--   drop function if exists private.student_write_allowed(uuid);
--   drop function if exists private.coach_has_effective_access(text, timestamptz);
--   alter table public.coaches drop column if exists paid_access_ended_at;
--   -- y re-aplicar record_/correct_nutrition_intake_v2 desde
--   -- 20260714190500_nutrition_v2_security_rpc.sql (versiones SIN el guard).
-- ============================================================================

-- 1) Columna ancla aditiva (idempotente). ------------------------------------
alter table public.coaches
  add column if not exists paid_access_ended_at timestamptz;

comment on column public.coaches.paid_access_ended_at is
  'Fin del periodo PAGADO vigente al momento del corte de suscripcion. Ancla de la '
  'gracia de 7 dias del alumno cuando current_period_end se NULLea al expirar '
  '(webhook terminal). La reactivacion debe limpiarla (=null).';

-- 2) Espejo FIEL de hasEffectiveAccess (coach-subscription-gate.ts:17-44). ----
--    STABLE: usa now() para la ventana de gracia hasta current_period_end.
create or replace function private.coach_has_effective_access(
  p_status text,
  p_period_end timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    -- isManagedSubscription(status): org/team gestionan el plan -> acceso siempre.
    when p_status in ('org_managed', 'team_managed') then true
    -- Gracia hasta current_period_end: cancel voluntario, trial y dunning
    -- involuntario (paused/past_due). Sin fecha -> sin acceso (mirror: !cpe => false).
    when coalesce(p_status, '') in ('canceled', 'trialing', 'paused', 'past_due') then
      (p_period_end is not null and p_period_end > now())
    -- Estados duros SIN gracia (SUBSCRIPTION_BLOCKED_STATUSES; past_due/paused ya
    -- resueltos arriba): bloqueo inmediato.
    when coalesce(p_status, '') in ('pending_payment', 'expired', 'past_due', 'paused') then false
    -- active / free(=active) / cualquier otro no bloqueante -> acceso.
    else true
  end;
$$;

-- 3) Gate de escritura del alumno: barato (2 lookups por PK), camino caliente. -
--    Devuelve true (permite) por defecto cuando no hay coach resoluble o cuando
--    no hay fecha-ancla para computar la gracia (fail-open: NUNCA romper de mas).
--    Solo bloquea cuando el coach carece POSITIVAMENTE de acceso efectivo Y la
--    gracia de 7 dias desde el fin del periodo pagado ya expiro.
create or replace function private.student_write_allowed(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      private.coach_has_effective_access(co.subscription_status, co.current_period_end)
      or now() < coalesce(co.paid_access_ended_at, co.current_period_end) + interval '7 days'
    from public.clients cl
    join public.coaches co on co.id = cl.coach_id
    where cl.id = p_client_id
  ), true);
$$;

comment on function private.student_write_allowed(uuid) is
  'true si el alumno p_client_id puede ESCRIBIR: coach con acceso efectivo (espejo '
  'de hasEffectiveAccess) o dentro de la gracia de 7 dias desde coalesce('
  'paid_access_ended_at, current_period_end). Fail-open si no hay coach o ancla.';

revoke all on function private.coach_has_effective_access(text, timestamptz) from public, anon;
revoke all on function private.student_write_allowed(uuid) from public, anon;
grant execute on function private.coach_has_effective_access(text, timestamptz) to authenticated;
grant execute on function private.student_write_allowed(uuid) to authenticated;

-- 4) Policies RESTRICTIVAS de escritura del alumno. --------------------------
--    Se usan RESTRICTIVE (AND) porque estas tablas tienen VARIAS policies
--    permisivas del alumno que la RLS combina con OR (p.ej. workout_logs:
--    "Client can manage their own workout logs" baseline:2489, "client_manage_logs"
--    baseline:2845, "workout_logs_client" baseline:3347). Sumar el gate a una sola
--    filtraria por las otras. Una RESTRICTIVE FOR INSERT/UPDATE se ANDea a TODAS,
--    sin tocar SELECT (solo-lectura intacta) ni las policies del coach/service:
--    la condicion "no soy el alumno auto-escribiendo, O tengo permiso" deja pasar
--    al coach (client_id <> auth.uid()) y al service_role (BYPASSRLS, y estas son
--    TO authenticated). DELETE queda como estaba (fuera del gate).

-- workout_logs (client_id directo).
drop policy if exists student_write_gate_ins_workout_logs on public.workout_logs;
create policy student_write_gate_ins_workout_logs
  on public.workout_logs
  as restrictive
  for insert
  to authenticated
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

drop policy if exists student_write_gate_upd_workout_logs on public.workout_logs;
create policy student_write_gate_upd_workout_logs
  on public.workout_logs
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

-- check_ins (client_id directo).
drop policy if exists student_write_gate_ins_check_ins on public.check_ins;
create policy student_write_gate_ins_check_ins
  on public.check_ins
  as restrictive
  for insert
  to authenticated
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

drop policy if exists student_write_gate_upd_check_ins on public.check_ins;
create policy student_write_gate_upd_check_ins
  on public.check_ins
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

-- daily_nutrition_logs (client_id directo).
drop policy if exists student_write_gate_ins_daily_nutrition_logs on public.daily_nutrition_logs;
create policy student_write_gate_ins_daily_nutrition_logs
  on public.daily_nutrition_logs
  as restrictive
  for insert
  to authenticated
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

drop policy if exists student_write_gate_upd_daily_nutrition_logs on public.daily_nutrition_logs;
create policy student_write_gate_upd_daily_nutrition_logs
  on public.daily_nutrition_logs
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    client_id <> (select auth.uid())
    or private.student_write_allowed(client_id)
  );

-- nutrition_meal_logs (sin client_id: se resuelve via daily_log_id ->
-- daily_nutrition_logs.client_id). El alumno auto-escribe filas cuyo daily_log es
-- suyo (d.client_id = auth.uid()); ese caso exige permiso. El coach (d.client_id
-- <> auth.uid()) pasa por el NOT EXISTS.
drop policy if exists student_write_gate_ins_nutrition_meal_logs on public.nutrition_meal_logs;
create policy student_write_gate_ins_nutrition_meal_logs
  on public.nutrition_meal_logs
  as restrictive
  for insert
  to authenticated
  with check (
    not exists (
      select 1 from public.daily_nutrition_logs d
      where d.id = nutrition_meal_logs.daily_log_id
        and d.client_id = (select auth.uid())
    )
    or private.student_write_allowed((select auth.uid()))
  );

drop policy if exists student_write_gate_upd_nutrition_meal_logs on public.nutrition_meal_logs;
create policy student_write_gate_upd_nutrition_meal_logs
  on public.nutrition_meal_logs
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    not exists (
      select 1 from public.daily_nutrition_logs d
      where d.id = nutrition_meal_logs.daily_log_id
        and d.client_id = (select auth.uid())
    )
    or private.student_write_allowed((select auth.uid()))
  );

-- 5) RPCs V2: mismo cuerpo 1:1 de 20260714190500_nutrition_v2_security_rpc.sql,
--    con UN solo agregado: si quien llama es el ALUMNO (auth.uid() = client) y su
--    coach no habilita escritura -> error tipado 42501 'coach_account_paused'.
--    El coach registrando por su alumno (auth.uid() <> client) y el service_role
--    (auth.uid() null) NO se bloquean. Firma identica => CREATE OR REPLACE sin
--    drop (no hay cambio de firma; no aplica la leccion del overload).

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

  update public.nutrition_intake_entries
  set corrects_entry_id = v_original.id,
      revision = v_original.revision + 1
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
