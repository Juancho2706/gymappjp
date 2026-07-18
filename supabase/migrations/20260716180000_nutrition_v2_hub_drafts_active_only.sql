-- EVA Nutrition V2 — follow-up fix: the hub attention signal counted DRAFT versions of
-- ARCHIVED plans.
--
-- Bug (2026-07-16, CEO QA round 2): after archiving a plan that still had a draft version,
-- the coach hub kept flagging the client with attentionReason='draft_pending' ("Borrador
-- pendiente") because the pending_drafts subquery joined nutrition_plans_v2 but never
-- filtered by lifecycle_status — any draft version of ANY plan (active or archived) counted.
-- The lateral plan picker right below it already filters lifecycle_status='active'; the
-- draft counter simply never got the same predicate.
--
-- Fix (additive, CREATE OR REPLACE only — no DROP, no RLS/scope change): add
-- `draft_plan.lifecycle_status = 'active'` to the pending_drafts subquery in BOTH hub
-- functions. Everything else is byte-identical to 20260716120000 (same SECURITY DEFINER,
-- same search_path='', same auth.uid()/can_manage/workspace gates, same grants).

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
as $FN$
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
    select * from scoped_clients order by updated_at desc, id desc limit v_page_size
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
        where e.client_id = c.id and e.idempotency_key is not null and e.entry_status = 'active'
      ) as last_intake_at,
      (
        select count(distinct e.log_date)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id and e.idempotency_key is not null
          and e.entry_status = 'active' and e.log_date >= current_date - 6
      ) as active_days_7d,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id and e.idempotency_key is not null
          and e.entry_status = 'active' and e.log_date >= current_date - 6
      ) as intake_entries_7d,
      (
        select count(*)::integer
        from public.nutrition_plan_versions_v2 draft_version
        join public.nutrition_plans_v2 draft_plan on draft_plan.id = draft_version.plan_id
        where draft_plan.client_id = c.id
          and draft_version.status = 'draft'
          and draft_plan.lifecycle_status = 'active'
      ) as pending_drafts
    from page c
    left join lateral (
      select logical_plan.*
      from public.nutrition_plans_v2 logical_plan
      where logical_plan.client_id = c.id and logical_plan.lifecycle_status = 'active'
      order by
        (logical_plan.current_published_version_id is not null) desc,
        logical_plan.updated_at desc,
        logical_plan.id desc
      limit 1
    ) p on true
    left join public.nutrition_plan_versions_v2 v on v.id = p.current_published_version_id
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
        when last_intake_at is null or last_intake_at < now() - interval '7 days' then 'no_recent_intake'
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
        or (c.updated_at = p_cursor_updated_at and (p_cursor_client_id is null or c.id < p_cursor_client_id))
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select * from scoped_clients order by updated_at desc, id desc limit v_page_size
  )
  select
    (select count(*) from scoped_clients) > v_page_size,
    case when (select count(*) from scoped_clients) > v_page_size
      then (select jsonb_build_object('updatedAt', updated_at, 'clientId', id) from page order by updated_at asc, id asc limit 1)
      else null end
  into v_has_more, v_next;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$FN$;

create or replace function public.get_nutrition_coach_hub_scoped_v2(
  p_scope_type text,
  p_team_id uuid default null,
  p_org_id uuid default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_client_id uuid default null,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $FN$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_coach_hub_auth_required' using errcode = '42501';
  end if;
  if p_scope_type not in ('standalone', 'team', 'organization') then
    raise exception 'nutrition_v2_invalid_workspace_scope' using errcode = '22023';
  end if;

  with scoped_clients as (
    select c.id, c.full_name, c.updated_at
    from public.clients c
    where private.nutrition_v2_client_matches_workspace(c.id, p_scope_type, p_team_id, p_org_id)
      and c.is_archived = false
      and (
        p_cursor_updated_at is null
        or c.updated_at < p_cursor_updated_at
        or (c.updated_at = p_cursor_updated_at and (p_cursor_client_id is null or c.id < p_cursor_client_id))
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select * from scoped_clients order by updated_at desc, id desc limit v_page_size
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
        where e.client_id = c.id and e.idempotency_key is not null and e.entry_status = 'active'
      ) as last_intake_at,
      (
        select count(distinct e.log_date)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id and e.idempotency_key is not null
          and e.entry_status = 'active' and e.log_date >= current_date - 6
      ) as active_days_7d,
      (
        select count(*)::integer
        from public.nutrition_intake_entries e
        where e.client_id = c.id and e.idempotency_key is not null
          and e.entry_status = 'active' and e.log_date >= current_date - 6
      ) as intake_entries_7d,
      (
        select count(*)::integer
        from public.nutrition_plan_versions_v2 draft_version
        join public.nutrition_plans_v2 draft_plan on draft_plan.id = draft_version.plan_id
        where draft_plan.client_id = c.id
          and draft_version.status = 'draft'
          and draft_plan.lifecycle_status = 'active'
      ) as pending_drafts
    from page c
    left join lateral (
      select logical_plan.*
      from public.nutrition_plans_v2 logical_plan
      where logical_plan.client_id = c.id and logical_plan.lifecycle_status = 'active'
      order by
        (logical_plan.current_published_version_id is not null) desc,
        logical_plan.updated_at desc,
        logical_plan.id desc
      limit 1
    ) p on true
    left join public.nutrition_plan_versions_v2 v on v.id = p.current_published_version_id
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
        when last_intake_at is null or last_intake_at < now() - interval '7 days' then 'no_recent_intake'
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
    where private.nutrition_v2_client_matches_workspace(c.id, p_scope_type, p_team_id, p_org_id)
      and c.is_archived = false
      and (
        p_cursor_updated_at is null
        or c.updated_at < p_cursor_updated_at
        or (c.updated_at = p_cursor_updated_at and (p_cursor_client_id is null or c.id < p_cursor_client_id))
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select * from scoped_clients order by updated_at desc, id desc limit v_page_size
  )
  select
    (select count(*) from scoped_clients) > v_page_size,
    case when (select count(*) from scoped_clients) > v_page_size
      then (select jsonb_build_object('updatedAt', updated_at, 'clientId', id) from page order by updated_at asc, id asc limit 1)
      else null end
  into v_has_more, v_next;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', v_next,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$FN$;

-- Grants unchanged from 20260714210500 / 20260714211000 / 20260716120000 (idempotent re-assertion).
revoke all on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer) to authenticated;

comment on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) is
  'Cursor-paginated coach nutrition roster scoped by the existing student assignment rules. Plan pick prefers the active plan with a published version (orphan-safe). pending_drafts only counts drafts of plans with lifecycle_status=active.';
comment on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer) is
  'Coach roster constrained to one validated workspace. Plan pick prefers the active plan with a published version (orphan-safe). pending_drafts only counts drafts of plans with lifecycle_status=active.';
