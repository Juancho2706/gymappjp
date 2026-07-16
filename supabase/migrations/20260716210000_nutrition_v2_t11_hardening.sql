-- EVA Nutrition V2 — T11 hardening: consolidated follow-up for the 4 P1 SQL findings of the
-- 2026-07-14 multi-agent review (VALIDATION_RISKS §0). Additive, CREATE OR REPLACE only.
--
-- 1. nutrition_v2_guard_intake_mutation: the UPDATE branch only inspected OLD.idempotency_key,
--    so an authenticated client could "promote" their own V1 row into a forged canonical V2
--    entry (idempotency_key null → value + arbitrary snapshot_* fields) bypassing the audited
--    RPCs. Vector is real: authenticated holds full UPDATE on nutrition_intake_entries with the
--    `auth.uid() = client_id` policy. Fix: reject the null → not-null transition for roles
--    outside the service allowlist (the SECURITY DEFINER RPCs run as the function owner and are
--    unaffected).
-- 2. publish_idempotency_key was globally unique and publish_nutrition_plan_v2 looked the key up
--    across ALL tenants BEFORE any permission check, returning a foreign version id on
--    collision. Fix: uniqueness per (plan_id, key) + the idempotency lookup now runs AFTER the
--    can_manage gate and is scoped to the target plan.
-- 3. get_nutrition_history_page_v2 unioned every date the client ever logged (no p_before
--    pushdown) and evaluated that CTE twice per call → O(total history) per page ×2. Fix: each
--    source branch is cursor-filtered and limited before the union, and the page is computed
--    once into an array (items + hasMore + nextCursor from a single bounded scan). The needed
--    indexes already exist in prod (nutrition_intake_entries client/date, daily_nutrition_logs
--    client/date, snapshots unique client/date) — no new indexes required.
-- 4. (companion, no DDL here) supabase/tests/nutrition_v2_domain_rollback.sql is extended in the
--    same change-set to exercise the read models, cross-tenant denial and these fixes.

-- ── 1. Intake guard: block V1 → V2 promotion on UPDATE ─────────────────────────────────────────

create or replace function private.nutrition_v2_guard_intake_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.idempotency_key is not null
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'nutrition_v2_intake_requires_rpc' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.idempotency_key is not null
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'nutrition_v2_intake_is_immutable' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.idempotency_key is not null
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'nutrition_v2_intake_requires_rpc' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.nutrition_v2_guard_intake_mutation() from public, anon, authenticated;

-- ── 2a. Publish idempotency: unique per plan instead of global ─────────────────────────────────

create unique index if not exists nutrition_plan_versions_v2_publish_idem_plan_unique
  on public.nutrition_plan_versions_v2(plan_id, publish_idempotency_key)
  where publish_idempotency_key is not null;

drop index if exists public.nutrition_plan_versions_v2_publish_idempotency_unique;

-- ── 2b. publish_nutrition_plan_v2: authorize BEFORE the idempotency lookup, scope it to the plan ─

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

  return v_version.id;
end;
$$;

revoke all on function public.publish_nutrition_plan_v2(uuid, date, text) from public, anon;
grant execute on function public.publish_nutrition_plan_v2(uuid, date, text) to authenticated;
comment on function public.publish_nutrition_plan_v2(uuid, date, text) is
  'Publishes one draft version transactionally and supersedes the previous active version. Idempotency key is scoped per plan and only honored after the scope check.';

-- ── 3. get_nutrition_history_page_v2: bounded per-branch scans, single pass ─────────────────────

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
  -- client's full history. The overall top-N distinct dates are always contained in the union
  -- of each branch's top-N distinct dates.
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
          and e.idempotency_key is not null
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
      'legacyDisclosure', case
        when legacy_count > 0 then 'legacy_completion_without_food_detail'
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
  'Cursor-paginated per-day nutrition history (snapshots + canonical intake + legacy logs). Page cost is bounded by page size: every source branch is cursor-filtered and limited before the union, and the page is computed in a single pass.';
