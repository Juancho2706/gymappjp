-- Hub del coach V2: triage por riesgo + señal por-dia + phone + search server-side.
-- Aditivo sobre el payload; reescritura interna a una sola pasada (lateral joins).
-- lastIntakeAt ahora acotado a 90 dias (null = sin registro en 90d); attentionReason conserva semantica.
-- Aplicada en LIVE via MCP el 2026-08-05 (version 20260805211949); validada con tx-rollback + EXPLAIN:
-- attention 25 alumnos = 65ms vs 90ms de la version anterior (que hacia menos).

drop function if exists public.__hub_triage_test(text, uuid, uuid, timestamptz, uuid, integer, text, text, integer);

create index if not exists idx_clients_updated_at_active
  on public.clients (updated_at desc, id desc)
  where is_archived = false;

drop function if exists public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer);

create function public.get_nutrition_coach_hub_scoped_v2(
  p_scope_type text,
  p_team_id uuid default null,
  p_org_id uuid default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_client_id uuid default null,
  p_page_size integer default 25,
  p_search text default null,
  p_sort text default 'default',
  p_cursor_score integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $FN$
declare
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_sort text := case when p_sort in ('default', 'attention') then p_sort else 'default' end;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
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

  with scoped as (
    select c.id, c.full_name, c.phone, c.updated_at
    from public.clients c
    where c.is_archived = false
      and private.nutrition_v2_client_matches_workspace(c.id, p_scope_type, p_team_id, p_org_id)
      and (v_search is null or c.full_name ilike '%' || v_search || '%')
  ),
  candidates as (
    select s.* from scoped s
    where v_sort = 'attention'
       or (
         p_cursor_updated_at is null
         or s.updated_at < p_cursor_updated_at
         or (s.updated_at = p_cursor_updated_at and (p_cursor_client_id is null or s.id < p_cursor_client_id))
       )
    order by s.updated_at desc, s.id desc
    limit case when v_sort = 'default' then v_page_size + 1 else null end
  ),
  enriched as (
    select
      s.id as client_id, s.full_name, s.phone, s.updated_at,
      p.id as plan_id, v.id as version_id, v.version_number,
      p.name as plan_name, v.strategy, v.status as plan_status, v.effective_from,
      agg.last_intake_at,
      coalesce(agg.active_days_7d, 0) as active_days_7d,
      coalesce(agg.intake_entries_7d, 0) as intake_entries_7d,
      coalesce(agg.active_days_prev7d, 0) as active_days_prev7d,
      coalesce(week.days7d, '[]'::jsonb) as days7d,
      coalesce(dr.pending_drafts, 0) as pending_drafts
    from candidates s
    left join lateral (
      select lp.* from public.nutrition_plans_v2 lp
      where lp.client_id = s.id and lp.lifecycle_status = 'active'
      order by (lp.current_published_version_id is not null) desc, lp.updated_at desc, lp.id desc
      limit 1
    ) p on true
    left join public.nutrition_plan_versions_v2 v on v.id = p.current_published_version_id
    left join lateral (
      select
        max(coalesce(e.occurred_at, e.created_at)) as last_intake_at,
        (count(distinct e.log_date) filter (where e.log_date >= current_date - 6))::integer as active_days_7d,
        (count(*) filter (where e.log_date >= current_date - 6))::integer as intake_entries_7d,
        (count(distinct e.log_date) filter (where e.log_date between current_date - 13 and current_date - 7))::integer as active_days_prev7d
      from public.nutrition_intake_entries e
      where e.client_id = s.id and e.idempotency_key is not null and e.entry_status = 'active'
        and e.log_date >= current_date - 90
    ) agg on true
    left join lateral (
      select jsonb_agg(jsonb_build_object(
          'date', d.log_date,
          'entryCount', d.entry_count,
          'consumedCalories', d.consumed_calories,
          'targetCalories', s2.target_calories
        ) order by d.log_date) as days7d
      from (
        select e.log_date,
          count(*)::integer as entry_count,
          round(coalesce(sum(coalesce(e.snapshot_calories, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1) as consumed_calories
        from public.nutrition_intake_entries e
        where e.client_id = s.id and e.idempotency_key is not null and e.entry_status = 'active'
          and e.log_date >= current_date - 6
        group by e.log_date
      ) d
      left join public.nutrition_day_snapshots_v2 s2
        on s2.client_id = s.id and s2.local_date = d.log_date
    ) week on true
    left join lateral (
      select count(*)::integer as pending_drafts
      from public.nutrition_plan_versions_v2 dv
      join public.nutrition_plans_v2 dp on dp.id = dv.plan_id
      where dp.client_id = s.id and dv.status = 'draft' and dp.lifecycle_status = 'active'
    ) dr on true
  ),
  ranked as (
    select e.*,
      case
        when e.plan_id is null then 40000
        when e.pending_drafts > 0 then 30000
        when e.last_intake_at is null then 21000
        when e.last_intake_at < now() - interval '7 days'
          then 20000 + least(extract(day from now() - e.last_intake_at)::integer, 90) * 10
        else (7 - e.active_days_7d) * 100 + greatest(e.active_days_prev7d - e.active_days_7d, 0) * 50
      end as attention_score,
      case
        when e.plan_id is null then 'no_plan'
        when e.pending_drafts > 0 then 'draft_pending'
        when e.last_intake_at is null or e.last_intake_at < now() - interval '7 days' then 'no_recent_intake'
        else 'none'
      end as attention_reason
    from enriched e
  ),
  paged as (
    select r.* from ranked r
    where v_sort = 'default'
       or (
         p_cursor_score is null
         or r.attention_score < p_cursor_score
         or (r.attention_score = p_cursor_score and (
              p_cursor_updated_at is null
              or r.updated_at < p_cursor_updated_at
              or (r.updated_at = p_cursor_updated_at and (p_cursor_client_id is null or r.client_id < p_cursor_client_id))
         ))
       )
    order by case when v_sort = 'attention' then r.attention_score end desc nulls last,
             r.updated_at desc, r.client_id desc
    limit v_page_size + 1
  ),
  numbered as (
    select paged.*,
      row_number() over (
        order by case when v_sort = 'attention' then attention_score end desc nulls last,
                 updated_at desc, client_id desc
      ) as rn
    from paged
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'clientId', client_id,
      'clientName', full_name,
      'phone', phone,
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
      'activeDaysPrev7d', active_days_prev7d,
      'days7d', days7d,
      'pendingDrafts', pending_drafts,
      'attentionScore', attention_score,
      'attentionReason', attention_reason,
      'updatedAt', updated_at
    ) order by rn) filter (where rn <= v_page_size), '[]'::jsonb),
    count(*) > v_page_size,
    (jsonb_agg(jsonb_build_object(
      'updatedAt', updated_at,
      'clientId', client_id,
      'score', attention_score
    )) filter (where rn = v_page_size)) -> 0
  into v_items, v_has_more, v_next
  from numbered;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'items', v_items,
    'nextCursor', case when coalesce(v_has_more, false) then v_next else null end,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$FN$;

revoke all on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer, text, text, integer) from public, anon;
grant execute on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer, text, text, integer) to authenticated;

comment on function public.get_nutrition_coach_hub_scoped_v2(text, uuid, uuid, timestamptz, uuid, integer, text, text, integer) is
  'Roster de nutricion del coach con triage: p_sort default|attention (keyset score+updatedAt+id via p_cursor_score), p_search por nombre, señal por-dia days7d (entryCount/consumed/target, 7d), activeDaysPrev7d para delta semanal, y phone para contacto WhatsApp. lastIntakeAt acotado a 90 dias. Una sola pasada con lateral joins; payload aditivo sobre schemaVersion 1.';
