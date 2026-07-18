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
  plan2_id uuid not null,
  version2_id uuid not null,
  variant2_id uuid not null,
  plan3_id uuid not null,
  version3_id uuid not null,
  other_coach_id uuid not null,
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
  plan2_id,
  version2_id,
  variant2_id,
  plan3_id,
  version3_id,
  other_coach_id,
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
  gen_random_uuid(),
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
  and c.is_archived = false
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

-- Second logical plan (flexible) with a publishable draft. Used to prove the publish
-- idempotency key is scoped per plan and never leaks a foreign plan's version id.
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
  plan2_id,
  client_id,
  coach_id,
  null,
  null,
  'Segundo plan de prueba',
  'flexible',
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
  created_by,
  updated_by
)
select
  version2_id,
  plan2_id,
  1,
  'draft',
  'flexible',
  'America/Santiago',
  '{"canRegisterFreely":true,"canAdjustPrescribedQuantity":true}'::jsonb,
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
  variant2_id,
  version2_id,
  'default',
  'Día base',
  true,
  2000,
  150,
  220,
  60
from nutrition_v2_test_context;

-- Third logical plan, archived, still carrying a draft version. Used to prove the coach hub
-- attention counter ignores drafts of archived plans (regression of 20260716180000).
insert into public.nutrition_plans_v2 (
  id,
  client_id,
  coach_id,
  org_id,
  team_id,
  name,
  strategy,
  lifecycle_status,
  archived_at,
  created_by,
  updated_by
)
select
  plan3_id,
  client_id,
  coach_id,
  null,
  null,
  'Plan archivado de prueba',
  'flexible',
  'archived',
  now(),
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
  created_by,
  updated_by
)
select
  version3_id,
  plan3_id,
  1,
  'draft',
  'flexible',
  'America/Santiago',
  '{}'::jsonb,
  coach_id,
  coach_id
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

-- Publish idempotency is scoped per plan: the same key retried on the same plan is a no-op,
-- but that key reused on a DIFFERENT plan must publish that plan's own draft and never return
-- the foreign plan's version id (regression of the T11 publish-key finding).
do $$
declare
  ctx nutrition_v2_test_context%rowtype;
  same_plan_id uuid;
  cross_plan_id uuid;
  cross_retry_id uuid;
begin
  select * into ctx from nutrition_v2_test_context;

  same_plan_id := public.publish_nutrition_plan_v2(
    ctx.version_id,
    ctx.test_date,
    'publish:rollback-smoke:001'
  );
  if same_plan_id <> ctx.version_id then
    raise exception 'SMOKE FALLO: reintento de publish sobre el mismo plan no fue idempotente';
  end if;

  cross_plan_id := public.publish_nutrition_plan_v2(
    ctx.version2_id,
    ctx.test_date,
    'publish:rollback-smoke:001'
  );
  if cross_plan_id = ctx.version_id then
    raise exception 'SMOKE FALLO: la clave de publish se filtro entre planes distintos';
  end if;
  if cross_plan_id <> ctx.version2_id then
    raise exception 'SMOKE FALLO: publish del segundo plan no devolvio su propia version';
  end if;

  cross_retry_id := public.publish_nutrition_plan_v2(
    ctx.version2_id,
    ctx.test_date,
    'publish:rollback-smoke:001'
  );
  if cross_retry_id <> ctx.version2_id then
    raise exception 'SMOKE FALLO: reintento de publish del segundo plan no fue idempotente';
  end if;
end;
$$;

-- Coach read models: hub, scoped client detail (which internally drives Today and the Plan
-- read model) and the paginated history page.
do $$
declare
  ctx nutrition_v2_test_context%rowtype;
  hub jsonb;
  found jsonb := null;
  detail jsonb;
  history jsonb;
  cursor_updated timestamptz := null;
  cursor_client uuid := null;
  page_count integer := 0;
begin
  select * into ctx from nutrition_v2_test_context;

  -- Walk the keyset pages until the synthetic client surfaces on its coach roster.
  loop
    page_count := page_count + 1;
    hub := public.get_nutrition_coach_hub_scoped_v2(
      'standalone',
      null,
      null,
      cursor_updated,
      cursor_client,
      50
    );
    if jsonb_typeof(hub -> 'items') <> 'array' then
      raise exception 'SMOKE FALLO: el hub del coach no devolvio items como arreglo';
    end if;

    select elem into found
    from jsonb_array_elements(hub -> 'items') as t(elem)
    where (elem ->> 'clientId')::uuid = ctx.client_id
    limit 1;

    exit when found is not null;
    exit when not coalesce((hub ->> 'hasMore')::boolean, false);
    cursor_updated := (hub #>> '{nextCursor,updatedAt}')::timestamptz;
    cursor_client := (hub #>> '{nextCursor,clientId}')::uuid;
    exit when page_count > 500;
  end loop;

  if found is null then
    raise exception 'SMOKE FALLO: el cliente sintetico no aparece en el hub del coach';
  end if;
  if found ->> 'planId' is null then
    raise exception 'SMOKE FALLO: el hub no muestra plan asignado tras publicar';
  end if;
  -- The only draft in play belongs to the archived plan, so the attention counter must be zero.
  if coalesce((found ->> 'pendingDrafts')::integer, -1) <> 0 then
    raise exception 'SMOKE FALLO: pendingDrafts conto borradores de un plan archivado';
  end if;
  if found ->> 'attentionReason' = 'draft_pending' then
    raise exception 'SMOKE FALLO: attentionReason marca borrador pendiente de un plan archivado';
  end if;

  detail := public.get_nutrition_client_detail_scoped_v2(
    ctx.client_id,
    'standalone',
    null,
    null,
    ctx.test_date,
    'America/Santiago'
  );
  if jsonb_typeof(detail -> 'today') <> 'object' then
    raise exception 'SMOKE FALLO: el detalle scoped no trae el bloque de hoy';
  end if;
  if jsonb_typeof(detail #> '{plan,plan}') is distinct from 'object' then
    raise exception 'SMOKE FALLO: el detalle scoped trae plan nulo tras publicar';
  end if;
  if jsonb_typeof(detail -> 'recentDays') <> 'array' then
    raise exception 'SMOKE FALLO: el detalle scoped no trae dias recientes como arreglo';
  end if;

  history := public.get_nutrition_history_page_v2(ctx.client_id, null, 14);
  if jsonb_typeof(history -> 'items') <> 'array' then
    raise exception 'SMOKE FALLO: la pagina de historial no devolvio items como arreglo';
  end if;
  if history -> 'hasMore' is null then
    raise exception 'SMOKE FALLO: la pagina de historial no trae la bandera hasMore';
  end if;
end;
$$;

-- Cross-tenant denial: a synthetic coach with no relationship to the client is rejected with
-- 42501 by both the scoped detail and the history page.
select set_config(
  'request.jwt.claim.sub',
  (select other_coach_id::text from nutrition_v2_test_context),
  true
);

do $$
declare
  ctx nutrition_v2_test_context%rowtype;
begin
  select * into ctx from nutrition_v2_test_context;

  begin
    perform public.get_nutrition_client_detail_scoped_v2(
      ctx.client_id,
      'standalone',
      null,
      null,
      ctx.test_date,
      'America/Santiago'
    );
    raise exception 'SMOKE FALLO: el detalle de un cliente ajeno no fue denegado';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.get_nutrition_history_page_v2(ctx.client_id, null, 14);
    raise exception 'SMOKE FALLO: el historial de un cliente ajeno no fue denegado';
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

-- T11 guard regression: a student owns a genuine V1 row (no idempotency key) and must NOT be
-- able to forge a canonical V2 entry by setting idempotency_key directly. occurred_at and
-- timezone are supplied so the write satisfies the occurred/timezone CHECK — the only thing
-- allowed to reject it is the mutation guard. If the guard is unpatched the UPDATE succeeds and
-- this block fails loudly instead of silently.
do $$
declare
  ctx nutrition_v2_test_context%rowtype;
  legacy_entry_id uuid;
begin
  select * into ctx from nutrition_v2_test_context;

  insert into public.nutrition_intake_entries (
    client_id,
    log_date,
    quantity,
    unit,
    source,
    capture_method,
    custom_name
  ) values (
    ctx.client_id,
    ctx.test_date,
    100,
    'g',
    'offplan',
    'manual',
    'Registro V1 de prueba'
  )
  returning id into legacy_entry_id;

  begin
    update public.nutrition_intake_entries
    set idempotency_key = 'promote:rollback-smoke:001',
        occurred_at = timestamptz '2099-12-31 18:00:00-03',
        timezone = 'America/Santiago'
    where id = legacy_entry_id;
    raise exception 'SMOKE FALLO: promocion V1->V2 permitida (guard sin parchear)';
  exception
    when sqlstate '42501' then null;
  end;
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
