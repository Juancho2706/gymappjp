-- EVA Nutrition V2 — compact, versioned Today and Plan read models.
-- Additive only. Today is VOLATILE because first read may freeze a daily snapshot.

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
      then greatest(coalesce(p_quantity, 0), 0)
           / greatest(coalesce(p_serving_size, 100), 0.0001)
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
    'calories', case when jsonb_typeof(p_targets -> 'calories') = 'number' then greatest((p_targets ->> 'calories')::numeric - coalesce((p_consumed ->> 'calories')::numeric, 0), 0) else null end,
    'proteinG', case when jsonb_typeof(p_targets -> 'proteinG') = 'number' then greatest((p_targets ->> 'proteinG')::numeric - coalesce((p_consumed ->> 'proteinG')::numeric, 0), 0) else null end,
    'carbsG', case when jsonb_typeof(p_targets -> 'carbsG') = 'number' then greatest((p_targets ->> 'carbsG')::numeric - coalesce((p_consumed ->> 'carbsG')::numeric, 0), 0) else null end,
    'fatsG', case when jsonb_typeof(p_targets -> 'fatsG') = 'number' then greatest((p_targets ->> 'fatsG')::numeric - coalesce((p_consumed ->> 'fatsG')::numeric, 0), 0) else null end,
    'fiberG', case when jsonb_typeof(p_targets -> 'fiberG') = 'number' then greatest((p_targets ->> 'fiberG')::numeric - coalesce((p_consumed ->> 'fiberG')::numeric, 0), 0) else null end,
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
volatile
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
  v_plan_summary jsonb := null;
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
  select s.* into v_snapshot
  from public.nutrition_day_snapshots_v2 s
  where s.id = v_snapshot_id;

  if v_snapshot.id is null then
    raise exception 'nutrition_v2_snapshot_not_found' using errcode = 'P0002';
  end if;

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
  v_permissions := private.nutrition_v2_default_permissions()
    || coalesce(v_snapshot.student_permissions, '{}'::jsonb);

  if v_snapshot.version_id is not null then
    select v.* into v_version
    from public.nutrition_plan_versions_v2 v
    where v.id = v_snapshot.version_id;

    select p.* into v_plan
    from public.nutrition_plans_v2 p
    where p.id = v_snapshot.plan_id;

    if v_version.id is not null and v_plan.id is not null then
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
    end if;
  end if;

  with entries as (
    select e.*, private.nutrition_v2_intake_item_json(e) as item_json
    from public.nutrition_intake_entries e
    where e.client_id = p_client_id
      and e.log_date = p_local_date
      and e.idempotency_key is not null
      and e.entry_status = 'active'
  ), snapshot_slots as (
    select value.slot, value.ordinality
    from jsonb_array_elements(
      coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)
    ) with ordinality as value(slot, ordinality)
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
  select coalesce(
    jsonb_agg(e.item_json order by coalesce(e.occurred_at, e.created_at), e.id),
    '[]'::jsonb
  )
  into v_unassigned
  from entries e
  where not exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)
    ) slot
    where slot ->> 'code' = coalesce(e.meal_slot_v2, e.meal_slot)
  );

  select md5(concat_ws(':',
    v_snapshot.id::text,
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

  select v.* into v_version
  from public.nutrition_plan_versions_v2 v
  join public.nutrition_plans_v2 p on p.id = v.plan_id
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

  select p.* into v_plan
  from public.nutrition_plans_v2 p
  where p.id = v_version.plan_id;

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
        dv.target_calories,
        dv.target_protein_g,
        dv.target_carbs_g,
        dv.target_fats_g,
        dv.target_fiber_g,
        dv.target_sodium_mg,
        dv.target_water_ml
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
              ms.target_calories,
              ms.target_protein_g,
              ms.target_carbs_g,
              ms.target_fats_g,
              null,
              null,
              null
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
    'permissions', private.nutrition_v2_default_permissions()
      || coalesce(v_version.student_permissions, '{}'::jsonb),
    'dayVariants', v_variants,
    'syncToken', md5(concat_ws(':',
      v_version.id::text,
      v_version.lock_version::text,
      v_version.updated_at::text
    ))
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
grant execute on function public.get_nutrition_today_v2(uuid, date, text) to authenticated;
grant execute on function public.get_nutrition_plan_read_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_today_v2(uuid, date, text) is
  'One-request private read model for Today. First read may create the immutable daily snapshot.';
comment on function public.get_nutrition_plan_read_v2(uuid, date, text) is
  'One-request immutable plan read model effective on a local date.';
