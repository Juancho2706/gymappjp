-- Nutrition V2 — smoke de la persistencia+publicacion TRANSACCIONAL (NUT-011).
--
-- Cubre los invariantes que introduce
-- `supabase/migrations/20260728140000_nutrition_v2_persist_and_publish_transactional.sql`:
--   A. publicar un plan nuevo escribe el arbol COMPLETO y deja UNA sola raiz;
--   B. republicar con la MISMA idempotency_key devuelve la misma version (no duplica);
--   C. un compare-and-swap desfasado se rechaza (`nutrition_v2_publish_stale_base`);
--   D. append sobre la raiz explicita numera `version_number = max+1` y supersede la vigente;
--   E. un fallo a mitad del arbol NO deja version `draft` huerfana (todo o nada);
--   F. sin `p_plan_id`, una raiz activa SIN version publicada se REUSA y su draft parcial se
--      limpia (port literal de `resolveReusableUnpublishedPlanId`);
--   G. una raiz activa CON version publicada NO se reusa (misma regla portada; la barrera de
--      "una sola raiz activa por alumno" es otro hallazgo — NUT-004 — y vive en el pendiente
--      `_PENDING_AUDIT_nutrition_v2_single_active_plan_root.sql`).
--
-- Seguro por construccion:
--   * toma un coach standalone con un alumno que HOY no tiene ningun plan V2;
--   * solo escribe filas del dominio V2 de ese alumno;
--   * termina en ROLLBACK;
--   * levanta excepcion en cualquier asercion fallida.
--
-- Correr con una conexion SQL privilegiada. NUNCA reemplazar el ROLLBACK final por COMMIT.
-- No se ejecuto como parte del PR (protocolo: sin SQL contra remoto).
--
-- NOTA de owner: la RPC es SECURITY DEFINER. El smoke asume que se aplico con el owner
-- habitual de las migraciones (postgres), que es el que los guards de identidad exceptuan
-- (`current_user not in ('postgres','service_role','supabase_admin')`). Si en LIVE quedara
-- owned por otro rol, `publish_nutrition_plan_v2` fallaria al mover `status` — verificarlo
-- antes de culpar al smoke.

begin;

create temporary table nut_persist_ctx (
  coach_id uuid not null,
  client_id uuid not null,
  group_id uuid,
  group_code text,
  root_a uuid,
  version_1 uuid,
  version_2 uuid,
  orphan_root uuid,
  orphan_draft uuid
) on commit drop;

-- El smoke corre los escenarios con `set local role authenticated`: sin este grant, la tabla
-- temporal (owner = rol de la sesion) queda inaccesible al cambiar de rol.
grant select, insert, update on nut_persist_ctx to authenticated;

insert into nut_persist_ctx (coach_id, client_id, group_id, group_code)
select
  c.coach_id,
  c.id,
  g.id,
  g.code
from public.clients c
left join lateral (
  select eg.id, eg.code
  from public.exchange_groups eg
  where eg.is_system = true
    and eg.deleted_at is null
  order by eg.code
  limit 1
) g on true
where c.org_id is null
  and c.team_id is null
  and c.coach_id is not null
  and c.is_archived = false
  and not exists (select 1 from public.nutrition_plans_v2 p where p.client_id = c.id)
limit 1;

do $$
begin
  if not exists (select 1 from nut_persist_ctx) then
    raise exception 'nutrition_v2_persist_smoke_requires_standalone_client_without_plan';
  end if;
  if exists (select 1 from nut_persist_ctx where group_id is null) then
    raise exception 'nutrition_v2_persist_smoke_requires_system_exchange_group';
  end if;
end;
$$;

-- Draft canonico del smoke: 1 variante -> 1 franja -> 1 item (con 1 reemplazo) + 1 target de
-- porciones. Las filas hoja usan los nombres de columna reales, igual que las emite el
-- builder puro del web (ver cabecera de la migracion).
create or replace function pg_temp.smoke_draft(p_quantity numeric default 80)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'clientId', ctx.client_id,
    'name', 'Smoke NUT-011',
    'strategy', 'structured',
    'timezone', 'America/Santiago',
    'permissions', jsonb_build_object('canRegisterFreely', true, 'canSubstitute', false),
    'visibleNotes', 'Nota visible del smoke',
    'protocolNotes', null,
    'variants', jsonb_build_array(jsonb_build_object(
      'variant_key', 'default',
      'label', 'Todos los dias',
      'day_of_week', null,
      'is_default', true,
      'target_calories', 2000,
      'target_protein_g', null,
      'target_carbs_g', null,
      'target_fats_g', null,
      'target_fiber_g', null,
      'target_sodium_mg', null,
      'target_water_ml', null,
      'order_index', 0,
      'mealSlots', jsonb_build_array(jsonb_build_object(
        'slot_code', 'slot-1',
        'name', 'Desayuno',
        'start_time', '08:00',
        'end_time', null,
        'slot_mode', 'anchor',
        'is_required', false,
        'target_calories', null,
        'target_protein_g', null,
        'target_carbs_g', null,
        'target_fats_g', null,
        'instructions', null,
        'order_index', 0,
        'items', jsonb_build_array(jsonb_build_object(
          'food_id', null,
          'recipe_id', null,
          'custom_name', 'Avena',
          -- p_quantity = 0 fuerza el CHECK `quantity > 0` (caso E).
          'quantity', p_quantity,
          'unit', 'g',
          'minimum_quantity', null,
          'maximum_quantity', null,
          'is_optional', false,
          'substitution_group_id', null,
          'notes', null,
          'order_index', 0,
          'snapshot_name', 'Avena',
          'snapshot_brand', null,
          'snapshot_calories', 300,
          'snapshot_protein_g', 10,
          'snapshot_carbs_g', 50,
          'snapshot_fats_g', 5,
          'snapshot_fiber_g', 6,
          'substitutions', jsonb_build_array(jsonb_build_object(
            'food_id', null,
            'recipe_id', null,
            'custom_name', 'Quinoa',
            'quantity', null,
            'unit', null,
            'order_index', 0,
            'snapshot_name', 'Quinoa',
            'snapshot_brand', null,
            'snapshot_calories', null,
            'snapshot_protein_g', null,
            'snapshot_carbs_g', null,
            'snapshot_fats_g', null,
            'snapshot_fiber_g', null
          ))
        )),
        'exchangeTargets', jsonb_build_array(jsonb_build_object(
          'exchange_group_id', ctx.group_id,
          'portions', 2,
          'notes', null,
          'order_index', 0,
          'snapshot_group_code', ctx.group_code,
          'snapshot_group_name', 'Grupo smoke',
          'snapshot_ref_calories', 70,
          'snapshot_ref_protein_g', 2,
          'snapshot_ref_carbs_g', 15,
          'snapshot_ref_fats_g', 0,
          'snapshot_composed_of', null,
          'snapshot_macros_confirmed', true
        ))
      ))
    ))
  )
  from nut_persist_ctx ctx;
$$;

select set_config('request.jwt.claim.sub', (select coach_id::text from nut_persist_ctx), true);
set local role authenticated;

-- ============================================================================
-- A — publicar un plan nuevo: arbol completo, UNA raiz, version 1 publicada
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_res jsonb;
  v_version_id uuid;
  v_plan_id uuid;
begin
  select * into ctx from nut_persist_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-a'
  );
  v_version_id := (v_res ->> 'versionId')::uuid;
  v_plan_id := (v_res ->> 'planId')::uuid;

  if v_version_id is null or v_plan_id is null then
    raise exception 'SMOKE FALLO: la RPC no devolvio versionId/planId';
  end if;

  update nut_persist_ctx set root_a = v_plan_id, version_1 = v_version_id;

  if (select count(*) from public.nutrition_plans_v2 p where p.client_id = ctx.client_id) <> 1 then
    raise exception 'SMOKE FALLO (A): se creo mas de una raiz para el alumno';
  end if;

  if not exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.id = v_version_id
      and v.plan_id = v_plan_id
      and v.version_number = 1
      and v.status = 'published'
      and v.effective_from = current_date
      and v.effective_to is null
      and v.publish_idempotency_key = 'smoke-nut011-key-a'
      and v.visible_notes = 'Nota visible del smoke'
      and v.protocol_notes is null
      and v.student_permissions ->> 'canRegisterFreely' = 'true'
  ) then
    raise exception 'SMOKE FALLO (A): la version publicada no quedo con el estado esperado';
  end if;

  if not exists (
    select 1 from public.nutrition_plans_v2 p
    where p.id = v_plan_id
      and p.client_id = ctx.client_id
      and p.coach_id = ctx.coach_id
      and p.lifecycle_status = 'active'
      and p.current_published_version_id = v_version_id
      and p.created_by = ctx.coach_id
      and p.updated_by = ctx.coach_id
  ) then
    raise exception 'SMOKE FALLO (A): la raiz no quedo apuntando a la version publicada';
  end if;

  -- Arbol COMPLETO en la misma transaccion.
  if (select count(*) from public.nutrition_day_variants_v2 dv where dv.version_id = v_version_id) <> 1
     or (select count(*) from public.nutrition_meal_slots_v2 ms where ms.version_id = v_version_id) <> 1
     or (select count(*) from public.nutrition_prescription_items_v2 pi where pi.version_id = v_version_id) <> 1
     or (select count(*) from public.nutrition_item_substitutions_v2 s where s.version_id = v_version_id) <> 1
     or (select count(*) from public.nutrition_slot_exchange_targets_v2 t where t.version_id = v_version_id) <> 1
  then
    raise exception 'SMOKE FALLO (A): el arbol quedo incompleto';
  end if;

  if not exists (
    select 1
    from public.nutrition_prescription_items_v2 pi
    join public.nutrition_meal_slots_v2 ms on ms.id = pi.meal_slot_id
    join public.nutrition_day_variants_v2 dv on dv.id = ms.day_variant_id
    join public.nutrition_item_substitutions_v2 s on s.prescription_item_id = pi.id
    where pi.version_id = v_version_id
      and dv.is_default
      and ms.slot_code = 'slot-1'
      and ms.start_time = time '08:00'
      and pi.custom_name = 'Avena'
      and pi.quantity = 80
      and pi.snapshot_calories = 300
      and s.snapshot_name = 'Quinoa'
  ) then
    raise exception 'SMOKE FALLO (A): la vinculacion variante->franja->item->reemplazo no es la esperada';
  end if;

  if not exists (
    select 1 from public.nutrition_slot_exchange_targets_v2 t
    where t.version_id = v_version_id
      and t.portions = 2
      and t.snapshot_group_code = ctx.group_code
      and t.snapshot_macros_confirmed
      and t.snapshot_composed_of is null   -- JSON null => SQL NULL, no 'null'::jsonb
  ) then
    raise exception 'SMOKE FALLO (A): el target de porciones no congelo el snapshot esperado';
  end if;
end;
$$;

-- NUT-007: la columna deprecada `private_notes` sigue NULL. Se comprueba con el rol de la
-- sesion porque `authenticated` no tiene grant de SELECT sobre esa columna (justamente por eso
-- esta deprecada) — el chequeo desde el rol del coach fallaria con 42501, no con un assert.
reset role;

do $$
declare
  ctx nut_persist_ctx%rowtype;
begin
  select * into ctx from nut_persist_ctx;
  if exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.id = ctx.version_1 and v.private_notes is not null
  ) then
    raise exception 'SMOKE FALLO (A): la RPC escribio en la columna deprecada private_notes';
  end if;
end;
$$;

set local role authenticated;

-- ============================================================================
-- B — misma idempotency_key: mismo resultado, sin segunda version
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_res jsonb;
begin
  select * into ctx from nut_persist_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-a'
  );

  if (v_res ->> 'versionId')::uuid is distinct from ctx.version_1 then
    raise exception 'SMOKE FALLO (B): el retry con la misma clave devolvio otra version';
  end if;
  if (v_res ->> 'reusedIdempotencyKey')::boolean is not true then
    raise exception 'SMOKE FALLO (B): el retry no se reporto como reuso de clave';
  end if;
  if (select count(*) from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_a) <> 1 then
    raise exception 'SMOKE FALLO (B): el retry creo una version extra';
  end if;
  if (select count(*) from public.nutrition_plans_v2 p where p.client_id = ctx.client_id) <> 1 then
    raise exception 'SMOKE FALLO (B): el retry creo otra raiz';
  end if;
end;
$$;

-- ============================================================================
-- C — compare-and-swap desfasado: se rechaza y no escribe nada
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_before integer;
begin
  select * into ctx from nut_persist_ctx;
  select count(*) into v_before from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_a;

  begin
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-stale',
      gen_random_uuid(), ctx.root_a
    );
    raise exception 'SMOKE FALLO (C): un CAS desfasado publico igual';
  exception
    when sqlstate '22023' then
      if position('stale_base' in sqlerrm) = 0 then
        raise exception 'SMOKE FALLO (C): 22023 inesperado (%)', sqlerrm;
      end if;
  end;

  if (select count(*) from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_a) <> v_before then
    raise exception 'SMOKE FALLO (C): el CAS rechazado dejo una version escrita';
  end if;
end;
$$;

-- ============================================================================
-- D — append sobre la raiz explicita: version 2 y supersede de la vigente
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_res jsonb;
begin
  select * into ctx from nut_persist_ctx;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-b', ctx.version_1, ctx.root_a
  );
  update nut_persist_ctx set version_2 = (v_res ->> 'versionId')::uuid;

  if (v_res ->> 'planId')::uuid is distinct from ctx.root_a then
    raise exception 'SMOKE FALLO (D): el append creo otra raiz';
  end if;
  if (v_res ->> 'versionNumber')::integer <> 2 then
    raise exception 'SMOKE FALLO (D): version_number no fue max+1';
  end if;
  if not exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.id = (v_res ->> 'versionId')::uuid
      and v.plan_id = ctx.root_a
      and v.version_number = 2
      and v.status = 'published'
      and v.effective_to is null
  ) then
    raise exception 'SMOKE FALLO (D): la version 2 no quedo vigente';
  end if;
  if not exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.id = ctx.version_1
      and v.status = 'superseded'
      and v.effective_to is not null
  ) then
    raise exception 'SMOKE FALLO (D): la version 1 no quedo superseded';
  end if;
end;
$$;

-- ============================================================================
-- E — fallo a mitad del arbol: ni version draft huerfana ni arbol parcial
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_versions integer;
  v_plans integer;
begin
  select * into ctx from nut_persist_ctx;
  select count(*) into v_versions from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_a;
  select count(*) into v_plans from public.nutrition_plans_v2 p where p.client_id = ctx.client_id;

  begin
    -- quantity = 0 viola el CHECK del item: la excepcion cae DESPUES del insert de la
    -- version, de la variante y de la franja. Antes, eso dejaba basura permanente.
    perform public.persist_and_publish_nutrition_plan_v2(
      pg_temp.smoke_draft(0), current_date, 'smoke-nut011-key-fail', null, ctx.root_a
    );
    raise exception 'SMOKE FALLO (E): un item invalido no reventó';
  exception
    when check_violation then null;
  end;

  if (select count(*) from public.nutrition_plan_versions_v2 v where v.plan_id = ctx.root_a) <> v_versions then
    raise exception 'SMOKE FALLO (E): quedo una version huerfana tras el fallo';
  end if;
  if (select count(*) from public.nutrition_plans_v2 p where p.client_id = ctx.client_id) <> v_plans then
    raise exception 'SMOKE FALLO (E): quedo una raiz huerfana tras el fallo';
  end if;
  if exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.plan_id = ctx.root_a and v.status = 'draft'
  ) then
    raise exception 'SMOKE FALLO (E): quedo una version draft colgando';
  end if;
end;
$$;

-- ============================================================================
-- F — sin p_plan_id: reusa la raiz ACTIVA sin version publicada y limpia su draft
-- ============================================================================
reset role;

do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_root uuid;
  v_draft uuid;
begin
  select * into ctx from nut_persist_ctx;

  insert into public.nutrition_plans_v2 (client_id, coach_id, org_id, team_id, name, strategy, created_by, updated_by)
  values (ctx.client_id, ctx.coach_id, null, null, 'Raiz huerfana', 'structured', ctx.coach_id, ctx.coach_id)
  returning id into v_root;

  -- Version draft con arbol parcial: exactamente lo que dejaba un fallo intermedio.
  insert into public.nutrition_plan_versions_v2 (plan_id, version_number, status, strategy, created_by, updated_by)
  values (v_root, 1, 'draft', 'structured', ctx.coach_id, ctx.coach_id)
  returning id into v_draft;

  insert into public.nutrition_day_variants_v2 (version_id, variant_key, label, is_default, order_index)
  values (v_draft, 'default', 'Todos los dias', true, 0);

  update nut_persist_ctx set orphan_root = v_root, orphan_draft = v_draft;
end;
$$;

set local role authenticated;

do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_res jsonb;
  v_roots_before integer;
begin
  select * into ctx from nut_persist_ctx;
  select count(*) into v_roots_before from public.nutrition_plans_v2 p where p.client_id = ctx.client_id;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-orphan'
  );

  if (v_res ->> 'planId')::uuid is distinct from ctx.orphan_root then
    raise exception 'SMOKE FALLO (F): no se reuso la raiz huerfana';
  end if;
  if (v_res ->> 'reusedRoot')::boolean is not true then
    raise exception 'SMOKE FALLO (F): el reuso de raiz no se reporto';
  end if;
  if (select count(*) from public.nutrition_plans_v2 p where p.client_id = ctx.client_id) <> v_roots_before then
    raise exception 'SMOKE FALLO (F): se creo una raiz extra en vez de reusar';
  end if;
  if exists (select 1 from public.nutrition_plan_versions_v2 v where v.id = ctx.orphan_draft) then
    raise exception 'SMOKE FALLO (F): la version draft huerfana no se limpio';
  end if;
  if exists (select 1 from public.nutrition_day_variants_v2 dv where dv.version_id = ctx.orphan_draft) then
    raise exception 'SMOKE FALLO (F): el arbol del draft huerfano sobrevivio al cascade';
  end if;
  -- La numeracion arranca de nuevo en 1 porque el draft borrado libero el numero.
  if not exists (
    select 1 from public.nutrition_plan_versions_v2 v
    where v.id = (v_res ->> 'versionId')::uuid
      and v.plan_id = ctx.orphan_root
      and v.version_number = 1
      and v.status = 'published'
  ) then
    raise exception 'SMOKE FALLO (F): la version publicada en la raiz reusada no quedo bien';
  end if;
end;
$$;

-- ============================================================================
-- G — una raiz activa CON version publicada NO se reusa (regla portada literal)
-- ============================================================================
do $$
declare
  ctx nut_persist_ctx%rowtype;
  v_res jsonb;
  v_roots_before integer;
begin
  select * into ctx from nut_persist_ctx;
  select count(*) into v_roots_before from public.nutrition_plans_v2 p where p.client_id = ctx.client_id;

  v_res := public.persist_and_publish_nutrition_plan_v2(
    pg_temp.smoke_draft(), current_date, 'smoke-nut011-key-fresh-root'
  );

  if (v_res ->> 'planId')::uuid in (ctx.root_a, ctx.orphan_root) then
    raise exception 'SMOKE FALLO (G): se reutilizo una raiz con version publicada';
  end if;
  if (select count(*) from public.nutrition_plans_v2 p where p.client_id = ctx.client_id) <> v_roots_before + 1 then
    raise exception 'SMOKE FALLO (G): no se creo la raiz nueva esperada';
  end if;
end;
$$;

reset role;

rollback;
