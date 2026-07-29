-- ============================================================================
-- EVA Nutricion V2 — NUT-004 (punto 5): desempate DETERMINISTA del selector de version
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G3): los selectores de "version vigente
-- para una fecha" ordenan por `v.effective_from desc, v.version_number desc` sin ningun
-- desempate por raiz de plan. Cuando un alumno tiene MAS DE UNA raiz activa (lo que hoy
-- puede ocurrir por el CTA "Nueva version" de coach RN, que publica sin planId), dos
-- versiones de raices distintas pueden empatar en `effective_from`; el empate lo gana la
-- que tenga `version_number` mas alto, o sea la raiz VIEJA (la raiz nueva siempre nace en
-- version_number = 1). Resultado: el plan recien publicado queda invisible para el alumno
-- y el resultado del selector no es estable entre ejecuciones.
--
-- Fix: agregar `published_at desc nulls last` (la publicacion mas reciente gana) y
-- `v.id desc` como desempate final total, de modo que el selector sea determinista aunque
-- haya empate perfecto. No cambia el resultado cuando hay una sola raiz activa (caso
-- normal): `effective_from` + `version_number` ya lo resolvian.
--
-- Alcance real: el brief lista 7 `file:line`, pero solo colapsan en TRES funciones VIVAS
--   · public.get_nutrition_plan_read_v2      (viva en 20260720120000:526)
--   · private.nutrition_v2_rederive_day_snapshot (viva en 20260716230000:24)
--   · private.nutrition_v2_ensure_day_snapshot   (viva en 20260714192500:4)
-- Las otras cuatro citas son definiciones YA SUPERSEDIDAS del mismo trio. Las dos
-- primeras se corrigen aqui; `ensure_day_snapshot` se corrige en la migracion
-- 20260728121000 (guard de fecha/timezone, NUT-016), que la recrea de todos modos —
-- asi no hay dos migraciones peleando por el mismo cuerpo.
--
-- ADITIVA: solo `create or replace` con firma identica. Sin drops, sin DDL de tablas,
-- sin cambios de RLS ni grants (se re-asertan los revokes idempotentes existentes).
--
-- ROLLBACK: re-aplicar 20260720120000 (get_nutrition_plan_read_v2) y 20260716230000
-- (nutrition_v2_rederive_day_snapshot).
-- ============================================================================

-- ── 1) private.nutrition_v2_rederive_day_snapshot ────────────────────────────
--    Base VERBATIM de 20260716230000:24-106. UNICO cambio: el ORDER BY del selector.
create or replace function private.nutrition_v2_rederive_day_snapshot(
  p_client_id uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot public.nutrition_day_snapshots_v2%rowtype;
  v_plan_id uuid;
  v_version_id uuid;
  v_strategy text;
  v_permissions jsonb := '{}'::jsonb;
  v_variant public.nutrition_day_variants_v2%rowtype;
  v_prescription jsonb := '{}'::jsonb;
begin
  select s.* into v_snapshot
  from public.nutrition_day_snapshots_v2 s
  where s.client_id = p_client_id
    and s.local_date = p_local_date
  for update;

  if v_snapshot.id is null then
    -- Nothing materialized yet: the next read derives fresh via ensure_day_snapshot.
    return;
  end if;

  -- Only the client's CURRENT local day (in the snapshot's own timezone) may be re-derived.
  if v_snapshot.local_date <> (now() at time zone v_snapshot.timezone)::date then
    return;
  end if;

  -- Same live selection as private.nutrition_v2_ensure_day_snapshot.
  select p.id, v.id, v.strategy, v.student_permissions
    into v_plan_id, v_version_id, v_strategy, v_permissions
  from public.nutrition_plans_v2 p
  join public.nutrition_plan_versions_v2 v on v.plan_id = p.id
  where p.client_id = p_client_id
    and p.lifecycle_status = 'active'
    and v.status in ('published', 'superseded')
    and v.effective_from <= p_local_date
    and (v.effective_to is null or v.effective_to >= p_local_date)
  order by v.effective_from desc, v.published_at desc nulls last, v.version_number desc, v.id desc
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

  update public.nutrition_day_snapshots_v2
  set plan_id = v_plan_id,
      version_id = v_version_id,
      day_variant_id = v_variant.id,
      strategy = v_strategy,
      target_calories = v_variant.target_calories,
      target_protein_g = v_variant.target_protein_g,
      target_carbs_g = v_variant.target_carbs_g,
      target_fats_g = v_variant.target_fats_g,
      target_fiber_g = v_variant.target_fiber_g,
      target_sodium_mg = v_variant.target_sodium_mg,
      target_water_ml = v_variant.target_water_ml,
      student_permissions = coalesce(v_permissions, '{}'::jsonb),
      prescription_snapshot = coalesce(v_prescription, '{}'::jsonb)
  where id = v_snapshot.id;
end;
$$;

revoke all on function private.nutrition_v2_rederive_day_snapshot(uuid, date)
  from public, anon, authenticated;

-- ── 2) public.get_nutrition_plan_read_v2 ─────────────────────────────────────
--    Base VERBATIM de 20260720120000:526-722. UNICO cambio: el ORDER BY del selector.
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
  order by v.effective_from desc, v.published_at desc nulls last, v.version_number desc, v.id desc
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
                  -- [media/category] resueltos en lectura por pi.food_id (null-safe:
                  -- food custom => media/category null).
                  'media', private.food_catalog_v2_media_json(pi.food_id),
                  'category', (select f.category from public.foods f where f.id = pi.food_id),
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

revoke all on function public.get_nutrition_plan_read_v2(uuid, date, text) from public, anon;
grant execute on function public.get_nutrition_plan_read_v2(uuid, date, text) to authenticated;

comment on function public.get_nutrition_plan_read_v2(uuid, date, text) is
  'One-request immutable plan read model effective on a local date. exchangeTargets '
  'por franja presente solo si el plan tiene targets de porciones (Q1 byte-identico). '
  'Items prescritos incluyen media/category resueltos por food_id en lectura. El '
  'selector de version desempata de forma determinista (effective_from, published_at, '
  'version_number, id) — NUT-004.';
