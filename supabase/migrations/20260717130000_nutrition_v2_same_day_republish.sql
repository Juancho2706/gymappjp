-- EVA Nutrition V2 — QUICK-EDIT (edicion fluida del plan): supersede intra-dia + guard optimista.
--
-- Motivacion (CEO 2026-07-17): "el coach deberia poder editar el plan sin mucho trabajo y muy
-- fluidamente". El quick-edit publica una VERSION NUEVA por el mismo pipeline canonico del builder
-- (draft -> persistAndPublishDraft -> publish_nutrition_plan_v2). Para que un coach pueda ajustar el
-- plan VARIAS VECES EL MISMO DIA y para blindar contra publicaciones concurrentes (web vs RN, dos
-- pestanas, coach vs colega del team), esta migracion evoluciona `public.publish_nutrition_plan_v2`:
--
--   1. NUEVA FIRMA con un 4to parametro opcional `p_expected_current_version_id` (default null).
--      Es un compare-and-swap: el llamador declara SOBRE QUE version baso su edicion. Si la version
--      vigente ya no es esa (alguien publico en medio), se rechaza con `nutrition_v2_publish_stale_base`.
--      El builder wizard NO lo envia (crea versiones "a ciegas" a proposito) -> comportamiento intacto.
--      El default hace la firma retro-compatible para TODO llamador PostgREST/SQL existente
--      (incluida `public.nutrition_v2_convert_publish`, que llama con 3 args -> resuelve al default null).
--
--   2. SUPERSEDE INTRA-DIA: el check de fecha pasa de `<=` a `<`. Antes, republicar con
--      effective_from = HOY (misma fecha que la version vigente) fallaba con
--      `nutrition_v2_effective_date_must_follow_current_version`. Ahora el MISMO dia se permite:
--      la version vigente se cierra en `greatest(effective_from, p_effective_from - 1)` para respetar
--      el CHECK `effective_to >= effective_from` (constraint nutrition_plan_versions_v2_effective_range_check).
--        - Caso normal (vigente arranco antes de hoy): effective_to = p_effective_from - 1 (identico a antes).
--        - Caso same-day (vigente arranco HOY): effective_to = effective_from -> rango degenerado [hoy, hoy].
--      Para local_date = hoy matchean la vieja Y la nueva; el desempate EXISTENTE
--      `order by effective_from desc, version_number desc` (rederive + ensure_day_snapshot + read models)
--      elige la nueva (mayor version_number). Para dias pasados sigue matcheando solo la vieja ->
--      historial inmutable. N republicaciones el mismo dia funcionan en cadena.
--      Fechas PASADAS (p_effective_from < vigente) siguen prohibidas.
--
-- 100% ADITIVA y RE-EJECUTABLE: drop de la firma vieja (3 args) + create de la nueva (4 args) +
-- re-revoke/re-grant. Sin cambios de tablas, RLS, policies, indices ni grants nuevos. Sin downtime
-- (la firma con default es retro-compatible). El rederive del snapshot de HOY y la logica de historial
-- legacy quedan EXACTAMENTE como en 20260716230000 (no se tocan aqui).
--
-- ROLLBACK (una pasada): recrear el cuerpo de 20260716230000 con la firma de 3 args
--   `public.publish_nutrition_plan_v2(uuid, date, text)` (drop de la de 4 args + create de la de 3),
--   re-revoke/re-grant. El DDL previo esta versionado en 20260716230000_nutrition_v2_same_day_plan_and_legacy_history.sql.

-- La firma cambia (nuevo parametro) -> drop de la firma vieja antes del create.
drop function if exists public.publish_nutrition_plan_v2(uuid, date, text);

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
      and s.local_date = (now() at time zone s.timezone)::date
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
  'Publishes one draft version transactionally and supersedes the previous active version. Same-day republish is allowed (supersede intra-dia): the previous version closes at greatest(effective_from, p_effective_from - 1) and the version selector desempata por version_number. Optional p_expected_current_version_id is an optimistic compare-and-swap (raises nutrition_v2_publish_stale_base on mismatch); null skips the guard. Idempotency key is scoped per plan and only honored after the scope check. A version effective on the client''s current local day re-derives that day''s snapshot (audited).';
