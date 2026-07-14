-- EVA Nutrition V2 — versioned read models for Today, Plan, History,
-- Coach Hub and professional Client Detail.
-- Additive only. No V1 table or policy is changed.

create or replace function private.nutrition_v2_default_permissions()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'canRegisterFreely', true,
    'canAdjustPrescribedQuantity', true,
    'quantityAdjustmentPercent', null,
    'canSubstitute', false,
    'canMoveMealSlot', false,
    'canSkipOptionalItems', true
  );
$$;

create or replace function private.nutrition_v2_empty_targets()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'calories', null,
    'proteinG', null,
    'carbsG', null,
    'fatsG', null,
    'fiberG', null,
    'sodiumMg', null,
    'waterMl', null
  );
$$;

create or replace function private.nutrition_v2_targets_json(
  p_calories numeric,
  p_protein_g numeric,
  p_carbs_g numeric,
  p_fats_g numeric,
  p_fiber_g numeric,
  p_sodium_mg numeric,
  p_water_ml numeric
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'calories', p_calories,
    'proteinG', p_protein_g,
    'carbsG', p_carbs_g,
    'fatsG', p_fats_g,
    'fiberG', p_fiber_g,
    'sodiumMg', p_sodium_mg,
    'waterMl', p_water_ml
  );
$$;

create or replace function private.nutrition_v2_entry_factor(
  p_quantity numeric,
  p_unit text,
  p_serving_size numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_unit, '')) in ('g', 'ml')
      then greatest(coalesce(p_quantity, 0), 0) / greatest(coalesce(p_serving_size, 100), 0.0001)
    else greatest(coalesce(p_quantity, 0), 0)
  end;
$$;

create or replace function private.nutrition_v2_intake_item_json(
  p_entry public.nutrition_intake_entries
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_entry.id,
    'foodId', p_entry.food_id,
    'customName', p_entry.custom_name,
    'quantity', p_entry.quantity,
    'unit', p_entry.unit,
    'mealSlot', coalesce(p_entry.meal_slot_v2, p_entry.meal_slot),
    'source', coalesce(p_entry.intake_source_v2, p_entry.source),
    'captureMethod', coalesce(p_entry.capture_method_v2, p_entry.capture_method),
    'occurredAt', coalesce(p_entry.occurred_at, p_entry.created_at),
    'status', p_entry.entry_status,
    'revision', p_entry.revision,
    'correctsEntryId', p_entry.corrects_entry_id,
    'prescriptionItemId', p_entry.prescription_item_id,
    'snapshot', jsonb_build_object(
      'name', coalesce(p_entry.snapshot_name, p_entry.custom_name, 'Alimento'),
      'brand', p_entry.snapshot_brand,
      'calories', p_entry.snapshot_calories,
      'proteinG', p_entry.snapshot_protein_g,
      'carbsG', p_entry.snapshot_carbs_g,
      'fatsG', p_entry.snapshot_fats_g,
      'fiberG', p_entry.snapshot_fiber_g,
      'servingSize', p_entry.snapshot_serving_size,
      'servingUnit', p_entry.snapshot_serving_unit
    ),
    'totals', jsonb_build_object(
      'calories', round(coalesce(p_entry.snapshot_calories, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size), 1),
      'proteinG', round(coalesce(p_entry.snapshot_protein_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size), 1),
      'carbsG', round(coalesce(p_entry.snapshot_carbs_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size), 1),
      'fatsG', round(coalesce(p_entry.snapshot_fats_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size), 1),
      'fiberG', round(coalesce(p_entry.snapshot_fiber_g, 0) * private.nutrition_v2_entry_factor(p_entry.quantity, p_entry.unit, p_entry.snapshot_serving_size), 1)
    )
  );
$$;

create or replace function private.nutrition_v2_intake_totals(
  p_client_id uuid,
  p_local_date date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'calories', round(coalesce(sum(coalesce(e.snapshot_calories, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1),
    'proteinG', round(coalesce(sum(coalesce(e.snapshot_protein_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1),
    'carbsG', round(coalesce(sum(coalesce(e.snapshot_carbs_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1),
    'fatsG', round(coalesce(sum(coalesce(e.snapshot_fats_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1),
    'fiberG', round(coalesce(sum(coalesce(e.snapshot_fiber_g, 0) * private.nutrition_v2_entry_factor(e.quantity, e.unit, e.snapshot_serving_size)), 0), 1),
    'entryCount', count(*)::integer
  )
  from public.nutrition_intake_entries e
  where e.client_id = p_client_id
    and e.log_date = p_local_date
    and e.idempotency_key is not null
    and e.entry_status = 'active';
$$;

create or replace function private.nutrition_v2_remaining_targets(
  p_targets jsonb,
  p_consumed jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'calories', case when p_targets ->> 'calories' is null then null else greatest((p_targets ->> 'calories')::numeric - coalesce((p_consumed ->> 'calories')::numeric, 0), 0) end,
    'proteinG', case when p_targets ->> 'proteinG' is null then null else greatest((p_targets ->> 'proteinG')::numeric - coalesce((p_consumed ->> 'proteinG')::numeric, 0), 0) end,
    'carbsG', case when p_targets ->> 'carbsG' is null then null else greatest((p_targets ->> 'carbsG')::numeric - coalesce((p_consumed ->> 'carbsG')::numeric, 0), 0) end,
    'fatsG', case when p_targets ->> 'fatsG' is null then null else greatest((p_targets ->> 'fatsG')::numeric - coalesce((p_consumed ->> 'fatsG')::numeric, 0), 0) end,
    'fiberG', case when p_targets ->> 'fiberG' is null then null else greatest((p_targets ->> 'fiberG')::numeric - coalesce((p_consumed ->> 'fiberG')::numeric, 0), 0) end,
    'sodiumMg', p_targets -> 'sodiumMg',
    'waterMl', p_targets -> 'waterMl'
  );
$$;

create or replace function public.get_nutrition_today_v2(
  p_client_id uuid,
  p_local_date date,
  p_timezone text default 'America/Santiago'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_snapshot public.nutrition_day_snapshots_v2%rowtype;
  v_version public.nutrition_plan_versions_v2%rowtype;
  v_plan public.nutrition_plans_v2%rowtype;
  v_targets jsonb;
  v_consumed jsonb;
  v_permissions jsonb;
  v_plan_summary jsonb;
  v_slots jsonb := '[]'::jsonb;
  v_unassigned jsonb := '[]'::jsonb;
  v_sync_token text;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_today_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_today_invalid_input' using errcode = '22023';
  end if;

  v_snapshot_id := private.nutrition_v2_ensure_day_snapshot(p_client_id, p_local_date, p_timezone);
  select * into v_snapshot from public.nutrition_day_snapshots_v2 where id = v_snapshot_id;

  v_targets := private.nutrition_v2_targets_json(
    v_snapshot.target_calories,
    v_snapshot.target_protein_g,
    v_snapshot.target_carbs_g,
    v_snapshot.target_fats_g,
    v_snapshot.target_fiber_g,
    v_snapshot.target_sodium_mg,
    v_snapshot.target_water_ml
  );
  v_consumed := private.nutrition_v2_intake_totals(p_client_id, p_local_date);
  v_permissions := private.nutrition_v2_default_permissions() || coalesce(v_snapshot.student_permissions, '{}'::jsonb);

  if v_snapshot.version_id is not null then
    select * into v_version from public.nutrition_plan_versions_v2 where id = v_snapshot.version_id;
    select * into v_plan from public.nutrition_plans_v2 where id = v_snapshot.plan_id;
    v_plan_summary := jsonb_build_object(
      'id', v_plan.id,
      'name', v_plan.name,
      'strategy', v_version.strategy,
      'versionId', v_version.id,
      'versionNumber', v_version.version_number,
      'status', v_version.status,
      'effectiveFrom', v_version.effective_from,
      'effectiveTo', v_version.effective_to
    );
  else
    v_plan_summary := null;
  end if;

  with entries as (
    select e.*, private.nutrition_v2_intake_item_json(e) as item_json
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.log_date = p_local_date
      and e.idempotency_key is not null
      and e.entry_status = 'active'
  ), snapshot_slots as (
    select slot, ordinality
    from jsonb_array_elements(coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb))
      with ordinality as value(slot, ordinality)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', slot ->> 'id',
      'code', slot ->> 'code',
      'name', slot ->> 'name',
      'startTime', slot ->> 'startTime',
      'endTime', slot ->> 'endTime',
      'mode', coalesce(slot ->> 'mode', 'anchor'),
      'required', coalesce((slot ->> 'required')::boolean, false),
      'instructions', slot ->> 'instructions',
      'targets', private.nutrition_v2_empty_targets() || coalesce(slot -> 'targets', '{}'::jsonb),
      'prescriptionItems', coalesce(slot -> 'items', '[]'::jsonb),
      'intakeItems', coalesce((
        select jsonb_agg(e.item_json order by coalesce(e.occurred_at, e.created_at), e.id)
        from entries e
        where coalesce(e.meal_slot_v2, e.meal_slot) = slot ->> 'code'
      ), '[]'::jsonb)
    ) order by ordinality
  ), '[]'::jsonb)
  into v_slots
  from snapshot_slots;

  with entries as (
    select e.*, private.nutrition_v2_intake_item_json(e) as item_json
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.log_date = p_local_date
      and e.idempotency_key is not null
      and e.entry_status = 'active'
  )
  select coalesce(jsonb_agg(e.item_json order by coalesce(e.occurred_at, e.created_at), e.id), '[]'::jsonb)
  into v_unassigned
  from entries e
  where not exists (
    select 1
    from jsonb_array_elements(coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)) slot
    where slot ->> 'code' = coalesce(e.meal_slot_v2, e.meal_slot)
  );

  select md5(concat_ws(':',
    coalesce(v_snapshot.id::text, 'none'),
    coalesce(v_snapshot.version_id::text, 'none'),
    coalesce(max(e.updated_at)::text, 'none'),
    count(e.id)::text
  ))
  into v_sync_token
  from public.nutrition_intake_entries e
  where e.client_id = p_client_id
    and e.log_date = p_local_date
    and e.idempotency_key is not null;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'localDate', p_local_date,
    'timezone', p_timezone,
    'snapshotId', v_snapshot.id,
    'plan', v_plan_summary,
    'targets', v_targets,
    'consumed', v_consumed,
    'remaining', private.nutrition_v2_remaining_targets(v_targets, v_consumed),
    'permissions', v_permissions,
    'mealSlots', v_slots,
    'unassignedIntake', v_unassigned,
    'syncToken', coalesce(v_sync_token, md5(concat_ws(':', p_client_id::text, p_local_date::text)))
  );
end;
$$;

create or replace function public.get_nutrition_plan_read_v2(
  p_client_id uuid,
  p_as_of_date date,
  p_timezone text default 'America/Santiago'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.nutrition_plans_v2%rowtype;
  v_version public.nutrition_plan_versions_v2%rowtype;
  v_variants jsonb := '[]'::jsonb;
  v_plan_summary jsonb;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_plan_read_scope_denied' using errcode = '42501';
  end if;
  if p_as_of_date is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_plan_read_invalid_input' using errcode = '22023';
  end if;

  select p.*, v.* into v_plan, v_version
  from public.nutrition_plans_v2 p
  join public.nutrition_plan_versions_v2 v on v.plan_id = p.id
  where p.client_id = p_client_id
    and p.lifecycle_status = 'active'
    and v.status in ('published', 'superseded')
    and v.effective_from <= p_as_of_date
    and (v.effective_to is null or v.effective_to >= p_as_of_date)
  order by v.effective_from desc, v.version_number desc
  limit 1;

  if v_version.id is null then
    return jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'asOfDate', p_as_of_date,
      'timezone', p_timezone,
      'plan', null,
      'visibleNotes', null,
      'protocolNotes', null,
      'permissions', private.nutrition_v2_default_permissions(),
      'dayVariants', '[]'::jsonb,
      'syncToken', md5(concat_ws(':', p_client_id::text, p_as_of_date::text, 'empty'))
    );
  end if;

  v_plan_summary := jsonb_build_object(
    'id', v_plan.id,
    'name', v_plan.name,
    'strategy', v_version.strategy,
    'versionId', v_version.id,
    'versionNumber', v_version.version_number,
    'status', v_version.status,
    'effectiveFrom', v_version.effective_from,
    'effectiveTo', v_version.effective_to
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', dv.id,
      'key', dv.variant_key,
      'label', dv.label,
      'dayOfWeek', dv.day_of_week,
      'isDefault', dv.is_default,
      'targets', private.nutrition_v2_targets_json(
        dv.target_calories, dv.target_protein_g, dv.target_carbs_g,
        dv.target_fats_g, dv.target_fiber_g, dv.target_sodium_mg, dv.target_water_ml
      ),
      'mealSlots', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', ms.id,
            'code', ms.slot_code,
            'name', ms.name,
            'startTime', case when ms.start_time is null then null else to_char(ms.start_time, 'HH24:MI') end,
            'endTime', case when ms.end_time is null then null else to_char(ms.end_time, 'HH24:MI') end,
            'mode', ms.slot_mode,
            'required', ms.is_required,
            'instructions', ms.instructions,
            'targets', private.nutrition_v2_targets_json(
              ms.target_calories, ms.target_protein_g, ms.target_carbs_g,
              ms.target_fats_g, null, null, null
            ),
            'prescriptionItems', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', pi.id,
                  'foodId', pi.food_id,
                  'recipeId', pi.recipe_id,
                  'name', coalesce(pi.snapshot_name, pi.custom_name),
                  'brand', pi.snapshot_brand,
                  'quantity', pi.quantity,
                  'unit', pi.unit,
                  'minimumQuantity', pi.minimum_quantity,
                  'maximumQuantity', pi.maximum_quantity,
                  'optional', pi.is_optional,
                  'substitutionGroupId', pi.substitution_group_id,
                  'notes', pi.notes,
                  'macros', jsonb_build_object(
                    'calories', pi.snapshot_calories,
                    'proteinG', pi.snapshot_protein_g,
                    'carbsG', pi.snapshot_carbs_g,
                    'fatsG', pi.snapshot_fats_g,
                    'fiberG', pi.snapshot_fiber_g
                  )
                ) order by pi.order_index, pi.created_at
              )
              from public.nutrition_prescription_items_v2 pi
              where pi.meal_slot_id = ms.id
            ), '[]'::jsonb)
          ) order by ms.order_index, ms.created_at
        )
        from public.nutrition_meal_slots_v2 ms
        where ms.day_variant_id = dv.id
      ), '[]'::jsonb)
    ) order by dv.order_index, dv.created_at
  ), '[]'::jsonb)
  into v_variants
  from public.nutrition_day_variants_v2 dv
  where dv.version_id = v_version.id;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'asOfDate', p_as_of_date,
    'timezone', p_timezone,
    'plan', v_plan_summary,
    'visibleNotes', v_version.visible_notes,
    'protocolNotes', v_version.protocol_notes,
    'permissions', private.nutrition_v2_default_permissions() || coalesce(v_version.student_permissions, '{}'::jsonb),
    'dayVariants', v_variants,
    'syncToken', md5(concat_ws(':', v_version.id::text, v_version.lock_version::text, v_version.updated_at::text))
  );
end;
$$;

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
  v_items jsonb;
  v_has_more boolean;
  v_next_cursor date;
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
    where e.client_id = p_client_id and e.idempotency_key is not null
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
        s.target_calories, s.target_protein_g, s.target_carbs_g,
        s.target_fats_g, s.target_fiber_g, s.target_sodium_mg, s.target_water_ml
      ) as targets,
      private.nutrition_v2_intake_totals(p_client_id, d.local_date) as consumed,
      (select count(*)::integer from public.nutrition_intake_entries e
       where e.client_id = p_client_id and e.log_date = d.local_date
         and e.idempotency_key is not null and e.entry_status = 'active') as active_entry_count,
      (select count(*)::integer from public.nutrition_intake_entries e
       where e.client_id = p_client_id and e.log_date = d.local_date
         and e.idempotency_key is not null and e.entry_status = 'corrected') as correction_count,
      (select count(*)::integer
       from public.nutrition_meal_logs ml
       join public.daily_nutrition_logs dl on dl.id = ml.daily_log_id
       where dl.client_id = p_client_id and dl.log_date = d.local_date and ml.is_completed = true) as legacy_count,
      (select max(coalesce(e.occurred_at, e.created_at))
       from public.nutrition_intake_entries e
       where e.client_id = p_client_id and e.log_date = d.local_date and e.idempotency_key is not null) as last_recorded_at
    from selected_dates d
    left join public.nutrition_day_snapshots_v2 s
      on s.client_id = p_client_id and s.local_date = d.local_date
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
      'legacyDisclosure', case when legacy_count > 0 then 'legacy_completion_without_food_detail' else null end,
      'lastRecordedAt', last_recorded_at
    ) order by local_date desc
  ), '[]'::jsonb)
  into v_items
  from day_rows;

  with candidate_dates as (
    select s.local_date from public.nutrition_day_snapshots_v2 s where s.client_id = p_client_id
    union select e.log_date from public.nutrition_intake_entries e where e.client_id = p_client_id and e.idempotency_key is not null
    union select dl.log_date from public.daily_nutrition_logs dl where dl.client_id = p_client_id
  ), ordered_dates as (
    select local_date from candidate_dates
    where p_before is null or local_date < p_before
    order by local_date desc
    limit v_page_size + 1
  )
  select count(*) > v_page_size,
         case when count(*) > v_page_size then min(local_date) filter (
           where local_date in (select local_date from ordered_dates order by local_date desc limit v_page_size)
         ) else null end
  into v_has_more, v_next_cursor
  from ordered_dates;

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
  v_items jsonb;
  v_has_more boolean;
  v_next jsonb;
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
        or (c.updated_at, c.id) < (p_cursor_updated_at, p_cursor_client_id)
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
      (select max(coalesce(e.occurred_at, e.created_at))
       from public.nutrition_intake_entries e
       where e.client_id = c.id and e.idempotency_key is not null and e.entry_status = 'active') as last_intake_at,
      (select count(distinct e.log_date)::integer
       from public.nutrition_intake_entries e
       where e.client_id = c.id and e.idempotency_key is not null and e.entry_status = 'active'
         and e.log_date >= current_date - 6) as active_days_7d,
      (select count(*)::integer
       from public.nutrition_intake_entries e
       where e.client_id = c.id and e.idempotency_key is not null and e.entry_status = 'active'
         and e.log_date >= current_date - 6) as intake_entries_7d,
      (select count(*)::integer
       from public.nutrition_plan_versions_v2 dv
       join public.nutrition_plans_v2 dp on dp.id = dv.plan_id
       where dp.client_id = c.id and dv.status = 'draft') as pending_drafts
    from page c
    left join lateral (
      select lp.*
      from public.nutrition_plans_v2 lp
      where lp.client_id = c.id and lp.lifecycle_status = 'active'
      order by lp.updated_at desc
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
        or (c.updated_at, c.id) < (p_cursor_updated_at, p_cursor_client_id)
      )
    order by c.updated_at desc, c.id desc
    limit v_page_size + 1
  ), page as (
    select * from scoped_clients order by updated_at desc, id desc limit v_page_size
  )
  select (select count(*) from scoped_clients) > v_page_size,
         case when (select count(*) from scoped_clients) > v_page_size
           then (select jsonb_build_object('updatedAt', updated_at, 'clientId', id)
                 from page order by updated_at asc, id asc limit 1)
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
stable
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
  v_today jsonb;
  v_plan jsonb;
  v_history jsonb;
  v_private_note jsonb;
  v_version_id uuid;
begin
  if auth.uid() is null or not private.nutrition_v2_can_manage_client(p_client_id) then
    raise exception 'nutrition_v2_client_detail_scope_denied' using errcode = '42501';
  end if;

  select * into v_client from public.clients where id = p_client_id;
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
    'client', jsonb_build_object('id', v_client.id, 'fullName', v_client.full_name),
    'today', v_today,
    'plan', v_plan,
    'recentDays', coalesce(v_history -> 'items', '[]'::jsonb),
    'privateNote', v_private_note
  );
end;
$$;

revoke all on function private.nutrition_v2_default_permissions() from public, anon, authenticated;
revoke all on function private.nutrition_v2_empty_targets() from public, anon, authenticated;
revoke all on function private.nutrition_v2_targets_json(numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function private.nutrition_v2_entry_factor(numeric, text, numeric) from public, anon, authenticated;
revoke all on function private.nutrition_v2_intake_item_json(public.nutrition_intake_entries) from public, anon, authenticated;
revoke all on function private.nutrition_v2_intake_totals(uuid, date) from public, anon, authenticated;
revoke all on function private.nutrition_v2_remaining_targets(jsonb, jsonb) from public, anon, authenticated;

revoke all on function public.get_nutrition_today_v2(uuid, date, text) from public, anon;
revoke all on function public.get_nutrition_plan_read_v2(uuid, date, text) from public, anon;
revoke all on function public.get_nutrition_history_page_v2(uuid, date, integer) from public, anon;
revoke all on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) from public, anon;
revoke all on function public.get_nutrition_client_detail_v2(uuid, date, text) from public, anon;

grant execute on function public.get_nutrition_today_v2(uuid, date, text) to authenticated;
grant execute on function public.get_nutrition_plan_read_v2(uuid, date, text) to authenticated;
grant execute on function public.get_nutrition_history_page_v2(uuid, date, integer) to authenticated;
grant execute on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_nutrition_client_detail_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_today_v2(uuid, date, text) is 'One-request private read model for the student Today screen.';
comment on function public.get_nutrition_plan_read_v2(uuid, date, text) is 'One-request immutable plan read model effective on a local date.';
comment on function public.get_nutrition_history_page_v2(uuid, date, integer) is 'Cursor-paginated daily history with V2 intake and honest legacy completion counts.';
comment on function public.get_nutrition_coach_hub_v2(timestamptz, uuid, integer) is 'Cursor-paginated coach nutrition roster scoped by RLS helper.';
comment on function public.get_nutrition_client_detail_v2(uuid, date, text) is 'Professional aggregate containing Today, Plan, seven recent days and scoped private note.';
