-- EVA Nutrition V2 — scoped RLS, immutable snapshots, publication and intake RPCs.
-- All SECURITY DEFINER functions use a fixed empty search_path and fully-qualified objects.

create or replace function private.nutrition_v2_can_manage_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and (
        (c.org_id is null and c.team_id is null and c.coach_id = auth.uid())
        or (
          c.org_id is not null
          and exists (
            select 1
            from public.organization_members om
            where om.org_id = c.org_id
              and om.user_id = auth.uid()
              and om.role in ('org_owner', 'org_admin')
              and om.status = 'active'
              and om.deleted_at is null
          )
        )
        or (
          c.org_id is not null
          and exists (
            select 1
            from public.coach_client_assignments cca
            join public.organization_members om
              on om.org_id = cca.org_id
             and om.coach_id = cca.coach_id
            where cca.client_id = c.id
              and cca.org_id = c.org_id
              and cca.deleted_at is null
              and om.user_id = auth.uid()
              and om.status = 'active'
              and om.deleted_at is null
          )
        )
        or (
          c.team_id is not null
          and exists (
            select 1
            from public.teams t
            where t.id = c.team_id
              and t.deleted_at is null
              and (
                t.owner_coach_id = auth.uid()
                or exists (
                  select 1
                  from public.team_members tm
                  where tm.team_id = t.id
                    and tm.coach_id = auth.uid()
                    and tm.status = 'active'
                    and tm.deleted_at is null
                )
              )
          )
        )
      )
  );
$$;

create or replace function private.nutrition_v2_can_read_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() = p_client_id
      or private.nutrition_v2_can_manage_client(p_client_id);
$$;

create or replace function private.nutrition_v2_plan_scope_matches_client(
  p_client_id uuid,
  p_coach_id uuid,
  p_org_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.coach_id = p_coach_id
      and c.org_id is not distinct from p_org_id
      and c.team_id is not distinct from p_team_id
  );
$$;

create or replace function private.nutrition_v2_can_manage_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plans_v2 p
    where p.id = p_plan_id
      and private.nutrition_v2_can_manage_client(p.client_id)
  );
$$;

create or replace function private.nutrition_v2_can_read_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plan_versions_v2 v
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where v.id = p_version_id
      and private.nutrition_v2_can_read_client(p.client_id)
      and (
        private.nutrition_v2_can_manage_client(p.client_id)
        or v.status in ('published', 'superseded')
      )
  );
$$;

create or replace function private.nutrition_v2_can_edit_version(p_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plan_versions_v2 v
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where v.id = p_version_id
      and v.status = 'draft'
      and private.nutrition_v2_can_manage_client(p.client_id)
  );
$$;

create or replace function private.nutrition_v2_actor_role(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() = p_client_id then 'student'
    when exists (
      select 1
      from public.clients c
      join public.organization_members om on om.org_id = c.org_id
      where c.id = p_client_id
        and om.user_id = auth.uid()
        and om.role in ('org_owner', 'org_admin')
        and om.status = 'active'
        and om.deleted_at is null
    ) then 'org_admin'
    when exists (
      select 1
      from public.clients c
      join public.team_members tm on tm.team_id = c.team_id
      where c.id = p_client_id
        and tm.coach_id = auth.uid()
        and tm.status = 'active'
        and tm.deleted_at is null
    ) then 'team_member'
    else 'coach'
  end;
$$;

create or replace function private.nutrition_v2_write_audit(
  p_client_id uuid,
  p_plan_id uuid,
  p_version_id uuid,
  p_intake_entry_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.nutrition_v2_audit_log (
    client_id,
    plan_id,
    version_id,
    intake_entry_id,
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    idempotency_key,
    metadata
  ) values (
    p_client_id,
    p_plan_id,
    p_version_id,
    p_intake_entry_id,
    auth.uid(),
    coalesce(private.nutrition_v2_actor_role(p_client_id), 'system'),
    p_action,
    p_entity_type,
    p_entity_id,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.nutrition_v2_build_prescription_snapshot(
  p_version_id uuid,
  p_variant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', jsonb_build_object(
      'id', v.id,
      'number', v.version_number,
      'strategy', v.strategy,
      'effectiveFrom', v.effective_from,
      'timezone', v.timezone
    ),
    'variant', case
      when dv.id is null then null
      else jsonb_build_object(
        'id', dv.id,
        'key', dv.variant_key,
        'label', dv.label,
        'dayOfWeek', dv.day_of_week,
        'isDefault', dv.is_default,
        'targets', jsonb_build_object(
          'calories', dv.target_calories,
          'proteinG', dv.target_protein_g,
          'carbsG', dv.target_carbs_g,
          'fatsG', dv.target_fats_g,
          'fiberG', dv.target_fiber_g,
          'sodiumMg', dv.target_sodium_mg,
          'waterMl', dv.target_water_ml
        )
      )
    end,
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
          'targets', jsonb_build_object(
            'calories', ms.target_calories,
            'proteinG', ms.target_protein_g,
            'carbsG', ms.target_carbs_g,
            'fatsG', ms.target_fats_g
          ),
          'items', coalesce((
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
  )
  from public.nutrition_plan_versions_v2 v
  left join public.nutrition_day_variants_v2 dv
    on dv.id = p_variant_id
   and dv.version_id = v.id
  where v.id = p_version_id;
$$;

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
  v_variant record;
  v_prescription jsonb := '{}'::jsonb;
begin
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
    and v.status = 'published'
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

create or replace function public.ensure_nutrition_day_snapshot_v2(
  p_client_id uuid,
  p_local_date date,
  p_timezone text default 'America/Santiago'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_client_scope_denied' using errcode = '42501';
  end if;
  if p_local_date is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_invalid_snapshot_input' using errcode = '22023';
  end if;
  return private.nutrition_v2_ensure_day_snapshot(p_client_id, p_local_date, p_timezone);
end;
$$;

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

  select id into v_existing_id
  from public.nutrition_plan_versions_v2
  where publish_idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
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

create or replace function public.record_nutrition_intake_v2(
  p_client_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_food_id uuid,
  p_custom_name text,
  p_quantity numeric,
  p_unit text,
  p_meal_slot text,
  p_source text,
  p_capture_method text,
  p_plan_version_id uuid,
  p_prescription_item_id uuid,
  p_idempotency_key text,
  p_note text,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_entry_id uuid;
  v_snapshot_id uuid;
  v_plan_id uuid;
  v_actor_role text;
  v_legacy_source text;
  v_legacy_capture text;
  v_legacy_slot text;
begin
  if auth.uid() is null or not private.nutrition_v2_can_read_client(p_client_id) then
    raise exception 'nutrition_v2_intake_scope_denied' using errcode = '42501';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'nutrition_v2_invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_local_date is null or p_occurred_at is null or p_timezone is null or char_length(p_timezone) not between 1 and 80 then
    raise exception 'nutrition_v2_invalid_intake_time' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_unit is null or char_length(btrim(p_unit)) not between 1 and 32 then
    raise exception 'nutrition_v2_invalid_quantity' using errcode = '22023';
  end if;
  if p_food_id is null and nullif(btrim(p_custom_name), '') is null then
    raise exception 'nutrition_v2_food_or_name_required' using errcode = '22023';
  end if;
  if p_source not in ('offplan', 'prescription', 'substitution', 'recipe', 'manual', 'legacy') then
    raise exception 'nutrition_v2_invalid_source' using errcode = '22023';
  end if;
  if p_capture_method not in ('search', 'barcode', 'recent', 'favorite', 'recipe', 'prescription', 'manual', 'legacy') then
    raise exception 'nutrition_v2_invalid_capture_method' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'nutrition_v2_invalid_snapshot' using errcode = '22023';
  end if;

  select id into v_existing_id
  from public.nutrition_intake_entries
  where client_id = p_client_id
    and idempotency_key = p_idempotency_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_plan_version_id is not null then
    select p.id into v_plan_id
    from public.nutrition_plan_versions_v2 v
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where v.id = p_plan_version_id
      and p.client_id = p_client_id
      and v.status in ('published', 'superseded');
    if v_plan_id is null then
      raise exception 'nutrition_v2_plan_version_scope_denied' using errcode = '42501';
    end if;
  end if;

  if p_prescription_item_id is not null and not exists (
    select 1
    from public.nutrition_prescription_items_v2 pi
    join public.nutrition_plan_versions_v2 v on v.id = pi.version_id
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where pi.id = p_prescription_item_id
      and p.client_id = p_client_id
      and (p_plan_version_id is null or pi.version_id = p_plan_version_id)
  ) then
    raise exception 'nutrition_v2_prescription_scope_denied' using errcode = '42501';
  end if;

  v_snapshot_id := private.nutrition_v2_ensure_day_snapshot(p_client_id, p_local_date, p_timezone);
  v_actor_role := private.nutrition_v2_actor_role(p_client_id);

  v_legacy_source := case
    when p_capture_method = 'recent' then 'recent'
    else 'offplan'
  end;
  v_legacy_capture := case
    when p_capture_method in ('search', 'barcode', 'recent', 'manual') then p_capture_method
    when p_capture_method = 'favorite' then 'recent'
    else 'manual'
  end;
  v_legacy_slot := case
    when p_meal_slot in ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'other') then p_meal_slot
    when p_meal_slot is null then null
    else 'other'
  end;

  insert into public.nutrition_intake_entries (
    client_id,
    log_date,
    food_id,
    custom_name,
    quantity,
    unit,
    source,
    meal_slot,
    capture_method,
    note,
    snapshot_name,
    snapshot_brand,
    snapshot_calories,
    snapshot_protein_g,
    snapshot_carbs_g,
    snapshot_fats_g,
    snapshot_fiber_g,
    snapshot_serving_size,
    snapshot_serving_unit,
    idempotency_key,
    actor_user_id,
    actor_role,
    entry_status,
    occurred_at,
    timezone,
    plan_version_id,
    day_snapshot_id,
    prescription_item_id,
    intake_source_v2,
    capture_method_v2,
    meal_slot_v2,
    revision
  ) values (
    p_client_id,
    p_local_date,
    p_food_id,
    nullif(btrim(p_custom_name), ''),
    p_quantity,
    btrim(p_unit),
    v_legacy_source,
    v_legacy_slot,
    v_legacy_capture,
    nullif(btrim(p_note), ''),
    coalesce(nullif(btrim(p_snapshot ->> 'name'), ''), nullif(btrim(p_custom_name), ''), 'Alimento'),
    nullif(btrim(p_snapshot ->> 'brand'), ''),
    nullif(p_snapshot ->> 'calories', '')::numeric,
    nullif(p_snapshot ->> 'proteinG', '')::numeric,
    nullif(p_snapshot ->> 'carbsG', '')::numeric,
    nullif(p_snapshot ->> 'fatsG', '')::numeric,
    nullif(p_snapshot ->> 'fiberG', '')::numeric,
    nullif(p_snapshot ->> 'servingSize', '')::numeric,
    nullif(btrim(p_snapshot ->> 'servingUnit'), ''),
    p_idempotency_key,
    auth.uid(),
    v_actor_role,
    'active',
    p_occurred_at,
    p_timezone,
    p_plan_version_id,
    v_snapshot_id,
    p_prescription_item_id,
    p_source,
    p_capture_method,
    nullif(btrim(p_meal_slot), ''),
    1
  )
  returning id into v_entry_id;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    p_plan_version_id,
    v_entry_id,
    'intake.recorded',
    'nutrition_intake_entry',
    v_entry_id,
    p_idempotency_key,
    jsonb_build_object('source', p_source, 'captureMethod', p_capture_method, 'mealSlot', p_meal_slot)
  );

  return v_entry_id;
end;
$$;

create or replace function public.correct_nutrition_intake_v2(
  p_corrects_entry_id uuid,
  p_correction_reason text,
  p_client_id uuid,
  p_local_date date,
  p_occurred_at timestamptz,
  p_timezone text,
  p_food_id uuid,
  p_custom_name text,
  p_quantity numeric,
  p_unit text,
  p_meal_slot text,
  p_source text,
  p_capture_method text,
  p_plan_version_id uuid,
  p_prescription_item_id uuid,
  p_idempotency_key text,
  p_note text,
  p_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original public.nutrition_intake_entries%rowtype;
  v_new_id uuid;
  v_plan_id uuid;
begin
  if p_correction_reason is null or char_length(btrim(p_correction_reason)) not between 3 and 1000 then
    raise exception 'nutrition_v2_correction_reason_required' using errcode = '22023';
  end if;

  select * into v_original
  from public.nutrition_intake_entries
  where id = p_corrects_entry_id
  for update;

  if v_original.id is null or v_original.client_id <> p_client_id then
    raise exception 'nutrition_v2_original_entry_not_found' using errcode = 'P0002';
  end if;
  if auth.uid() is null or not private.nutrition_v2_can_read_client(v_original.client_id) then
    raise exception 'nutrition_v2_correction_scope_denied' using errcode = '42501';
  end if;
  if v_original.idempotency_key is null then
    raise exception 'nutrition_v2_legacy_entry_requires_legacy_flow' using errcode = '22023';
  end if;
  if v_original.entry_status <> 'active' then
    raise exception 'nutrition_v2_only_active_entries_can_correct' using errcode = '22023';
  end if;

  v_new_id := public.record_nutrition_intake_v2(
    p_client_id,
    p_local_date,
    p_occurred_at,
    p_timezone,
    p_food_id,
    p_custom_name,
    p_quantity,
    p_unit,
    p_meal_slot,
    p_source,
    p_capture_method,
    p_plan_version_id,
    p_prescription_item_id,
    p_idempotency_key,
    p_note,
    p_snapshot
  );

  update public.nutrition_intake_entries
  set corrects_entry_id = v_original.id,
      revision = v_original.revision + 1
  where id = v_new_id;

  update public.nutrition_intake_entries
  set entry_status = 'corrected',
      corrected_by_entry_id = v_new_id,
      correction_reason = btrim(p_correction_reason),
      updated_at = now()
  where id = v_original.id;

  if p_plan_version_id is not null then
    select plan_id into v_plan_id
    from public.nutrition_plan_versions_v2
    where id = p_plan_version_id;
  end if;

  perform private.nutrition_v2_write_audit(
    p_client_id,
    v_plan_id,
    p_plan_version_id,
    v_new_id,
    'intake.corrected',
    'nutrition_intake_entry',
    v_new_id,
    p_idempotency_key,
    jsonb_build_object('correctsEntryId', v_original.id, 'reason', btrim(p_correction_reason))
  );

  return v_new_id;
end;
$$;

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
      e.quantity,
      e.unit,
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

-- RLS: logical plans.
create policy nutrition_plans_v2_select
on public.nutrition_plans_v2
for select
to authenticated
using (
  private.nutrition_v2_can_manage_client(client_id)
  or (auth.uid() = client_id and current_published_version_id is not null)
);

create policy nutrition_plans_v2_insert
on public.nutrition_plans_v2
for insert
to authenticated
with check (
  private.nutrition_v2_can_manage_client(client_id)
  and private.nutrition_v2_plan_scope_matches_client(client_id, coach_id, org_id, team_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and current_published_version_id is null
);

create policy nutrition_plans_v2_update
on public.nutrition_plans_v2
for update
to authenticated
using (private.nutrition_v2_can_manage_client(client_id))
with check (
  private.nutrition_v2_can_manage_client(client_id)
  and private.nutrition_v2_plan_scope_matches_client(client_id, coach_id, org_id, team_id)
);

-- RLS: versions and version children.
create policy nutrition_plan_versions_v2_select
on public.nutrition_plan_versions_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(id));

create policy nutrition_plan_versions_v2_insert
on public.nutrition_plan_versions_v2
for insert
to authenticated
with check (
  status = 'draft'
  and private.nutrition_v2_can_manage_plan(plan_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and published_at is null
  and published_by is null
  and publish_idempotency_key is null
);

create policy nutrition_plan_versions_v2_update
on public.nutrition_plan_versions_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(id))
with check (
  status = 'draft'
  and private.nutrition_v2_can_manage_plan(plan_id)
  and published_at is null
  and published_by is null
  and publish_idempotency_key is null
);

create policy nutrition_day_variants_v2_select
on public.nutrition_day_variants_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(version_id));

create policy nutrition_day_variants_v2_insert
on public.nutrition_day_variants_v2
for insert
to authenticated
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_day_variants_v2_update
on public.nutrition_day_variants_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(version_id))
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_meal_slots_v2_select
on public.nutrition_meal_slots_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(version_id));

create policy nutrition_meal_slots_v2_insert
on public.nutrition_meal_slots_v2
for insert
to authenticated
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_meal_slots_v2_update
on public.nutrition_meal_slots_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(version_id))
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_prescription_items_v2_select
on public.nutrition_prescription_items_v2
for select
to authenticated
using (private.nutrition_v2_can_read_version(version_id));

create policy nutrition_prescription_items_v2_insert
on public.nutrition_prescription_items_v2
for insert
to authenticated
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_prescription_items_v2_update
on public.nutrition_prescription_items_v2
for update
to authenticated
using (private.nutrition_v2_can_edit_version(version_id))
with check (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_day_snapshots_v2_select
on public.nutrition_day_snapshots_v2
for select
to authenticated
using (private.nutrition_v2_can_read_client(client_id));

create policy nutrition_v2_audit_log_select
on public.nutrition_v2_audit_log
for select
to authenticated
using (client_id is not null and private.nutrition_v2_can_manage_client(client_id));

-- Explicit grants. There are intentionally no DELETE grants and no direct
-- INSERT/UPDATE grants for snapshots or audit rows.
grant usage on schema private to authenticated;
grant select, insert, update on public.nutrition_plans_v2 to authenticated;
grant select, insert, update on public.nutrition_plan_versions_v2 to authenticated;
grant select, insert, update on public.nutrition_day_variants_v2 to authenticated;
grant select, insert, update on public.nutrition_meal_slots_v2 to authenticated;
grant select, insert, update on public.nutrition_prescription_items_v2 to authenticated;
grant select on public.nutrition_day_snapshots_v2 to authenticated;
grant select on public.nutrition_v2_audit_log to authenticated;

revoke all on function private.nutrition_v2_can_manage_client(uuid) from public, anon;
revoke all on function private.nutrition_v2_can_read_client(uuid) from public, anon;
revoke all on function private.nutrition_v2_plan_scope_matches_client(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function private.nutrition_v2_can_manage_plan(uuid) from public, anon;
revoke all on function private.nutrition_v2_can_read_version(uuid) from public, anon;
revoke all on function private.nutrition_v2_can_edit_version(uuid) from public, anon;
revoke all on function private.nutrition_v2_actor_role(uuid) from public, anon, authenticated;
revoke all on function private.nutrition_v2_write_audit(uuid, uuid, uuid, uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function private.nutrition_v2_build_prescription_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.nutrition_v2_ensure_day_snapshot(uuid, date, text) from public, anon, authenticated;

grant execute on function private.nutrition_v2_can_manage_client(uuid) to authenticated;
grant execute on function private.nutrition_v2_can_read_client(uuid) to authenticated;
grant execute on function private.nutrition_v2_plan_scope_matches_client(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function private.nutrition_v2_can_manage_plan(uuid) to authenticated;
grant execute on function private.nutrition_v2_can_read_version(uuid) to authenticated;
grant execute on function private.nutrition_v2_can_edit_version(uuid) to authenticated;

revoke all on function public.ensure_nutrition_day_snapshot_v2(uuid, date, text) from public, anon;
revoke all on function public.publish_nutrition_plan_v2(uuid, date, text) from public, anon;
revoke all on function public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.correct_nutrition_intake_v2(uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.get_nutrition_history_adapter_v2(uuid, date, date) from public, anon;

grant execute on function public.ensure_nutrition_day_snapshot_v2(uuid, date, text) to authenticated;
grant execute on function public.publish_nutrition_plan_v2(uuid, date, text) to authenticated;
grant execute on function public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.correct_nutrition_intake_v2(uuid, text, uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.get_nutrition_history_adapter_v2(uuid, date, date) to authenticated;

comment on function public.publish_nutrition_plan_v2(uuid, date, text) is 'Publishes one draft version transactionally and supersedes the previous active version.';
comment on function public.record_nutrition_intake_v2(uuid, date, timestamptz, text, uuid, text, numeric, text, text, text, text, uuid, uuid, text, text, jsonb) is 'Idempotent audited V2 intake write. Legacy intake columns remain populated compatibly.';
comment on function public.get_nutrition_history_adapter_v2(uuid, date, date) is 'Returns canonical V2 intake plus honest legacy meal-completion history without inventing food detail.';
