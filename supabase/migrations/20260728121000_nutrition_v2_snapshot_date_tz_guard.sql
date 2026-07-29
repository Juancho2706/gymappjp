-- ============================================================================
-- EVA Nutricion V2 — NUT-016: guard de fecha y timezone del snapshot diario
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G9):
--   · `public.ensure_nutrition_day_snapshot_v2` (20260714190500:437-456) acepta
--     CUALQUIER fecha y CUALQUIER texto de hasta 80 chars como timezone. Un GET de
--     lectura (`/api/mobile/nutrition-v2/read?view=today&date=2099-12-31`) MATERIALIZA
--     la fila: el snapshot es create-once y solo el dia local ACTUAL se re-deriva
--     (20260716230000:53-56), asi que un snapshot del futuro queda congelado con el plan
--     que existia el dia en que se creo.
--   · Peor aun, `publish_nutrition_plan_v2` (20260717130000:196-201) evalua
--     `s.local_date = (now() at time zone s.timezone)::date` sobre TODAS las filas del
--     alumno: una sola fila con timezone no reconocido lanza 22023 y ABORTA la
--     transaccion de publicacion del coach, con error opaco y sin auto-recuperacion.
--
-- Fix (ADITIVO, forward-only, solo create-or-replace de firma identica):
--   1. `private.nutrition_v2_valid_timezone(text)` — existencia en pg_timezone_names.
--   2. `private.nutrition_v2_safe_timezone(text)` — devuelve el tz si es valido,
--      'America/Santiago' si no. Sirve para blindar lecturas sobre filas YA envenenadas.
--   3. `private.nutrition_v2_ensure_day_snapshot` valida timezone + ventana de fechas
--      anclada al reloj del SERVIDOR (no al cliente): [hoy-400, hoy+1]. El +1 tolera el
--      borde de medianoche y el skew leve; el -400 permite backfill de historial de mas
--      de un ano. Errores estables: `nutrition_v2_invalid_timezone` y
--      `nutrition_v2_snapshot_date_out_of_window` (ambos 22023).
--   4. El wrapper publico repite el guard para que el error salga temprano.
--   5. `publish_nutrition_plan_v2` usa `safe_timezone` en el loop de re-derivacion, de
--      modo que una fila envenenada preexistente NUNCA vuelva a abortar una publicacion.
--
-- Esta migracion tambien incorpora el desempate determinista de NUT-004 (punto 5) en
-- `nutrition_v2_ensure_day_snapshot`, porque la recrea igual (ver 20260728120500, que
-- cubre las otras dos funciones del trio). Mantener ambos cambios juntos evita que dos
-- migraciones se pisen el mismo cuerpo.
--
-- NO limpia datos: las filas ya materializadas fuera de ventana o con timezone invalido
-- se auditan y corrigen aparte, con OK explicito del owner y snapshot previo:
--   select client_id, local_date, timezone
--   from public.nutrition_day_snapshots_v2
--   where local_date > current_date + 1
--      or timezone not in (select name from pg_catalog.pg_timezone_names);
-- Ningun DELETE va en esta migracion.
--
-- GOTCHA de test: `supabase/tests/nutrition_v2_domain_rollback.sql` usaba 2099-12-31 en
-- todo su flujo; se migro a `current_date` en el mismo PR (si no, el smoke revienta).
--
-- ROLLBACK: re-aplicar 20260728120500 (ensure sin guard, con tiebreak) o 20260714192500
-- (ensure original), 20260714190500:437-456 (wrapper) y 20260717130000:41-219 (publish).
-- ============================================================================

create or replace function private.nutrition_v2_valid_timezone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select p_tz is not null
     and exists (
       select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz
     );
$fn$;

revoke all on function private.nutrition_v2_valid_timezone(text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_valid_timezone(text) is
  'True si el texto es un timezone reconocido por esta instancia de Postgres. NUT-016.';

create or replace function private.nutrition_v2_safe_timezone(p_tz text)
returns text
language sql
stable
set search_path = ''
as $fn$
  select case
    when private.nutrition_v2_valid_timezone(p_tz) then p_tz
    else 'America/Santiago'
  end;
$fn$;

revoke all on function private.nutrition_v2_safe_timezone(text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_safe_timezone(text) is
  'Timezone tolerante para LECTURAS sobre filas historicas: cae a America/Santiago '
  'cuando el valor guardado no es reconocido, en vez de lanzar 22023. NUT-016.';

-- ── private.nutrition_v2_ensure_day_snapshot ─────────────────────────────────
--    Base VERBATIM de 20260714192500:4-110. Cambios: (a) guard de timezone + ventana
--    de fechas al inicio; (b) desempate determinista del selector (NUT-004 punto 5).
create or replace function private.nutrition_v2_ensure_day_snapshot(
  p_client_id uuid,
  p_local_date date,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_plan_id uuid;
  v_version_id uuid;
  v_strategy text;
  v_permissions jsonb := '{}'::jsonb;
  v_variant public.nutrition_day_variants_v2%rowtype;
  v_prescription jsonb := '{}'::jsonb;
begin
  -- NUT-016: timezone real + ventana de fechas anclada al reloj del SERVIDOR.
  if p_timezone is null or not private.nutrition_v2_valid_timezone(p_timezone) then
    raise exception 'nutrition_v2_invalid_timezone' using errcode = '22023';
  end if;
  if p_local_date is null
     or p_local_date > ((now() at time zone p_timezone)::date + 1)
     or p_local_date < ((now() at time zone p_timezone)::date - 400) then
    raise exception 'nutrition_v2_snapshot_date_out_of_window' using errcode = '22023';
  end if;
  select s.id into v_snapshot_id
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date;

  if v_snapshot_id is not null then
    return v_snapshot_id;
  end if;

  select p.id, v.id, v.strategy, v.student_permissions
    into v_plan_id, v_version_id, v_strategy, v_permissions
  from public.nutrition_plans_v2 p
  join public.nutrition_plan_versions_v2 v on v.plan_id = p.id
  where p.client_id = p_client_id
    and p.lifecycle_status = 'active'
    and v.status in ('published', 'superseded')
    and v.effective_from <= p_local_date
    and (v.effective_to is null or v.effective_to >= p_local_date)
  order by v.effective_from desc, v.published_at desc nulls last, v.version_number desc, v.id desc
  limit 1;

  if v_version_id is not null then
    select dv.* into v_variant
    from public.nutrition_day_variants_v2 dv
    where dv.version_id = v_version_id
      and (dv.day_of_week = extract(dow from p_local_date)::smallint or dv.is_default)
    order by
      case when dv.day_of_week = extract(dow from p_local_date)::smallint then 0 else 1 end,
      dv.order_index,
      dv.created_at
    limit 1;

    if v_variant.id is not null then
      v_prescription := coalesce(
        private.nutrition_v2_build_prescription_snapshot(v_version_id, v_variant.id),
        '{}'::jsonb
      );
    end if;
  end if;

  insert into public.nutrition_day_snapshots_v2 (
    client_id,
    local_date,
    timezone,
    plan_id,
    version_id,
    day_variant_id,
    strategy,
    target_calories,
    target_protein_g,
    target_carbs_g,
    target_fats_g,
    target_fiber_g,
    target_sodium_mg,
    target_water_ml,
    student_permissions,
    prescription_snapshot
  ) values (
    p_client_id,
    p_local_date,
    p_timezone,
    v_plan_id,
    v_version_id,
    v_variant.id,
    v_strategy,
    v_variant.target_calories,
    v_variant.target_protein_g,
    v_variant.target_carbs_g,
    v_variant.target_fats_g,
    v_variant.target_fiber_g,
    v_variant.target_sodium_mg,
    v_variant.target_water_ml,
    coalesce(v_permissions, '{}'::jsonb),
    coalesce(v_prescription, '{}'::jsonb)
  )
  on conflict (client_id, local_date) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select s.id into v_snapshot_id
    from public.nutrition_day_snapshots_v2 s
    where s.client_id = p_client_id
      and s.local_date = p_local_date;
  end if;

  return v_snapshot_id;
end;
$$;

revoke all on function private.nutrition_v2_ensure_day_snapshot(uuid, date, text)
  from public, anon, authenticated;

comment on function private.nutrition_v2_ensure_day_snapshot(uuid, date, text) is
  'Materializa (create-once) el snapshot del dia local. Valida timezone contra '
  'pg_timezone_names y acota la fecha a [hoy-400, hoy+1] segun el reloj del servidor. '
  'NUT-016 + desempate determinista de version (NUT-004).';

-- ── public.ensure_nutrition_day_snapshot_v2 (wrapper publico) ────────────────
--    Base VERBATIM de 20260714190500:437-456. Cambio: el mismo guard, para que el error
--    salga temprano y con codigo estable. El chequeo de scope se mantiene PRIMERO, para
--    no filtrar nada a un llamador sin permiso.
create or replace function public.ensure_nutrition_day_snapshot_v2(
  p_client_id uuid,
  p_local_date date,
  p_timezone text default 'America/Santiago'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_client_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_invalid_snapshot_input' using errcode = '22023';
  end if;
  if not private.nutrition_v2_valid_timezone(p_timezone) then
    raise exception 'nutrition_v2_invalid_timezone' using errcode = '22023';
  end if;
  if p_local_date > ((now() at time zone p_timezone)::date + 1)
     or p_local_date < ((now() at time zone p_timezone)::date - 400) then
    raise exception 'nutrition_v2_snapshot_date_out_of_window' using errcode = '22023';
  end if;
  return private.nutrition_v2_ensure_day_snapshot(p_client_id, p_local_date, p_timezone);
end;
$fn$;

revoke all on function public.ensure_nutrition_day_snapshot_v2(uuid, date, text) from public, anon;
grant execute on function public.ensure_nutrition_day_snapshot_v2(uuid, date, text) to authenticated;

comment on function public.ensure_nutrition_day_snapshot_v2(uuid, date, text) is
  'Wrapper publico del snapshot diario. Valida scope, timezone real y ventana de fechas '
  '[hoy-400, hoy+1] antes de materializar. NUT-016.';

-- ── public.publish_nutrition_plan_v2 ─────────────────────────────────────────
--    Base VERBATIM de 20260717130000:41-219. UNICO cambio: el loop de re-derivacion usa
--    private.nutrition_v2_safe_timezone(s.timezone) para que una fila con timezone
--    invalido preexistente no aborte la publicacion del coach (defensa en profundidad:
--    el guard de arriba solo impide filas NUEVAS).
create or replace function public.publish_nutrition_plan_v2(
  p_version_id uuid,
  p_effective_from date,
  p_idempotency_key text,
  p_expected_current_version_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version public.nutrition_plan_versions_v2%rowtype;
  v_plan public.nutrition_plans_v2%rowtype;
  v_existing_id uuid;
  v_current_id uuid;
  v_current_from date;
  v_variant_count integer;
  v_slot_count integer;
  v_snap_date date;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_auth_required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'nutrition_v2_invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'nutrition_v2_effective_date_required' using errcode = '22023';
  end if;

  select * into v_version
  from public.nutrition_plan_versions_v2
  where id = p_version_id
  for update;
  if v_version.id is null then
    raise exception 'nutrition_v2_version_not_found' using errcode = 'P0002';
  end if;

  select * into v_plan
  from public.nutrition_plans_v2
  where id = v_version.plan_id
  for update;
  if not private.nutrition_v2_can_manage_client(v_plan.client_id) then
    raise exception 'nutrition_v2_publish_scope_denied' using errcode = '42501';
  end if;

  -- Idempotent retry: only after the caller proved management scope, and only within this plan.
  -- Runs BEFORE the optimistic guard so a retry of an ALREADY-applied publish returns the existing
  -- version and can never fail stale against itself.
  select id into v_existing_id
  from public.nutrition_plan_versions_v2
  where plan_id = v_plan.id
    and publish_idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if v_version.status <> 'draft' then
    raise exception 'nutrition_v2_only_drafts_can_publish' using errcode = '22023';
  end if;

  select count(*) into v_variant_count
  from public.nutrition_day_variants_v2
  where version_id = v_version.id;
  if v_variant_count = 0 then
    raise exception 'nutrition_v2_publish_requires_variant' using errcode = '22023';
  end if;

  if v_version.strategy in ('structured', 'hybrid') then
    select count(*) into v_slot_count
    from public.nutrition_meal_slots_v2
    where version_id = v_version.id;
    if v_slot_count = 0 then
      raise exception 'nutrition_v2_publish_requires_meal_slot' using errcode = '22023';
    end if;
  end if;

  -- Current active version (locked): capture BOTH its id (for the optimistic guard) and its
  -- effective_from (for the date check + same-day supersede).
  select id, effective_from into v_current_id, v_current_from
  from public.nutrition_plan_versions_v2
  where plan_id = v_plan.id
    and status = 'published'
    and effective_to is null
    and id <> v_version.id
  for update;

  -- Optimistic concurrency (compare-and-swap): the caller declares the version its edit was based
  -- on. If the live current version differs (a concurrent publish landed in between), reject. Runs
  -- AFTER the for-update lock (no race) and AFTER the idempotent retry (a retry never reaches here).
  -- The builder wizard passes null and skips this guard entirely.
  if p_expected_current_version_id is not null
     and v_current_id is distinct from p_expected_current_version_id then
    raise exception 'nutrition_v2_publish_stale_base' using errcode = '22023';
  end if;

  -- Past effective dates stay forbidden; the SAME day is now allowed (intra-day supersede).
  if v_current_from is not null and p_effective_from < v_current_from then
    raise exception 'nutrition_v2_effective_date_must_follow_current_version' using errcode = '22023';
  end if;

  -- Supersede the previous active version. `greatest(effective_from, p_effective_from - 1)` keeps the
  -- range valid under the CHECK effective_to >= effective_from: normal case closes at yesterday
  -- (p_effective_from - 1); same-day case (vigente arranco hoy) closes at [hoy, hoy]. The existing
  -- version selector desempata por version_number desc, asi que hoy gana la nueva y los dias pasados
  -- siguen resolviendo a la vieja.
  update public.nutrition_plan_versions_v2
  set status = 'superseded',
      effective_to = greatest(effective_from, p_effective_from - 1),
      updated_by = auth.uid(),
      lock_version = lock_version + 1
  where plan_id = v_plan.id
    and status = 'published'
    and effective_to is null
    and id <> v_version.id;

  update public.nutrition_plan_versions_v2
  set status = 'published',
      effective_from = p_effective_from,
      effective_to = null,
      published_at = now(),
      published_by = auth.uid(),
      publish_idempotency_key = p_idempotency_key,
      updated_by = auth.uid(),
      lock_version = lock_version + 1
  where id = v_version.id;

  update public.nutrition_plans_v2
  set current_published_version_id = v_version.id,
      strategy = v_version.strategy,
      lifecycle_status = 'active',
      archived_at = null,
      updated_by = auth.uid()
  where id = v_plan.id;

  perform private.nutrition_v2_write_audit(
    v_plan.client_id,
    v_plan.id,
    v_version.id,
    null,
    'plan.published',
    'nutrition_plan_version_v2',
    v_version.id,
    p_idempotency_key,
    jsonb_build_object(
      'effectiveFrom', p_effective_from,
      'versionNumber', v_version.version_number,
      'sameDaySupersede', (v_current_from is not null and v_current_from = p_effective_from)
    )
  );

  -- Same-day visibility: if the published version is already effective on the client''s
  -- CURRENT local day and that day''s snapshot was frozen earlier, re-derive it so the new
  -- plan applies the same day it starts. Past days never match (local_date = today check).
  for v_snap_date in
    select s.local_date
    from public.nutrition_day_snapshots_v2 s
    where s.client_id = v_plan.client_id
      and s.local_date >= p_effective_from
      and s.local_date = (now() at time zone private.nutrition_v2_safe_timezone(s.timezone))::date
  loop
    perform private.nutrition_v2_rederive_day_snapshot(v_plan.client_id, v_snap_date);
    perform private.nutrition_v2_write_audit(
      v_plan.client_id,
      v_plan.id,
      v_version.id,
      null,
      'day_snapshot.rederived',
      'nutrition_day_snapshot_v2',
      null,
      p_idempotency_key || ':rederive:' || v_snap_date,
      jsonb_build_object('localDate', v_snap_date, 'effectiveFrom', p_effective_from)
    );
  end loop;

  return v_version.id;
end;
$$;

revoke all on function public.publish_nutrition_plan_v2(uuid, date, text, uuid) from public, anon;
grant execute on function public.publish_nutrition_plan_v2(uuid, date, text, uuid) to authenticated;

comment on function public.publish_nutrition_plan_v2(uuid, date, text, uuid) is
  'Publishes one draft version transactionally and supersedes the previous active version. '
  'Same-day republish is allowed (supersede intra-dia). Optional p_expected_current_version_id '
  'is an optimistic compare-and-swap. Idempotency key is scoped per plan. La re-derivacion '
  'del dia actual tolera timezones invalidos guardados (private.nutrition_v2_safe_timezone) '
  'para no abortar la publicacion — NUT-016.';
