create or replace function public.get_nutrition_history_adapter_v2(
  p_client_id uuid,
  p_from date,
  p_to date
)
returns table (
  source text,
  record_id uuid,
  local_date date,
  occurred_at timestamptz,
  meal_slot text,
  item_name text,
  quantity numeric,
  unit text,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fats_g numeric,
  disclosure text,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_history_scope_denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or (p_to - p_from) > 366 then
    raise exception 'nutrition_v2_invalid_history_range' using errcode = '22023';
  end if;

  return query
  select *
  from (
    select
      'v2'::text as source,
      e.id as record_id,
      e.log_date as local_date,
      coalesce(e.occurred_at, e.created_at) as occurred_at,
      coalesce(e.meal_slot_v2, e.meal_slot) as meal_slot,
      coalesce(e.snapshot_name, e.custom_name) as item_name,
      e.quantity as quantity,
      e.unit as unit,
      e.snapshot_calories as calories,
      e.snapshot_protein_g as protein_g,
      e.snapshot_carbs_g as carbs_g,
      e.snapshot_fats_g as fats_g,
      null::text as disclosure,
      jsonb_build_object(
        'status', e.entry_status,
        'revision', e.revision,
        'source', e.intake_source_v2,
        'captureMethod', e.capture_method_v2,
        'correctsEntryId', e.corrects_entry_id,
        'planVersionId', e.plan_version_id,
        'daySnapshotId', e.day_snapshot_id
      ) as metadata
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.log_date between p_from and p_to
      and e.idempotency_key is not null
      and e.entry_status = 'active'

    union all

    select
      'legacy'::text as source,
      ml.id as record_id,
      dl.log_date as local_date,
      ml.created_at as occurred_at,
      null::text as meal_slot,
      m.name as item_name,
      ml.consumed_quantity as quantity,
      null::text as unit,
      null::numeric as calories,
      null::numeric as protein_g,
      null::numeric as carbs_g,
      null::numeric as fats_g,
      'legacy_completion_without_food_detail'::text as disclosure,
      jsonb_build_object(
        'completed', ml.is_completed,
        'satisfactionScore', ml.satisfaction_score,
        'legacyMealId', ml.meal_id,
        'legacyPlanId', dl.plan_id,
        'planNameAtLog', dl.plan_name_at_log
      ) as metadata
    from public.nutrition_meal_logs ml
    join public.daily_nutrition_logs dl on dl.id = ml.daily_log_id
    left join public.nutrition_meals m on m.id = ml.meal_id
    where dl.client_id = p_client_id
      and dl.log_date between p_from and p_to
      and ml.is_completed = true
  ) history
  order by history.local_date desc, history.occurred_at desc, history.record_id;
end;
$$;

revoke all on function public.get_nutrition_history_adapter_v2(uuid, date, date) from public, anon;
grant execute on function public.get_nutrition_history_adapter_v2(uuid, date, date) to authenticated;
