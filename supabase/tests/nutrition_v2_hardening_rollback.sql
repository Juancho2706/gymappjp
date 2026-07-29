-- Nutrition V2 hardening smoke test (auditoria 2026-07-28).
--
-- Cubre los invariantes NUEVOS de este PR:
--   NUT-016  ventana de fechas y timezone real del snapshot diario
--   NUT-031  retry idempotente de la correccion (misma key => mismo id)
--   NUT-029  alumno archivado no lee sus propias RPC V2 (42501)
--   NUT-033  gate de escritura fail-CLOSED sin ancla de billing
--   NUT-034  updated_by derivado del servidor (no falsificable)
--   NUT-032  FK compuesta (prescription_item_id, version_id) en sustituciones
--   NUT-001  base de macros: el factor legado no cambia; per_100 / per_serving aplican
--
-- Seguro por construccion:
--   * toma un coach/alumno standalone existente;
--   * crea solo registros V2 con identificadores generados;
--   * usa current_date (NUT-016 acota el snapshot a [hoy-400, hoy+1]);
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- Correr con una conexion SQL privilegiada contra un entorno que tenga al menos un
-- alumno standalone. NUNCA reemplazar el ROLLBACK final por COMMIT.

begin;

create temporary table nut_hardening_ctx (
  client_id uuid not null,
  coach_id uuid not null,
  stranger_id uuid not null,
  plan_id uuid not null,
  version_a_id uuid not null,
  variant_a_id uuid not null,
  slot_a_id uuid not null,
  item_a_id uuid not null,
  version_b_id uuid not null,
  variant_b_id uuid not null,
  slot_b_id uuid not null,
  item_b_id uuid not null,
  test_date date not null
) on commit drop;

insert into nut_hardening_ctx
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
  current_date
from public.clients c
where c.org_id is null
  and c.team_id is null
  and c.coach_id is not null
  and c.is_archived = false
  and c.is_active is not false
limit 1;

do $$
begin
  if not exists (select 1 from nut_hardening_ctx) then
    raise exception 'nutrition_v2_hardening_requires_standalone_client';
  end if;
end;
$$;

-- ── Arbol minimo: un plan con DOS versiones draft (A y B) ────────────────────
insert into public.nutrition_plans_v2 (
  id, client_id, coach_id, org_id, team_id, name, strategy, created_by, updated_by
)
select plan_id, client_id, coach_id, null, null,
       'Hardening rollback smoke', 'structured', coach_id, coach_id
from nut_hardening_ctx;

insert into public.nutrition_plan_versions_v2 (
  id, plan_id, version_number, status, strategy, timezone,
  student_permissions, created_by, updated_by
)
select version_a_id, plan_id, 1, 'draft', 'structured', 'America/Santiago',
       '{"canRegisterFreely":true}'::jsonb, coach_id, coach_id
from nut_hardening_ctx;

insert into public.nutrition_plan_versions_v2 (
  id, plan_id, version_number, status, strategy, timezone,
  student_permissions, created_by, updated_by
)
select version_b_id, plan_id, 2, 'draft', 'structured', 'America/Santiago',
       '{"canRegisterFreely":true}'::jsonb, coach_id, coach_id
from nut_hardening_ctx;

insert into public.nutrition_day_variants_v2 (
  id, version_id, variant_key, label, is_default,
  target_calories, target_protein_g, target_carbs_g, target_fats_g
)
select variant_a_id, version_a_id, 'default', 'Día base', true, 2100, 160, 230, 65
from nut_hardening_ctx;

insert into public.nutrition_day_variants_v2 (
  id, version_id, variant_key, label, is_default,
  target_calories, target_protein_g, target_carbs_g, target_fats_g
)
select variant_b_id, version_b_id, 'default', 'Día base', true, 2100, 160, 230, 65
from nut_hardening_ctx;

insert into public.nutrition_meal_slots_v2 (
  id, version_id, day_variant_id, slot_code, name, slot_mode, is_required, order_index
)
select slot_a_id, version_a_id, variant_a_id, 'post_workout', 'Post entreno', 'anchor', true, 0
from nut_hardening_ctx;

insert into public.nutrition_meal_slots_v2 (
  id, version_id, day_variant_id, slot_code, name, slot_mode, is_required, order_index
)
select slot_b_id, version_b_id, variant_b_id, 'post_workout', 'Post entreno', 'anchor', true, 0
from nut_hardening_ctx;

insert into public.nutrition_prescription_items_v2 (
  id, version_id, meal_slot_id, custom_name, quantity, unit,
  snapshot_name, snapshot_calories, snapshot_protein_g, snapshot_carbs_g, snapshot_fats_g
)
select item_a_id, version_a_id, slot_a_id, 'Yogur de prueba', 200, 'g',
       'Yogur de prueba', 180, 20, 22, 3
from nut_hardening_ctx;

insert into public.nutrition_prescription_items_v2 (
  id, version_id, meal_slot_id, custom_name, quantity, unit,
  snapshot_name, snapshot_calories, snapshot_protein_g, snapshot_carbs_g, snapshot_fats_g
)
select item_b_id, version_b_id, slot_b_id, 'Avena de prueba', 60, 'g',
       'Avena de prueba', 220, 8, 38, 4
from nut_hardening_ctx;

-- ============================================================================
-- NUT-032 — FK compuesta (prescription_item_id, version_id)
-- ============================================================================
do $$
declare
  ctx nut_hardening_ctx%rowtype;
  new_id uuid;
begin
  select * into ctx from nut_hardening_ctx;

  -- Positivo: par consistente (item A bajo version A).
  insert into public.nutrition_item_substitutions_v2 (
    version_id, prescription_item_id, custom_name, snapshot_name, order_index
  ) values (
    ctx.version_a_id, ctx.item_a_id, 'Kefir de prueba', 'Kefir de prueba', 0
  )
  returning id into new_id;
  if new_id is null then
    raise exception 'SMOKE FALLO: la sustitucion consistente no se pudo insertar';
  end if;

  -- Negativo: item de la version B colgado de la version A => violacion de FK (23503).
  begin
    insert into public.nutrition_item_substitutions_v2 (
      version_id, prescription_item_id, custom_name, snapshot_name, order_index
    ) values (
      ctx.version_a_id, ctx.item_b_id, 'Reemplazo cruzado', 'Reemplazo cruzado', 1
    );
    raise exception 'SMOKE FALLO: se colo una sustitucion con item de OTRA version (NUT-032)';
  exception
    when foreign_key_violation then null;
  end;

  -- Cascade: borrar el item limpia sus sustituciones.
  delete from public.nutrition_prescription_items_v2 where id = ctx.item_a_id;
  if exists (select 1 from public.nutrition_item_substitutions_v2 where id = new_id) then
    raise exception 'SMOKE FALLO: la sustitucion sobrevivio al borrado del item (cascade)';
  end if;

  -- Restaurar el item para los tests siguientes.
  insert into public.nutrition_prescription_items_v2 (
    id, version_id, meal_slot_id, custom_name, quantity, unit,
    snapshot_name, snapshot_calories, snapshot_protein_g, snapshot_carbs_g, snapshot_fats_g
  ) values (
    ctx.item_a_id, ctx.version_a_id, ctx.slot_a_id, 'Yogur de prueba', 200, 'g',
    'Yogur de prueba', 180, 20, 22, 3
  );
end;
$$;

-- ============================================================================
-- NUT-001 — el factor legado NO cambia; per_100 / per_serving aplican la base
-- ============================================================================
do $$
begin
  -- Legado (basis null): 100 g con serving_size 60 => 100/60 (formula historica INTACTA).
  if round(private.nutrition_v2_entry_factor(100, 'g', 60, null), 6)
     <> round(100::numeric / 60, 6) then
    raise exception 'SMOKE FALLO: el factor LEGADO cambio (se reescribiria el historial)';
  end if;
  if private.nutrition_v2_entry_factor(1, 'un', 60, null) <> 1 then
    raise exception 'SMOKE FALLO: el factor LEGADO contable cambio';
  end if;

  -- per_100: g/ml => qty/100 · contable => qty*serving/100 · porcion => qty.
  if private.nutrition_v2_entry_factor(100, 'g', 60, 'per_100') <> 1 then
    raise exception 'SMOKE FALLO: per_100 g/ml no divide por 100';
  end if;
  if private.nutrition_v2_entry_factor(1, 'un', 60, 'per_100') <> 0.6 then
    raise exception 'SMOKE FALLO: per_100 contable no usa serving_size/100';
  end if;
  if private.nutrition_v2_entry_factor(2, 'porción', null, 'per_100') <> 2 then
    raise exception 'SMOKE FALLO: per_100 porcion no es passthrough de la cantidad';
  end if;

  -- per_serving: g/ml => qty/serving · contable/porcion => qty.
  if private.nutrition_v2_entry_factor(10, 'g', 5, 'per_serving') <> 2 then
    raise exception 'SMOKE FALLO: per_serving g/ml no divide por serving_size';
  end if;
  if private.nutrition_v2_entry_factor(3, 'un', 5, 'per_serving') <> 3 then
    raise exception 'SMOKE FALLO: per_serving contable no es passthrough';
  end if;

  -- Las filas del seed de intercambios quedaron marcadas per_serving.
  if exists (
    select 1 from public.foods
    where exchange_group_id is not null
      and macros_basis is distinct from 'per_serving'
  ) then
    raise exception 'SMOKE FALLO: el backfill de macros_basis del seed no cubrio todas las filas';
  end if;
end;
$$;

-- ============================================================================
-- NUT-016 — ventana de fechas y timezone real (identidad = el propio alumno)
-- ============================================================================
select set_config(
  'request.jwt.claim.sub',
  (select client_id::text from nut_hardening_ctx),
  true
);

do $$
declare
  ctx nut_hardening_ctx%rowtype;
begin
  select * into ctx from nut_hardening_ctx;

  begin
    perform public.ensure_nutrition_day_snapshot_v2(
      ctx.client_id, ctx.test_date + 30, 'America/Santiago'
    );
    raise exception 'SMOKE FALLO: se materializo un snapshot 30 dias en el futuro (NUT-016)';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.ensure_nutrition_day_snapshot_v2(
      ctx.client_id, ctx.test_date - 500, 'America/Santiago'
    );
    raise exception 'SMOKE FALLO: se materializo un snapshot 500 dias en el pasado (NUT-016)';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.ensure_nutrition_day_snapshot_v2(
      ctx.client_id, ctx.test_date, 'Marte/Olympus'
    );
    raise exception 'SMOKE FALLO: se acepto un timezone inexistente (NUT-016)';
  exception
    when sqlstate '22023' then null;
  end;

  -- Caso feliz: hoy + timezone valido sigue funcionando.
  if public.ensure_nutrition_day_snapshot_v2(
       ctx.client_id, ctx.test_date, 'America/Santiago'
     ) is null then
    raise exception 'SMOKE FALLO: el snapshot del dia actual dejo de materializarse';
  end if;
end;
$$;

-- ============================================================================
-- NUT-031 — retry de la correccion con la MISMA key devuelve el MISMO id
-- ============================================================================
do $$
declare
  ctx nut_hardening_ctx%rowtype;
  entry_id uuid;
  correction_id uuid;
  retry_id uuid;
  key_rows integer;
  original_revision integer;
begin
  select * into ctx from nut_hardening_ctx;

  entry_id := public.record_nutrition_intake_v2(
    ctx.client_id,
    ctx.test_date,
    (ctx.test_date + time '16:00') at time zone 'America/Santiago',
    'America/Santiago',
    null,
    'Yogur de prueba',
    200,
    'g',
    'post_workout',
    'offplan',
    'manual',
    null,
    null,
    'intake:hardening-smoke:001',
    null,
    '{"name":"Yogur de prueba","calories":180,"proteinG":20,"carbsG":22,"fatsG":3,"servingSize":200,"servingUnit":"g","macrosBasis":"per_100"}'::jsonb
  );

  -- La base viajo por el snapshot y quedo congelada en la entry.
  if (select snapshot_macros_basis from public.nutrition_intake_entries where id = entry_id)
     is distinct from 'per_100' then
    raise exception 'SMOKE FALLO: snapshot_macros_basis no se congelo (NUT-001)';
  end if;

  correction_id := public.correct_nutrition_intake_v2(
    entry_id,
    'Cantidad corregida en smoke de hardening',
    ctx.client_id,
    ctx.test_date,
    (ctx.test_date + time '16:05') at time zone 'America/Santiago',
    'America/Santiago',
    null,
    'Yogur de prueba',
    180,
    'g',
    'post_workout',
    'offplan',
    'manual',
    null,
    null,
    'intake:hardening-smoke:002',
    null,
    '{"name":"Yogur de prueba","calories":162,"proteinG":18,"carbsG":19.8,"fatsG":2.7,"servingSize":180,"servingUnit":"g","macrosBasis":"per_100"}'::jsonb
  );

  -- Reintento byte a byte: antes devolvia 22023; ahora debe devolver el id previo.
  retry_id := public.correct_nutrition_intake_v2(
    entry_id,
    'Cantidad corregida en smoke de hardening',
    ctx.client_id,
    ctx.test_date,
    (ctx.test_date + time '16:05') at time zone 'America/Santiago',
    'America/Santiago',
    null,
    'Yogur de prueba',
    180,
    'g',
    'post_workout',
    'offplan',
    'manual',
    null,
    null,
    'intake:hardening-smoke:002',
    null,
    '{"name":"Yogur de prueba","calories":162,"proteinG":18,"carbsG":19.8,"fatsG":2.7,"servingSize":180,"servingUnit":"g","macrosBasis":"per_100"}'::jsonb
  );

  if retry_id is distinct from correction_id then
    raise exception 'SMOKE FALLO: el retry de la correccion no fue idempotente (NUT-031)';
  end if;

  select count(*) into key_rows
  from public.nutrition_intake_entries
  where client_id = ctx.client_id
    and idempotency_key = 'intake:hardening-smoke:002';
  if key_rows <> 1 then
    raise exception 'SMOKE FALLO: el retry duplico la entry correctora (% filas)', key_rows;
  end if;

  select revision into original_revision
  from public.nutrition_intake_entries where id = entry_id;
  if original_revision <> 1 then
    raise exception 'SMOKE FALLO: la revision del original avanzo dos veces';
  end if;

  if (select entry_status from public.nutrition_intake_entries where id = entry_id) <> 'corrected' then
    raise exception 'SMOKE FALLO: el original no quedo en corrected';
  end if;
end;
$$;

-- ============================================================================
-- NUT-033 — gate de escritura CIERRA sin ancla de billing y con coach ausente
-- ============================================================================
do $$
declare
  ctx nut_hardening_ctx%rowtype;
  saved_status text;
  saved_period_end timestamptz;
  saved_anchor timestamptz;
begin
  select * into ctx from nut_hardening_ctx;

  select subscription_status, current_period_end, paid_access_ended_at
    into saved_status, saved_period_end, saved_anchor
  from public.coaches where id = ctx.coach_id;

  -- Coach pausado SIN ancla ni periodo: antes devolvia true (fail-open).
  update public.coaches
  set subscription_status = 'paused',
      current_period_end = null,
      paid_access_ended_at = null
  where id = ctx.coach_id;

  if private.student_write_allowed(ctx.client_id) then
    raise exception 'SMOKE FALLO: el gate abrio sin ancla de billing (NUT-033)';
  end if;

  -- Alumno archivado con coach_id NULL: el INNER JOIN lo dejaba pasar.
  update public.clients set coach_id = null, is_archived = true where id = ctx.client_id;
  if private.student_write_allowed(ctx.client_id) then
    raise exception 'SMOKE FALLO: alumno archivado sin coach conserva escritura (NUT-033)';
  end if;

  -- Alumno activo sin coach (org-managed legitimo): sigue pudiendo escribir.
  update public.clients set is_archived = false where id = ctx.client_id;
  if not private.student_write_allowed(ctx.client_id) then
    raise exception 'SMOKE FALLO: alumno org-managed activo perdio la escritura (NUT-033)';
  end if;

  -- Restaurar estado para los tests siguientes.
  update public.clients set coach_id = ctx.coach_id where id = ctx.client_id;
  update public.coaches
  set subscription_status = saved_status,
      current_period_end = saved_period_end,
      paid_access_ended_at = saved_anchor
  where id = ctx.coach_id;
end;
$$;

-- ============================================================================
-- NUT-029 — alumno archivado no lee sus propias RPC V2 (42501)
-- ============================================================================
do $$
declare
  ctx nut_hardening_ctx%rowtype;
begin
  select * into ctx from nut_hardening_ctx;

  update public.clients set is_archived = true where id = ctx.client_id;

  begin
    perform public.get_nutrition_today_v2(ctx.client_id, ctx.test_date, 'America/Santiago');
    raise exception 'SMOKE FALLO: alumno archivado leyo su propio Hoy V2 (NUT-029)';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.get_nutrition_plan_read_v2(ctx.client_id, ctx.test_date, 'America/Santiago');
    raise exception 'SMOKE FALLO: alumno archivado leyo su propio plan V2 (NUT-029)';
  exception
    when sqlstate '42501' then null;
  end;

  update public.clients set is_archived = false where id = ctx.client_id;
end;
$$;

-- Regresion positiva: el COACH sigue viendo a su alumno aunque este archivado.
select set_config(
  'request.jwt.claim.sub',
  (select coach_id::text from nut_hardening_ctx),
  true
);

do $$
declare
  ctx nut_hardening_ctx%rowtype;
begin
  select * into ctx from nut_hardening_ctx;

  update public.clients set is_archived = true where id = ctx.client_id;

  if not private.nutrition_v2_can_read_client(ctx.client_id) then
    raise exception 'SMOKE FALLO: el coach perdio la lectura de su alumno archivado (NUT-029)';
  end if;

  update public.clients set is_archived = false where id = ctx.client_id;
end;
$$;

-- ============================================================================
-- NUT-034 — updated_by lo deriva el servidor, no el cliente
-- ============================================================================
set local role authenticated;

do $$
declare
  ctx nut_hardening_ctx%rowtype;
  stored_actor uuid;
begin
  select * into ctx from nut_hardening_ctx;

  update public.nutrition_plans_v2
  set name = 'Hardening rollback smoke (editado)',
      updated_by = ctx.stranger_id
  where id = ctx.plan_id;

  select updated_by into stored_actor
  from public.nutrition_plans_v2 where id = ctx.plan_id;

  if stored_actor = ctx.stranger_id then
    raise exception 'SMOKE FALLO: updated_by falsificable en nutrition_plans_v2 (NUT-034)';
  end if;
  if stored_actor is distinct from ctx.coach_id then
    raise exception 'SMOKE FALLO: updated_by no quedo con el actor real del JWT';
  end if;

  update public.nutrition_plan_versions_v2
  set visible_notes = 'nota editada en smoke',
      updated_by = ctx.stranger_id
  where id = ctx.version_a_id;

  select updated_by into stored_actor
  from public.nutrition_plan_versions_v2 where id = ctx.version_a_id;

  if stored_actor = ctx.stranger_id then
    raise exception 'SMOKE FALLO: updated_by falsificable en nutrition_plan_versions_v2 (NUT-034)';
  end if;
end;
$$;

reset role;

-- ============================================================================
-- NUT-030 — la RPC de coach SIN scope de workspace ya no es ejecutable
-- ============================================================================
set local role authenticated;

do $$
declare
  ctx nut_hardening_ctx%rowtype;
begin
  select * into ctx from nut_hardening_ctx;

  begin
    perform public.get_nutrition_client_detail_v2(
      ctx.client_id, ctx.test_date, 'America/Santiago'
    );
    raise exception 'SMOKE FALLO: la RPC unscoped sigue ejecutable por authenticated (NUT-030)';
  exception
    when insufficient_privilege then null;
  end;

  -- El wrapper scoped (SECURITY DEFINER) sigue funcionando.
  perform public.get_nutrition_client_detail_scoped_v2(
    ctx.client_id, 'standalone', null, null, ctx.test_date, 'America/Santiago'
  );
end;
$$;

reset role;

rollback;
