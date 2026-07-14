-- Nutrition V2 additive-domain smoke test.
--
-- Safe by construction:
--   * selects one existing standalone coach/client scope;
--   * creates only V2 records with generated identifiers;
--   * uses the far-future date 2099-12-31;
--   * finishes with ROLLBACK;
--   * raises on any failed security, idempotency or history assertion.
--
-- Run with a privileged SQL connection against an environment that contains at
-- least one standalone client. Never replace the final ROLLBACK with COMMIT.

begin;

create temporary table nutrition_v2_test_context (
  client_id uuid not null,
  coach_id uuid not null,
  plan_id uuid not null,
  version_id uuid not null,
  variant_id uuid not null,
  slot_id uuid not null,
  item_id uuid not null,
  test_date date not null
) on commit drop;

grant select on nutrition_v2_test_context to authenticated;

insert into nutrition_v2_test_context (
  client_id,
  coach_id,
  plan_id,
  version_id,
  variant_id,
  slot_id,
  item_id,
  test_date
)
select
  c.id,
  c.coach_id,
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  date '2099-12-31'
from public.clients c
where c.org_id is null
  and c.team_id is null
  and c.coach_id is not null
limit 1;

do $$
begin
  if not exists (select 1 from nutrition_v2_test_context) then
    raise exception 'nutrition_v2_test_requires_standalone_client';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select coach_id::text from nutrition_v2_test_context),
  true
);
set local role authenticated;

insert into public.nutrition_plans_v2 (
  id,
  client_id,
  coach_id,
  org_id,
  team_id,
  name,
  strategy,
  created_by,
  updated_by
)
select
  plan_id,
  client_id,
  coach_id,
  null,
  null,
  'Transactional rollback smoke',
  'structured',
  coach_id,
  coach_id
from nutrition_v2_test_context;

insert into public.nutrition_plan_versions_v2 (
  id,
  plan_id,
  version_number,
  status,
  strategy,
  timezone,
  student_permissions,
  visible_notes,
  created_by,
  updated_by
)
select
  version_id,
  plan_id,
  1,
  'draft',
  'structured',
  'America/Santiago',
  '{"canRegisterFreely":true,"canAdjustPrescribedQuantity":true}'::jsonb,
  'Visible rollback smoke note',
  coach_id,
  coach_id
from nutrition_v2_test_context;

insert into public.nutrition_plan_private_notes_v2 (
  version_id,
  client_id,
  note,
  created_by,
  updated_by
)
select
  version_id,
  client_id,
  'Professional-only rollback note',
  coach_id,
  coach_id
from nutrition_v2_test_context;

insert into public.nutrition_day_variants_v2 (
  id,
  version_id,
  variant_key,
  label,
  is_default,
  target_calories,
  target_protein_g,
  target_carbs_g,
  target_fats_g
)
select
  variant_id,
  version_id,
  'default',
  'Día base',
  true,
  2100,
  160,
  230,
  65
from nutrition_v2_test_context;

insert into public.nutrition_meal_slots_v2 (
  id,
  version_id,
  day_variant_id,
  slot_code,
  name,
  slot_mode,
  is_required,
  order_index
)
select
  slot_id,
  version_id,
  variant_id,
  'post_workout',
  'Post entreno',
  'anchor',
  true,
  0
from nutrition_v2_test_context;

insert into public.nutrition_prescription_items_v2 (
  id,
  version_id,
  meal_slot_id,
  custom_name,
  quantity,
  unit,
  snapshot_name,
  snapshot_calories,
  snapshot_protein_g,
  snapshot_carbs_g,
  snapshot_fats_g
)
select
  item_id,
  version_id,
  slot_id,
  'Yogur de prueba',
  200,
  'g',
  'Yogur de prueba',
  180,
  20,
  22,
  3
from nutrition_v2_test_context;

do $$
declare
  ctx nutrition_v2_test_context%rowtype;
  published_id uuid;
  repeated_id uuid;
begin
  select * into ctx from nutrition_v2_test_context;

  if not private.nutrition_v2_can_manage_client(ctx.client_id) then
    raise exception 'nutrition_v2_coach_scope_failed';
  end if;

  published_id := public.publish_nutrition_plan_v2(
    ctx.version_id,
    ctx.test_date,
    'publish:rollback-smoke:001'
  );
  repeated_id := public.publish_nutrition_plan_v2(
    ctx.version_id,
    ctx.test_date,
    'publish:rollback-smoke:001'
  );

  if published_id <> ctx.version_id or repeated_id <> published_id then
    raise exception 'nutrition_v2_publish_idempotency_failed';
  end if;

  begin
    update public.nutrition_plans_v2
    set current_published_version_id = null
    where id = ctx.plan_id;
    raise exception 'nutrition_v2_plan_pointer_guard_failed';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  (select client_id::text from nutrition_v2_test_context),
  true
);

do $$
declare
  ctx nutrition_v2_test_context%rowtype;
  snapshot_id uuid;
  repeated_snapshot_id uuid;
  entry_id uuid;
  repeated_entry_id uuid;
  correction_id uuid;
  matched_rows integer;
  affected_rows integer;
begin
  select * into ctx from nutrition_v2_test_context;

  select count(*) into matched_rows
  from public.nutrition_plan_private_notes_v2
  where version_id = ctx.version_id;
  if matched_rows <> 0 then
    raise exception 'nutrition_v2_private_note_rls_failed';
  end if;

  begin
    execute format(
      'select private_notes from public.nutrition_plan_versions_v2 where id = %L',
      ctx.version_id
    );
    raise exception 'nutrition_v2_private_column_privilege_failed';
  exception
    when insufficient_privilege then null;
  end;

  update public.nutrition_plan_versions_v2
  set visible_notes = 'student must not update published version'
  where id = ctx.version_id;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'nutrition_v2_student_version_update_failed';
  end if;

  snapshot_id := public.ensure_nutrition_day_snapshot_v2(
    ctx.client_id,
    ctx.test_date,
    'America/Santiago'
  );
  repeated_snapshot_id := public.ensure_nutrition_day_snapshot_v2(
    ctx.client_id,
    ctx.test_date,
    'America/Santiago'
  );
  if snapshot_id is null or repeated_snapshot_id <> snapshot_id then
    raise exception 'nutrition_v2_snapshot_idempotency_failed';
  end if;

  entry_id := public.record_nutrition_intake_v2(
    ctx.client_id,
    ctx.test_date,
    timestamptz '2099-12-31 16:00:00-03',
    'America/Santiago',
    null,
    'Yogur de prueba',
    200,
    'g',
    'post_workout',
    'prescription',
    'prescription',
    ctx.version_id,
    ctx.item_id,
    'intake:rollback-smoke:001',
    null,
    '{"name":"Yogur de prueba","calories":180,"proteinG":20,"carbsG":22,"fatsG":3,"servingSize":200,"servingUnit":"g"}'::jsonb
  );
  repeated_entry_id := public.record_nutrition_intake_v2(
    ctx.client_id,
    ctx.test_date,
    timestamptz '2099-12-31 16:00:00-03',
    'America/Santiago',
    null,
    'Yogur de prueba',
    200,
    'g',
    'post_workout',
    'prescription',
    'prescription',
    ctx.version_id,
    ctx.item_id,
    'intake:rollback-smoke:001',
    null,
    '{"name":"Yogur de prueba","calories":180,"proteinG":20,"carbsG":22,"fatsG":3,"servingSize":200,"servingUnit":"g"}'::jsonb
  );
  if entry_id is null or repeated_entry_id <> entry_id then
    raise exception 'nutrition_v2_intake_idempotency_failed';
  end if;

  begin
    update public.nutrition_intake_entries
    set quantity = 999
    where id = entry_id;
    raise exception 'nutrition_v2_intake_immutability_failed';
  exception
    when sqlstate '42501' then null;
  end;

  correction_id := public.correct_nutrition_intake_v2(
    entry_id,
    'Cantidad corregida en smoke test',
    ctx.client_id,
    ctx.test_date,
    timestamptz '2099-12-31 16:05:00-03',
    'America/Santiago',
    null,
    'Yogur de prueba',
    180,
    'g',
    'post_workout',
    'prescription',
    'prescription',
    ctx.version_id,
    ctx.item_id,
    'intake:rollback-smoke:002',
    null,
    '{"name":"Yogur de prueba","calories":162,"proteinG":18,"carbsG":19.8,"fatsG":2.7,"servingSize":180,"servingUnit":"g"}'::jsonb
  );

  select count(*) into matched_rows
  from public.nutrition_intake_entries
  where id = correction_id
    and entry_status = 'active'
    and revision = 2
    and corrects_entry_id = entry_id;
  if matched_rows <> 1 then
    raise exception 'nutrition_v2_correction_chain_failed';
  end if;

  select count(*) into matched_rows
  from public.get_nutrition_history_adapter_v2(
    ctx.client_id,
    ctx.test_date,
    ctx.test_date
  )
  where source = 'v2'
    and record_id = correction_id
    and disclosure is null;
  if matched_rows <> 1 then
    raise exception 'nutrition_v2_history_adapter_failed';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);

do $$
declare
  ctx nutrition_v2_test_context%rowtype;
begin
  select * into ctx from nutrition_v2_test_context;
  begin
    perform public.ensure_nutrition_day_snapshot_v2(
      ctx.client_id,
      ctx.test_date,
      'America/Santiago'
    );
    raise exception 'nutrition_v2_bola_negative_test_failed';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

rollback;
