-- Nutrition V2: preserve the previously effective version until a scheduled
-- publication starts, and allow structural deletion only inside editable drafts.

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
  v_variant public.nutrition_day_variants_v2%rowtype;
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

create or replace function private.nutrition_v2_guard_version_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if new.id is distinct from old.id
      or new.plan_id is distinct from old.plan_id
      or new.version_number is distinct from old.version_number
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
      or new.publish_idempotency_key is distinct from old.publish_idempotency_key
      or new.private_notes is not null then
      raise exception 'nutrition_v2_version_publication_requires_rpc' using errcode = '42501';
    end if;

    -- Every direct draft update advances the optimistic-concurrency token. A
    -- client should still filter its update by the lock_version it read.
    new.lock_version := old.lock_version + 1;
  end if;
  return new;
end;
$$;

create policy nutrition_day_variants_v2_delete
on public.nutrition_day_variants_v2
for delete
to authenticated
using (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_meal_slots_v2_delete
on public.nutrition_meal_slots_v2
for delete
to authenticated
using (private.nutrition_v2_can_edit_version(version_id));

create policy nutrition_prescription_items_v2_delete
on public.nutrition_prescription_items_v2
for delete
to authenticated
using (private.nutrition_v2_can_edit_version(version_id));

grant delete on public.nutrition_day_variants_v2 to authenticated;
grant delete on public.nutrition_meal_slots_v2 to authenticated;
grant delete on public.nutrition_prescription_items_v2 to authenticated;

revoke all on function private.nutrition_v2_ensure_day_snapshot(uuid, date, text) from public, anon, authenticated;
revoke all on function private.nutrition_v2_guard_version_identity() from public, anon, authenticated;

comment on function private.nutrition_v2_ensure_day_snapshot(uuid, date, text) is
  'Resolves the version effective on the local date, including a superseded version whose effective_to still covers that day.';
