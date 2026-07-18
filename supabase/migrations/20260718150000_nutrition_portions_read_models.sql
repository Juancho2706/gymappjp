-- ============================================================================
-- EVA Nutrition V2 — Porciones (intercambios): extension del read-model Today con
-- cobertura por grupo + equivalencias server-side. Spec: specs/nutrition-portions/
-- SPEC.md (R5, hallazgos F3/F2-front/A3). Tarea: T2.0 (orquestador).
-- ----------------------------------------------------------------------------
-- Corre DESPUES de 20260718140000_nutrition_portions_v2.sql (que crea la tabla de
-- targets, las columnas exchange_group_code/exchange_portions del intake, y agrega
-- exchangeTargets[] por franja a build_prescription_snapshot). Depende de esas
-- columnas y de ese snapshot enriquecido.
--
-- ADITIVA / forward-only: cero DROP/rename. Ambas funciones se recrean con
-- `create or replace` (firma identica => sin drop; grants preservados, re-asertados
-- por si un fixer los movio). Rollback comentado al pie.
--
-- CRITERIO Q1 (byte-identico): la CAPA de porciones del Today (exchangeTargets por
-- franja, dayCoverage, exchangeFoods) SOLO aparece cuando el snapshot del dia trae
-- exchangeTargets en alguna franja. Un plan sin porciones => salida IDENTICA a la
-- actual: esos tres keys NO se agregan (ni [] ni null). El computo de cobertura se
-- salta por completo (guard v_has_portions) — cero costo extra en el hot path Micro
-- (hallazgo D4) para planes sin porciones.
--
-- FUENTE UNICA (PLAN "la cobertura se computa server-side en el read-model"): las
-- formulas de R5 se computan AQUI, espejando computePortionCoverage de
-- packages/nutrition-v2/read-models.ts (implementacion de referencia). El cliente
-- solo mantiene un delta optimista de `marcadas` pendientes (F1-front); jamas
-- estima `derivadas`.
--
-- NO se aplica a prod dentro del build (BEGIN/ROLLBACK + advisors + GO CEO en la
-- fase de operacion).
-- ============================================================================

-- ── 1) intake_item_json: transporta exchangeGroupCode / exchangePortions. ─────
--    Aditivo por-item (SPEC R4): null cuando no aplica (intake real => ambos null;
--    sintetico de marcar-porcion => poblados). Extension permanente de la forma
--    canonica del item (NutritionIntakeReadItemSchema los declara .optional().
--    nullable() para compat de cache). La CAPA de porciones del Today (keys de
--    nivel superior) sigue gateada por v_has_portions en get_nutrition_today_v2.
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
  )
  -- Porciones (SPEC R4, Q1 byte-identico): las llaves exchangeGroupCode/exchangePortions
  -- se AGREGAN condicionalmente, SOLO cuando el intake las trae (sintetico de marcar-
  -- porcion: codigo de grupo congelado + porciones marcadas). Un intake real tiene ambas
  -- null => el objeto queda SIN esas llaves => item_json byte-identico al read-model previo
  -- (item_json es compartido por Today, client_detail e history — un plan sin porciones no
  -- puede ganar 2 llaves null por item). La entry correctora de un void escribe
  -- exchange_portions=null (B3) => no aporta cobertura marcada. NutritionIntakeReadItemSchema
  -- las declara .optional().nullable() => ambas formas (ausente / presente) parsean.
  || case
       when p_entry.exchange_group_code is not null or p_entry.exchange_portions is not null
         then jsonb_build_object(
           'exchangeGroupCode', p_entry.exchange_group_code,
           'exchangePortions', p_entry.exchange_portions
         )
       else '{}'::jsonb
     end;
$$;

revoke all on function private.nutrition_v2_intake_item_json(public.nutrition_intake_entries) from public, anon, authenticated;

-- ── 2) get_nutrition_today_v2: enriquece franjas + dayCoverage + exchangeFoods. ─
--    Base = 20260714210000_nutrition_v2_today_plan_read_models.sql (sin cambios
--    posteriores en este RPC). UNICO agregado: la capa de porciones, gateada por
--    v_has_portions para preservar Q1.
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
  -- Capa de porciones (solo cuando v_has_portions).
  v_has_portions boolean := false;
  v_cov_marcadas jsonb := '{}'::jsonb;   -- key: slotCode||US||groupCode -> numeric
  v_cov_derivadas jsonb := '{}'::jsonb;  -- key: slotCode||US||groupCode -> numeric
  v_day_marcadas jsonb := '{}'::jsonb;   -- key: groupCode -> numeric (todas franjas + sin franja)
  v_day_derivadas jsonb := '{}'::jsonb;  -- key: groupCode -> numeric (todas franjas + sin franja)
  v_prescribed_map jsonb := '{}'::jsonb; -- key: groupCode -> prescribed (Sigma portions del dia)
  v_groupname_map jsonb := '{}'::jsonb;  -- key: groupCode -> groupName congelado del snapshot
  v_group_ids uuid[] := array[]::uuid[]; -- exchange_group_id de los targets del dia
  v_day_coverage jsonb := '[]'::jsonb;
  v_exchange_foods jsonb := '[]'::jsonb;
  -- Separador interno del mapa de cobertura por franja. chr(31) (US, 0x1F): valido en
  -- text de Postgres (solo 0x00 esta prohibido); no colisiona con codigos de franja/
  -- grupo. NO es la portionCoverageKey del TS (que usa U+0000, imposible en text PG).
  v_sep constant text := chr(31);
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

  -- ¿El plan del dia tiene porciones en ALGUNA franja? Snapshots viejos (pre-140000)
  -- no traen 'exchangeTargets' => v_has_portions false => Q1 byte-identico.
  select exists (
    select 1
    from jsonb_array_elements(
      coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)
    ) slot
    where jsonb_array_length(coalesce(slot -> 'exchangeTargets', '[]'::jsonb)) > 0
  ) into v_has_portions;

  if v_has_portions then
    -- Prescrito por grupo del dia + nombre congelado (fuente: snapshot, nunca catalogo
    -- vivo). Toda la cobertura se llavea por CODIGO de grupo (exchange_group_code
    -- congelado / eg.code), asi que los mapas agregan por code: un grupo repetido en
    -- varias franjas suma portions; name = min (congelados iguales por code dentro de
    -- la version). Los ids se juntan APARTE (dos grupos distintos podrian compartir
    -- code — system vs custom): exchangeFoods necesita TODOS los ids, y agregar por
    -- code en jsonb_object_agg reventaria con key duplicada.
    select
      coalesce(jsonb_object_agg(code, prescribed), '{}'::jsonb),
      coalesce(jsonb_object_agg(code, gname), '{}'::jsonb)
    into v_prescribed_map, v_groupname_map
    from (
      select
        t ->> 'code' as code,
        sum((t ->> 'portions')::numeric) as prescribed,
        min(t ->> 'name') as gname
      from jsonb_array_elements(
             coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)
           ) slot,
           jsonb_array_elements(coalesce(slot -> 'exchangeTargets', '[]'::jsonb)) t
      group by t ->> 'code'
    ) g;

    select coalesce(array_agg(distinct gid), array[]::uuid[])
    into v_group_ids
    from (
      select (t ->> 'exchangeGroupId')::uuid as gid
      from jsonb_array_elements(
             coalesce(v_snapshot.prescription_snapshot -> 'mealSlots', '[]'::jsonb)
           ) slot,
           jsonb_array_elements(coalesce(slot -> 'exchangeTargets', '[]'::jsonb)) t
    ) x;

    -- marcadas por (franja, grupo): Sigma exchange_portions de intakes sinteticos
    -- ACTIVOS del dia (cadena no anulada: void => corrector con exchange_portions=null,
    -- original => entry_status<>'active'; ambos excluidos — doble cinturon B3).
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    into v_cov_marcadas
    from (
      select coalesce(e.meal_slot_v2, e.meal_slot) || v_sep || e.exchange_group_code as k,
             round(sum(e.exchange_portions), 4) as v
      from public.nutrition_intake_entries e
      where e.client_id = p_client_id
        and e.log_date = p_local_date
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and e.exchange_group_code is not null
        and e.exchange_portions is not null
        and coalesce(e.meal_slot_v2, e.meal_slot) is not null
      group by coalesce(e.meal_slot_v2, e.meal_slot) || v_sep || e.exchange_group_code
    ) s;

    -- derivadas por (franja, grupo): Sigma cantidad_en_gramos / exchange_portion_grams
    -- de intakes REALES activos cuyo food esta clasificado (catalogo VIGENTE — A3).
    -- cantidad_en_gramos = quantity para unidades g/ml (mismo SET convertible que
    -- private.nutrition_v2_entry_factor); otras unidades NO aportan cobertura. Se
    -- excluyen filas sinteticas (rama marcadas tiene prioridad, espejo del TS).
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    into v_cov_derivadas
    from (
      select coalesce(e.meal_slot_v2, e.meal_slot) || v_sep || eg.code as k,
             round(sum(e.quantity / f.exchange_portion_grams), 4) as v
      from public.nutrition_intake_entries e
      join public.foods f on f.id = e.food_id
      join public.exchange_groups eg on eg.id = f.exchange_group_id
      where e.client_id = p_client_id
        and e.log_date = p_local_date
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and (e.exchange_group_code is null or e.exchange_portions is null)
        and lower(coalesce(e.unit, '')) in ('g', 'ml')
        and f.exchange_portion_grams is not null
        and f.exchange_portion_grams > 0
        and coalesce(e.meal_slot_v2, e.meal_slot) is not null
      group by coalesce(e.meal_slot_v2, e.meal_slot) || v_sep || eg.code
    ) s;

    -- Cobertura del DIA por grupo (R5 cobertura_dia): TODAS las franjas MAS los
    -- intakes sin franja asignada (por eso, sin filtro de meal_slot).
    select coalesce(jsonb_object_agg(code, v), '{}'::jsonb)
    into v_day_marcadas
    from (
      select e.exchange_group_code as code, round(sum(e.exchange_portions), 4) as v
      from public.nutrition_intake_entries e
      where e.client_id = p_client_id
        and e.log_date = p_local_date
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and e.exchange_group_code is not null
        and e.exchange_portions is not null
      group by e.exchange_group_code
    ) s;

    select coalesce(jsonb_object_agg(code, v), '{}'::jsonb)
    into v_day_derivadas
    from (
      select eg.code as code, round(sum(e.quantity / f.exchange_portion_grams), 4) as v
      from public.nutrition_intake_entries e
      join public.foods f on f.id = e.food_id
      join public.exchange_groups eg on eg.id = f.exchange_group_id
      where e.client_id = p_client_id
        and e.log_date = p_local_date
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and (e.exchange_group_code is null or e.exchange_portions is null)
        and lower(coalesce(e.unit, '')) in ('g', 'ml')
        and f.exchange_portion_grams is not null
        and f.exchange_portion_grams > 0
      group by eg.code
    ) s;

    -- dayCoverage: una fila por grupo PRESCRITO del dia (nombre/color desde el
    -- snapshot; color null => el cliente lo deriva con exchangeGroupColor(code)).
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'groupCode', code,
        'groupName', v_groupname_map ->> code,
        'color', null,
        'prescribed', prescribed,
        'marcadas', coalesce((v_day_marcadas ->> code)::numeric, 0),
        'derivadas', coalesce((v_day_derivadas ->> code)::numeric, 0),
        'coverage', round(
          coalesce((v_day_marcadas ->> code)::numeric, 0)
          + coalesce((v_day_derivadas ->> code)::numeric, 0), 4)
      ) order by code
    ), '[]'::jsonb)
    into v_day_coverage
    from (
      select key as code, value::numeric as prescribed
      from jsonb_each_text(v_prescribed_map)
    ) p;

    -- exchangeFoods (F3): equivalencias 1-porcion viajan DENTRO del Today. Foods VIVOS
    -- clasificados (exchange_group_id no nulo, exchange_portion_grams no nulo) de los
    -- grupos presentes en los targets del dia. foods NO tiene soft-delete (no hay
    -- columna de borrado — igual que la lectura V1 findExchangeFoodsByGroupIds). Orden
    -- estable por nombre; cap 40 por grupo (equivalencias son lista de referencia, no
    -- catalogo completo — techo del payload en el hot path Micro).
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'foodId', ranked.id,
        'exchangeGroupId', ranked.exchange_group_id,
        'groupCode', eg.code,
        'name', ranked.name,
        'brand', ranked.brand,
        'portionLabel', ranked.exchange_portion_label,
        'portionGrams', ranked.exchange_portion_grams
      ) order by eg.code, ranked.name, ranked.id
    ), '[]'::jsonb)
    into v_exchange_foods
    from (
      select f.id, f.name, f.brand, f.exchange_group_id,
             f.exchange_portion_label, f.exchange_portion_grams,
             row_number() over (partition by f.exchange_group_id order by f.name, f.id) as rn
      from public.foods f
      where f.exchange_group_id = any(v_group_ids)
        and f.exchange_portion_grams is not null
    ) ranked
    join public.exchange_groups eg on eg.id = ranked.exchange_group_id
    where ranked.rn <= 40;
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
    )
    -- Capa de porciones SOLO cuando v_has_portions (Q1): remapea el snapshot congelado
    -- (code->groupCode, name->groupName; color null; orderIndex posicional) y adjunta
    -- marcadas/derivadas/coverage de la franja. Un plan sin porciones no agrega el key.
    || case when v_has_portions then jsonb_build_object(
        'exchangeTargets', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', t ->> 'id',
              'exchangeGroupId', t ->> 'exchangeGroupId',
              'groupCode', t ->> 'code',
              'groupName', t ->> 'name',
              'color', null,
              'portions', (t ->> 'portions')::numeric,
              'notes', t -> 'notes',
              'orderIndex', (ord - 1)::int,
              'ref', t -> 'ref',
              'composedOf', t -> 'composedOf',
              'macrosConfirmed', coalesce((t ->> 'macrosConfirmed')::boolean, false),
              'marcadas', coalesce((v_cov_marcadas ->> ((slot ->> 'code') || v_sep || (t ->> 'code')))::numeric, 0),
              'derivadas', coalesce((v_cov_derivadas ->> ((slot ->> 'code') || v_sep || (t ->> 'code')))::numeric, 0),
              'coverage', round(
                coalesce((v_cov_marcadas ->> ((slot ->> 'code') || v_sep || (t ->> 'code')))::numeric, 0)
                + coalesce((v_cov_derivadas ->> ((slot ->> 'code') || v_sep || (t ->> 'code')))::numeric, 0), 4)
            ) order by ord
          )
          from jsonb_array_elements(coalesce(slot -> 'exchangeTargets', '[]'::jsonb))
               with ordinality as te(t, ord)
        ), '[]'::jsonb)
      ) else '{}'::jsonb end
    order by ordinality
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
  )
  -- Capa de porciones de nivel superior SOLO cuando v_has_portions (Q1): sin ella el
  -- objeto queda byte-identico al read-model actual.
  || case when v_has_portions then jsonb_build_object(
      'dayCoverage', v_day_coverage,
      'exchangeFoods', v_exchange_foods
    ) else '{}'::jsonb end;
end;
$$;

-- Firma identica => sin drop; grants ya vigentes (20260714210000). Re-asercion
-- idempotente por si un fixer movio los revoke/grant.
revoke all on function public.get_nutrition_today_v2(uuid, date, text) from public, anon;
grant execute on function public.get_nutrition_today_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_today_v2(uuid, date, text) is
  'One-request private read model for Today. First read may create the immutable '
  'daily snapshot. Capa de porciones (exchangeTargets/dayCoverage/exchangeFoods) '
  'presente solo si el plan tiene targets de porciones (Q1 byte-identico).';

-- ── 3) get_nutrition_plan_read_v2: exchangeTargets[] read-only por franja. ─────
--    Base = 20260714210000_nutrition_v2_today_plan_read_models.sql (verificado: es la
--    ultima definicion — 20260714210500 y 20260716120000 solo la referencian, no la
--    reemplazan). UNICO agregado: por meal slot, la clave 'exchangeTargets' SOLO si la
--    franja tiene filas en nutrition_slot_exchange_targets_v2 (espejo del gate
--    v_has_portions del Today) => plan sin porciones = plan read byte-identico (Q1).
--    Alimenta la hidratacion del quick-edit (readModelToDraft) y la ficha plan del coach
--    (NutritionPlanReadModelSchema.dayVariants[].mealSlots[].exchangeTargets opcional).
--    SIN cobertura (marcadas/derivadas/coverage): el plan read no es el Today; el schema
--    las tiene opcionales. Fuente: snapshot_* congelados (nunca catalogo vivo — riesgo #1).
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
          )
          -- Capa de porciones (T2.0 fix 2): 'exchangeTargets' SOLO si la franja tiene
          -- filas (espejo de v_has_portions del Today). Plan sin porciones => cero llaves
          -- nuevas => byte-identico (Q1). Mapeo READ igual al Today pero SIN cobertura y
          -- con orderIndex = et.order_index (aqui SI existe la columna, no posicional).
          || case when exists (
               select 1
               from public.nutrition_slot_exchange_targets_v2 et
               where et.meal_slot_id = ms.id
             ) then jsonb_build_object(
               'exchangeTargets', coalesce((
                 select jsonb_agg(
                   jsonb_build_object(
                     'id', et.id,
                     'exchangeGroupId', et.exchange_group_id,
                     'groupCode', et.snapshot_group_code,
                     'groupName', et.snapshot_group_name,
                     'color', null,
                     'portions', et.portions,
                     'notes', et.notes,
                     'orderIndex', et.order_index,
                     'ref', jsonb_build_object(
                       'calories', et.snapshot_ref_calories,
                       'proteinG', et.snapshot_ref_protein_g,
                       'carbsG', et.snapshot_ref_carbs_g,
                       'fatsG', et.snapshot_ref_fats_g
                     ),
                     'composedOf', et.snapshot_composed_of,
                     'macrosConfirmed', coalesce(et.snapshot_macros_confirmed, false)
                   ) order by et.order_index, et.created_at
                 )
                 from public.nutrition_slot_exchange_targets_v2 et
                 where et.meal_slot_id = ms.id
               ), '[]'::jsonb)
             ) else '{}'::jsonb end
          order by ms.order_index, ms.created_at
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

-- Firma identica => sin drop; grants ya vigentes (20260714210000). Re-asercion
-- idempotente por si un fixer movio los revoke/grant.
revoke all on function public.get_nutrition_plan_read_v2(uuid, date, text) from public, anon;
grant execute on function public.get_nutrition_plan_read_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_plan_read_v2(uuid, date, text) is
  'One-request immutable plan read model effective on a local date. exchangeTargets '
  'por franja presente solo si el plan tiene targets de porciones (Q1 byte-identico).';

-- ============================================================================
-- ROLLBACK (una pasada — NO se aplica en el build; referencia de operacion):
--
--   -- 3) restaurar get_nutrition_plan_read_v2 SIN exchangeTargets: re-aplicar el
--   --    cuerpo de 20260714210000_nutrition_v2_today_plan_read_models.sql
--   --    (create or replace function public.get_nutrition_plan_read_v2).
--
--   -- 2) restaurar get_nutrition_today_v2 SIN la capa de porciones: re-aplicar el
--   --    cuerpo de 20260714210000_nutrition_v2_today_plan_read_models.sql
--   --    (create or replace function public.get_nutrition_today_v2).
--
--   -- 1) restaurar nutrition_v2_intake_item_json SIN exchangeGroupCode/
--   --    exchangePortions: re-aplicar el cuerpo de
--   --    20260714210000_nutrition_v2_today_plan_read_models.sql
--   --    (create or replace function private.nutrition_v2_intake_item_json).
-- ============================================================================
