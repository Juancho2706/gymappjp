-- EVA Nutrition V2 — cursor-paginated History, Coach Hub and Client Detail.

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
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_history_page_scope_denied' using errcode = '42501';
  end if;

  with candidate_dates as (
    select s.local_date
    from public.nutrition_day_snapshots_v2 s
    where s.client_id = p_client_id
    union
    select e.log_date
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.idempotency_key is not null
    union
    select dl.log_date
    from public.daily_nutrition_logs dl
    where dl.client_id = p_client_id
  ), ordered_dates as (
    select local_date
    from candidate_dates
    where p_before is null or local_date < p_before
    order by local_date desc
    limit v_page_size + 1
  ), selected_dates as (
    select local_date
    from ordered_dates
    order by local_date desc
    limit v_page_size
  ), day_rows as (
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
    from selected_dates d
    left join public.nutrition_day_snapshots_v2 s
      on s.client_id = p_client_id
     and s.local_date = d.local_date
  )
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
  from day_rows;

  with candidate_dates as (
    select s.local_date
    from public.nutrition_day_snapshots_v2 s
    where s.client_id = p_client_id
    union
    select e.log_date
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.idempotency_key is not null
    union
    select dl.log_date
    from public.daily_nutrition_logs dl
    where dl.client_id = p_client_id
  ), ordered_dates as (
    select local_date
    from candidate_dates
    where p_before is null or local_date < p_before
    order by local_date desc
    limit v_page_size + 1
  ), selected_dates as (
    select local_date
    from ordered_dates
    order by local_date desc
    limit v_page_size
  )
  select
    (select count(*) from ordered_dates) > v_page_size,
    case
      when (select count(*) from ordered_dates) > v_page_size
        then (select local_date from selected_dates order by local_date asc limit 1)
      else null
    end
  into v_has_more, v_next_cursor;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next_cursor,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

create or replace function public.get_nutrition_coach_hub_v2(
  p_cursor_updated_at timestamptz default null,
  p_cursor_client_id uuid default null,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_coach_hub_auth_required' using errcode = '42501';
  end if;

  with scoped_clients as (
    select c.id, c.full_name, c.updated_at
    from public.clients c
    where private.nutrition_v2_can_manage_client(c.id)
      and c.is_archived = false
      and (
        p_cursor_updated_at is null
        or c.updated_at < p_cursor_updated_at
        or (
          c.updated_at = p_cursor_updated_at
          and (p_cursor_client_id is null or c.id < p_cursor_client_id)
        )
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select *
    from scoped_clients
    order by updated_at desc, id desc
    limit v_page_size
  ), rows as (
    select
      c.id as client_id,
      c.full_name,
      c.updated_at,
      p.id as plan_id,
      v.id as version_id,
      v.version_number,
      p.name as plan_name,
      v.strategy,
      v.status as plan_status,
      v.effective_from,
      (
        select max(coalesce(e.occurred_at, e.created_at))
        from public.nutrition_intake_entries e
        where e.client_id = c.id
          and e.idempotency_key is not null
          and e.entry_status = 'active'
      ) as last_intake_at,
      (
        select count(distinct e.log_date)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id
          and e.idempotency_key is not null
          and e.entry_status = 'active'
          and e.log_date >= current_date - 6
      ) as active_days_7d,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id
          and e.idempotency_key is not null
          and e.entry_status = 'active'
          and e.log_date >= current_date - 6
      ) as intake_entries_7d,
      (
        select count(*)::integer
        from public.nutrition_plan_versions_v2 draft_version
        join public.nutrition_plans_v2 draft_plan
          on draft_plan.id = draft_version.plan_id
        where draft_plan.client_id = c.id
          and draft_version.status = 'draft'
      ) as pending_drafts
    from page c
    left join lateral (
      select logical_plan.*
      from public.nutrition_plans_v2 logical_plan
      where logical_plan.client_id = c.id
        and logical_plan.lifecycle_status = 'active'
      order by logical_plan.updated_at desc, logical_plan.id desc
      limit 1
    ) p on true
    left join public.nutrition_plan_versions_v2 v
      on v.id = p.current_published_version_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'clientId', client_id,
      'clientName', full_name,
      'planId', plan_id,
      'versionId', version_id,
      'versionNumber', version_number,
      'planName', plan_name,
      'strategy', strategy,
      'planStatus', plan_status,
      'effectiveFrom', effective_from,
      'lastIntakeAt', last_intake_at,
      'activeDays7d', active_days_7d,
      'intakeEntries7d', intake_entries_7d,
      'pendingDrafts', pending_drafts,
      'attentionReason', case
        when plan_id is null then 'no_plan'
        when pending_drafts > 0 then 'draft_pending'
        when last_intake_at is null
          or last_intake_at < now() - interval '7 days'
          then 'no_recent_intake'
        else 'none'
      end,
      'updatedAt', updated_at
    ) order by updated_at desc, client_id desc
  ), '[]'::jsonb)
  into v_items
  from rows;

  with scoped_clients as (
    select c.id, c.updated_at
    from public.clients c
    where private.nutrition_v2_can_manage_client(c.id)
      and c.is_archived = false
      and (
        p_cursor_updated_at is null
        or c.updated_at < p_cursor_updated_at
        or (
          c.updated_at = p_cursor_updated_at
          and (p_cursor_client_id is null or c.id < p_cursor_client_id)
        )
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select *
    from scoped_clients
    order by updated_at desc, id desc
    limit v_page_size
  )
  select
    (select count(*) from scoped_clients) > v_page_size,
    case
      when (select count(*) from scoped_clients) > v_page_size
        then (
          select jsonb_build_object('updatedAt', updated_at, 'clientId', id)
          from page
          order by updated_at asc, id asc
          limit 1
        )
      else null
    end
  into v_has_more, v_next;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

create or replace function public.get_nutrition_client_detail_v2(
  p_client_id uuid,
  p_local_date date,
  p_timezone text default 'America/Santiago'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_today jsonb;
  v_plan jsonb;
  v_history jsonb;
  v_private_note jsonb := null;
  v_version_id uuid;
begin
  if auth.uid() is null or not private.nutrition_v2_can_manage_client(p_client_id) then
    raise exception 'nutrition_v2_client_detail_scope_denied' using errcode = '42501';
  end if;

  select c.* into v_client
  from public.clients c
  where c.id = p_client_id;

  if v_client.id is null then
    raise exception 'nutrition_v2_client_not_found' using errcode = 'P0002';
  end if;

  v_today := public.get_nutrition_today_v2(p_client_id, p_local_date, p_timezone);
  v_plan := public.get_nutrition_plan_read_v2(p_client_id, p_local_date, p_timezone);
  v_history := public.get_nutrition_history_page_v2(p_client_id, null, 7);
  v_version_id := nullif(v_plan #>> '{plan,versionId}', '')::uuid;

  if v_version_id is not null then
    select jsonb_build_object('note', pn.note, 'updatedAt', pn.updated_at)
    into v_private_note
    from public.nutrition_plan_private_notes_v2 pn
    where pn.version_id = v_version_id
      and pn.client_id = p_client_id;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'client', jsonb_build_object(
      'id', v_client.id,
      'fullName', v_client.full_name
    ),
    'today', v_today,
    'plan', v_plan,
    'recentDays', coalesce(v_history -> 'items', '[]'::jsonb),
    'privateNote', v_private_note
  );
end;
$$;

revoke all on function public.get_nutrition_history_page_v2(uuid, date, integer) from public, anon;
revoke all on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_nutrition_client_detail_v2(uuid, date, text) from public, anon;

grant execute on function public.get_nutrition_history_page_v2(uuid, date, integer) to authenticated;
grant execute on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_nutrition_client_detail_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_history_page_v2(uuid, date, integer) is
  'Cursor-paginated daily history with V2 intake and honest legacy completion counts.';
comment on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) is
  'Cursor-paginated coach nutrition roster scoped by the existing student assignment rules.';
comment on function public.get_nutrition_client_detail_v2(uuid, date, text) is
  'Professional aggregate containing Today, Plan, seven recent days and scoped private note.';
