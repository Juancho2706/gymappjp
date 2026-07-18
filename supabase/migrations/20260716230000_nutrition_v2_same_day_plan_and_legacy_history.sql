-- EVA Nutrition V2 — two product decisions from CEO QA round 4 (2026-07-16):
--
-- 1. SAME-DAY PLAN VISIBILITY. The daily snapshot freezes on first read; a plan published
--    later that same day (effective_from = today) stayed invisible until tomorrow, which
--    reads as broken to coach and student. New rule: publishing a version whose effectivity
--    covers the client's CURRENT local day re-derives that day's snapshot (and only that
--    day — past days remain immutable history; future snapshots don't exist by design).
--    Implemented as a private helper + a hook at the end of publish_nutrition_plan_v2,
--    audited per re-derived day. Intake already recorded that day is untouched (entries
--    reference the snapshot by id; only plan/targets/prescription columns are recomputed).
--
-- 2. LEGACY HISTORY DATA. History days from the classic system rendered as bare
--    "Historial anterior" with no data. V1 rows in nutrition_intake_entries
--    (idempotency_key IS NULL) carry per-entry macro snapshots, and completed meals live in
--    nutrition_meal_logs → nutrition_meals. get_nutrition_history_page_v2 now exposes, per
--    day: legacyEntryCount, legacyConsumed (summed V1 macros) and legacyMeals (names of
--    completed meals), and the candidate-date union also considers V1 intake dates.
--    Additive read-model fields only — V2 canonical totals stay V2-only.
--
-- Additive, CREATE OR REPLACE only. No RLS/grant changes beyond idempotent re-assertions.

-- ── 1a. Helper: re-derive one CURRENT-day snapshot from the live effective version ─────────────

create or replace function private.nutrition_v2_rederive_day_snapshot(
  p_client_id uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.nutrition_day_snapshots_v2%rowtype;
  v_plan_id uuid;
  v_version_id uuid;
  v_strategy text;
  v_permissions jsonb := '{}'::jsonb;
  v_variant public.nutrition_day_variants_v2%rowtype;
  v_prescription jsonb := '{}'::jsonb;
begin
  select s.* into v_snapshot
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date
  for update;

  if v_snapshot.id is null then
    -- Nothing materialized yet: the next read derives fresh via ensure_day_snapshot.
    return;
  end if;

  -- Only the client's CURRENT local day (in the snapshot's own timezone) may be re-derived.
  if v_snapshot.local_date <> (now() at time zone v_snapshot.timezone)::date then
    return;
  end if;

  -- Same live selection as private.nutrition_v2_ensure_day_snapshot.
  select p.id, v.id, v.strategy, v.student_permissions
    into v_plan_id, v_version_id, v_strategy, v_permissions
  from public.nutrition_plans_v2 p
  join public.nutrition_plan_versions_v2 v on v.plan_id = p.id
  where p.client_id = p_client_id
    and p.lifecycle_status = 'active'
    and v.status in ('published', 'superseded')
    and v.effective_from <= p_local_date
    and (v.effective_to is null or v.effective_to >= p_local_date)
  order by v.effective_from desc, v.version_number desc
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

  update public.nutrition_day_snapshots_v2
  set plan_id = v_plan_id,
      version_id = v_version_id,
      day_variant_id = v_variant.id,
      strategy = v_strategy,
      target_calories = v_variant.target_calories,
      target_protein_g = v_variant.target_protein_g,
      target_carbs_g = v_variant.target_carbs_g,
      target_fats_g = v_variant.target_fats_g,
      target_fiber_g = v_variant.target_fiber_g,
      target_sodium_mg = v_variant.target_sodium_mg,
      target_water_ml = v_variant.target_water_ml,
      student_permissions = coalesce(v_permissions, '{}'::jsonb),
      prescription_snapshot = coalesce(v_prescription, '{}'::jsonb)
  where id = v_snapshot.id;
end;
$$;

revoke all on function private.nutrition_v2_rederive_day_snapshot(uuid, date) from public, anon, authenticated;

comment on function private.nutrition_v2_rederive_day_snapshot(uuid, date) is
  'Recomputes the CURRENT local-day snapshot from the live effective version after a same-day publish. No-op for past days (immutable) or unmaterialized days. Intake entries are untouched.';

-- ── 1b. publish_nutrition_plan_v2: re-derive the client''s current day after publishing ─────────

create or replace function public.publish_nutrition_plan_v2(
  p_version_id uuid,
  p_effective_from date,
  p_idempotency_key text
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

  select effective_from into v_current_from
  from public.nutrition_plan_versions_v2
  where plan_id = v_plan.id
    and status = 'published'
    and effective_to is null
    and id <> v_version.id
  for update;

  if v_current_from is not null and p_effective_from <= v_current_from then
    raise exception 'nutrition_v2_effective_date_must_follow_current_version' using errcode = '22023';
  end if;

  update public.nutrition_plan_versions_v2
  set status = 'superseded',
      effective_to = p_effective_from - 1,
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
    jsonb_build_object('effectiveFrom', p_effective_from, 'versionNumber', v_version.version_number)
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

revoke all on function public.publish_nutrition_plan_v2(uuid, date, text) from public, anon;
grant execute on function public.publish_nutrition_plan_v2(uuid, date, text) to authenticated;
comment on function public.publish_nutrition_plan_v2(uuid, date, text) is
  'Publishes one draft version transactionally and supersedes the previous active version. Idempotency key is scoped per plan and only honored after the scope check. A version effective on the client''s current local day re-derives that day''s snapshot (audited).';

-- ── 2. get_nutrition_history_page_v2: expose legacy (classic-system) day data ───────────────────

create or replace function public.get_nutrition_history_page_v2(
  p_client_id uuid,
  p_before date default null,
  p_page_size integer default 14
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 14), 1), 31);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_cursor date := null;
  v_dates date[];
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_history_page_scope_denied' using errcode = '42501';
  end if;

  -- Each source is cursor-filtered and limited BEFORE the union, so one page never scans the
  -- client's full history. The intake branch considers ALL entries (V2 canonical AND V1
  -- legacy) so classic-system days surface even without a daily log row.
  select array_agg(local_date order by local_date desc)
  into v_dates
  from (
    select distinct local_date
    from (
      (
        select s.local_date
        from public.nutrition_day_snapshots_v2 s
        where s.client_id = p_client_id
          and (p_before is null or s.local_date < p_before)
        order by s.local_date desc
        limit v_page_size + 1
      )
      union all
      (
        select distinct e.log_date as local_date
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and (p_before is null or e.log_date < p_before)
        order by log_date desc
        limit v_page_size + 1
      )
      union all
      (
        select distinct dl.log_date as local_date
        from public.daily_nutrition_logs dl
        where dl.client_id = p_client_id
          and (p_before is null or dl.log_date < p_before)
        order by log_date desc
        limit v_page_size + 1
      )
    ) unioned
    order by local_date desc
    limit v_page_size + 1
  ) limited;

  v_has_more := coalesce(array_length(v_dates, 1), 0) > v_page_size;
  if v_has_more then
    v_dates := v_dates[1:v_page_size];
    v_next_cursor := v_dates[v_page_size];
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'localDate', local_date,
      'snapshotId', snapshot_id,
      'planVersionId', plan_version_id,
      'strategy', strategy,
      'targets', coalesce(targets, private.nutrition_v2_empty_targets()),
      'consumed', consumed,
      'activeEntryCount', active_entry_count,
      'correctionCount', correction_count,
      'legacyCompletionCount', legacy_count,
      'legacyEntryCount', legacy_entry_count,
      'legacyConsumed', case when legacy_entry_count > 0 then legacy_consumed else null end,
      'legacyMeals', legacy_meals,
      'legacyDisclosure', case
        when legacy_count > 0 or legacy_entry_count > 0 then 'legacy_completion_without_food_detail'
        else null
      end,
      'lastRecordedAt', last_recorded_at
    ) order by local_date desc
  ), '[]'::jsonb)
  into v_items
  from (
    select
      d.local_date,
      s.id as snapshot_id,
      s.version_id as plan_version_id,
      s.strategy,
      private.nutrition_v2_targets_json(
        s.target_calories,
        s.target_protein_g,
        s.target_carbs_g,
        s.target_fats_g,
        s.target_fiber_g,
        s.target_sodium_mg,
        s.target_water_ml
      ) as targets,
      private.nutrition_v2_intake_totals(p_client_id, d.local_date) as consumed,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and e.log_date = d.local_date
          and e.idempotency_key is not null
          and e.entry_status = 'active'
      ) as active_entry_count,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and e.log_date = d.local_date
          and e.idempotency_key is not null
          and e.entry_status = 'corrected'
      ) as correction_count,
      (
        select count(*)::integer
        from public.nutrition_meal_logs ml
        join public.daily_nutrition_logs dl on dl.id = ml.daily_log_id
        where dl.client_id = p_client_id
          and dl.log_date = d.local_date
          and ml.is_completed = true
      ) as legacy_count,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and e.log_date = d.local_date
          and e.idempotency_key is null
          and coalesce(e.entry_status, 'active') = 'active'
      ) as legacy_entry_count,
      (
        select jsonb_build_object(
          'calories', coalesce(sum(e.snapshot_calories), 0),
          'proteinG', coalesce(sum(e.snapshot_protein_g), 0),
          'carbsG', coalesce(sum(e.snapshot_carbs_g), 0),
          'fatsG', coalesce(sum(e.snapshot_fats_g), 0)
        )
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and e.log_date = d.local_date
          and e.idempotency_key is null
          and coalesce(e.entry_status, 'active') = 'active'
      ) as legacy_consumed,
      (
        select jsonb_agg(m.name order by ml.created_at)
        from public.nutrition_meal_logs ml
        join public.daily_nutrition_logs dl on dl.id = ml.daily_log_id
        join public.nutrition_meals m on m.id = ml.meal_id
        where dl.client_id = p_client_id
          and dl.log_date = d.local_date
          and ml.is_completed = true
      ) as legacy_meals,
      (
        select max(coalesce(e.occurred_at, e.created_at))
        from public.nutrition_intake_entries e
        where e.client_id = p_client_id
          and e.log_date = d.local_date
          and e.idempotency_key is not null
      ) as last_recorded_at
    from unnest(coalesce(v_dates, array[]::date[])) as d(local_date)
    left join public.nutrition_day_snapshots_v2 s
      on s.client_id = p_client_id
     and s.local_date = d.local_date
  ) day_rows;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next_cursor,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

revoke all on function public.get_nutrition_history_page_v2(uuid, date, integer) from public, anon;
grant execute on function public.get_nutrition_history_page_v2(uuid, date, integer) to authenticated;
comment on function public.get_nutrition_history_page_v2(uuid, date, integer) is
  'Cursor-paginated per-day nutrition history (snapshots + canonical intake + legacy logs). Bounded per page. Exposes legacy day data: legacyEntryCount/legacyConsumed (V1 intake macro snapshots) and legacyMeals (completed classic-system meals).';
