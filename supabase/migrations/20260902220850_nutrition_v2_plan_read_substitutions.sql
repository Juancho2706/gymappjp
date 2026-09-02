-- ============================================================================
-- Nutrition V2 — `substitutions` dentro de get_nutrition_plan_read_v2 (SUB-T10 cierre)
--
-- Por que: la tarjeta del plan del alumno (web `PlanVariantCard` y RN
-- `apps/mobile/lib/nutrition-v2-plan.ts`) leia los reemplazos autorizados con UN
-- select extra RLS-scoped por version (`nutrition_item_substitutions_v2`). El read
-- model del plan ya trae cada item prescrito; sumar sus reemplazos ahi evita esa
-- lectura y deja UNA sola fuente para web y RN.
--
-- Que cambia: cada `prescriptionItems[]` trae `substitutions: [...]` (array, vacio
-- si no hay) con el MISMO contrato que `NutritionItemSubstitutionReadSchema`
-- (`packages/nutrition-v2/read-models.ts`). Nada mas cambia: cuerpo VERBATIM de
-- 20260728120500:125-321, firma identica, mismo selector de version (NUT-004),
-- mismo `syncToken` (no depende del cuerpo).
--
-- ADITIVA: solo `create or replace` con firma identica. Sin drops, sin DDL de
-- tablas, sin cambios de RLS. Grants re-asertados idempotentes. Lectura con
-- `security definer` como el resto del read model: el scope lo decide
-- `private.nutrition_v2_can_read_client` (misma verdad que la policy
-- `can_read_version` que usaba el select directo). Indice existente
-- `nis_prescription_item_id_idx (prescription_item_id, order_index)` cubre la
-- subconsulta.
--
-- Compatibilidad: clientes viejos (OTA anterior) ignoran la clave nueva y siguen
-- con su select directo; clientes nuevos usan la clave y caen al select directo
-- solo si la clave falta (RPC viejo).
--
-- ROLLBACK: re-aplicar 20260728120500 (get_nutrition_plan_read_v2).
-- ============================================================================

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
                  ),
                  -- [substitutions] reemplazos autorizados por el coach (F-02) en la MISMA
                  -- lectura: hasta aqui web y RN hacian un select extra RLS-scoped por version
                  -- sobre nutrition_item_substitutions_v2. Mismo contrato que
                  -- NutritionItemSubstitutionReadSchema (packages/nutrition-v2/read-models.ts).
                  -- SIEMPRE presente (array vacio si no hay filas) para que el cliente distinga
                  -- "RPC nuevo sin reemplazos" ([]) de "RPC viejo" (clave ausente => fallback).
                  'substitutions', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', s.id,
                        'prescriptionItemId', s.prescription_item_id,
                        'foodId', s.food_id,
                        'recipeId', s.recipe_id,
                        'name', coalesce(s.snapshot_name, s.custom_name, 'Reemplazo'),
                        'brand', s.snapshot_brand,
                        'quantity', s.quantity,
                        'unit', s.unit,
                        'macros', jsonb_build_object(
                          'calories', s.snapshot_calories,
                          'proteinG', s.snapshot_protein_g,
                          'carbsG', s.snapshot_carbs_g,
                          'fatsG', s.snapshot_fats_g,
                          'fiberG', s.snapshot_fiber_g
                        )
                      ) order by s.order_index, s.created_at
                    )
                    from public.nutrition_item_substitutions_v2 s
                    where s.prescription_item_id = pi.id
                  ), '[]'::jsonb)
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
  'Items prescritos incluyen media/category resueltos por food_id en lectura y sus '
  'reemplazos autorizados (substitutions, siempre array). El selector de version '
  'desempata de forma determinista (effective_from, published_at, version_number, id) — NUT-004.';
