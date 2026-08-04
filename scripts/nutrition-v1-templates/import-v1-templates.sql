-- ============================================================================
-- EVA Nutricion — F3 T5: rescate de las plantillas V1 a la biblioteca V2
-- Spec: specs/nutrition-plan-templates-v2/SPEC.md
-- ----------------------------------------------------------------------------
-- QUE RESCATA. V1 (`/coach/nutrition-plans`) tenia `TemplateLibrary`, pero el swap a V2
-- (`nutrition-v2-swap.ts`) redirige a todo coach standalone y team. Resultado verificado en
-- LIVE el 2026-08-03: 33 plantillas / 142 comidas / 494 items de 4 coaches quedaron
-- inaccesibles — jotap-coach 17, joaquinamr7 10 (coach real, ultima el 08-jul), josefit 5
-- (QA), mindgym 1 (solo macros, sin comidas).
--
-- NO BORRA NADA. Las tablas V1 (`nutrition_plan_templates`, `template_meals`,
-- `template_meal_groups`, `saved_meals`, `saved_meal_items`) quedan intactas.
--
-- IDEMPOTENTE. `legacy_template_id` tiene un unico parcial sobre filas vivas y el insert usa
-- `on conflict do nothing`: correrlo dos veces deja 33 plantillas, no 66.
--
-- COMO SE MAPEA
--   nutrition_plan_templates -> 1 plantilla V2
--     · macros del dia base   <- daily_calories / protein_g / carbs_g / fats_g
--     · notas del alumno      <- instructions
--     · estrategia            <- 'structured' si tiene comidas; 'flexible' si no (caso mindgym)
--   template_meals           -> franjas (`mealSlots`), agrupadas por `day_of_week`
--     · day_of_week NULL      -> dia base ("Todos los dias")
--     · day_of_week N         -> variante `dow-N`
--   template_meal_groups + saved_meal_items -> items de la franja
--     · solo items cuyo `food_id` sigue existiendo (el join con `foods` los filtra)
--
-- La forma del JSON que produce esta consulta esta cubierta por el test
-- `packages/nutrition-v2/plan-templates.test.ts` ("payload del importador V1"): si el contrato
-- del draft cambia, el test avisa antes de que las 33 queden ilegibles.
--
-- REQUIERE service_role: las plantillas se crean a nombre del coach ORIGINAL, y la policy
-- `npt2_insert_own` solo deja a un coach crear las suyas.
--
-- DRY-RUN: reemplazar el INSERT por el SELECT de abajo (o envolver todo en BEGIN/ROLLBACK).
-- ROLLBACK: delete from public.nutrition_plan_templates_v2 where source = 'import_v1';
-- ============================================================================

with slots as (
  select
    tm.template_id,
    tm.day_of_week,
    row_number() over (partition by tm.template_id, tm.day_of_week order by tm.order_index, tm.created_at) as rn,
    jsonb_build_object(
      'code', 'slot-' || row_number() over (partition by tm.template_id, tm.day_of_week order by tm.order_index, tm.created_at),
      'name', coalesce(nullif(btrim(tm.name), ''), 'Comida'),
      'startTime', null,
      'endTime', null,
      'mode', 'anchor',
      'required', false,
      'targets', '{}'::jsonb,
      'instructions', nullif(btrim(coalesce(tm.description, '')), ''),
      'orderIndex', (row_number() over (partition by tm.template_id, tm.day_of_week order by tm.order_index, tm.created_at))::int - 1,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'foodId', it.food_id,
          'recipeId', null,
          'customName', null,
          -- V1 permitia cantidad 0; el contrato exige positiva.
          'quantity', greatest(it.quantity, 1),
          'unit', coalesce(nullif(btrim(it.unit), ''), 'g'),
          'minimumQuantity', null,
          'maximumQuantity', null,
          'optional', false,
          'substitutionGroupId', null,
          'notes', null,
          'orderIndex', (it.rn)::int - 1
        ) order by it.rn), '[]'::jsonb)
        from (
          select smi.food_id, smi.quantity, smi.unit,
                 row_number() over (order by g.order_index, smi.id) as rn
          from public.template_meal_groups g
          join public.saved_meal_items smi on smi.saved_meal_id = g.saved_meal_id
          -- El join con foods descarta items cuyo alimento ya no existe: mejor una franja con
          -- un item menos que una plantilla que no abre.
          join public.foods f on f.id = smi.food_id
          where g.template_meal_id = tm.id
        ) it
      )
    ) as slot
  from public.template_meals tm
),
payloads as (
  select
    t.id as legacy_id,
    t.coach_id,
    t.name,
    nullif(btrim(coalesce(t.description, '')), '') as description,
    case when exists (select 1 from public.template_meals x where x.template_id = t.id)
         then 'structured' else 'flexible' end as strategy,
    jsonb_build_object(
      'schemaVersion', 1,
      'draft', jsonb_build_object(
        'name', t.name,
        'strategy', case when exists (select 1 from public.template_meals x where x.template_id = t.id)
                         then 'structured' else 'flexible' end,
        'timezone', 'America/Santiago',
        'permissions', jsonb_build_object(
          -- Sin comidas no hay nada que prescribir: el alumno registra libre.
          'canRegisterFreely', not exists (select 1 from public.template_meals x where x.template_id = t.id),
          'canAdjustPrescribedQuantity', false,
          'quantityAdjustmentPercent', null,
          'canSubstitute', false,
          'canMoveMealSlot', false,
          'canSkipOptionalItems', true
        ),
        'visibleNotes', nullif(btrim(coalesce(t.instructions, '')), ''),
        'privateNotes', null,
        'protocolNotes', null,
        'dayVariants', (
          select jsonb_agg(x.dv order by x.dv_order)
          from (
            select 0 as dv_order, jsonb_build_object(
              'key', 'default',
              'label', 'Todos los días',
              'dayOfWeek', null,
              'default', true,
              'targets', jsonb_build_object(
                'calories', t.daily_calories, 'proteinG', t.protein_g,
                'carbsG', t.carbs_g, 'fatsG', t.fats_g,
                'fiberG', null, 'sodiumMg', null, 'waterMl', null),
              'orderIndex', 0,
              'mealSlots', coalesce(
                (select jsonb_agg(s.slot order by s.rn) from slots s
                 where s.template_id = t.id and s.day_of_week is null), '[]'::jsonb)
            ) as dv
            union all
            select (d.dow + 1) as dv_order, jsonb_build_object(
              'key', 'dow-' || d.dow,
              'label', 'Día ' || d.dow,
              'dayOfWeek', d.dow,
              'default', false,
              'targets', jsonb_build_object(
                'calories', t.daily_calories, 'proteinG', t.protein_g,
                'carbsG', t.carbs_g, 'fatsG', t.fats_g,
                'fiberG', null, 'sodiumMg', null, 'waterMl', null),
              'orderIndex', d.dow + 1,
              'mealSlots', coalesce(
                (select jsonb_agg(s.slot order by s.rn) from slots s
                 where s.template_id = t.id and s.day_of_week = d.dow), '[]'::jsonb)
            )
            from (select distinct day_of_week as dow from public.template_meals
                  where template_id = t.id and day_of_week is not null) d
          ) x
        )
      )
    ) as payload,
    jsonb_build_object(
      'calories', t.daily_calories, 'proteinG', t.protein_g,
      'carbsG', t.carbs_g, 'fatsG', t.fats_g,
      'dayVariantCount', 1 + (select count(distinct day_of_week) from public.template_meals
                              where template_id = t.id and day_of_week is not null),
      'mealSlotCount', (select count(*) from public.template_meals where template_id = t.id),
      'itemCount', (select count(*) from public.template_meal_groups g
                    join public.saved_meal_items smi on smi.saved_meal_id = g.saved_meal_id
                    join public.template_meals m on m.id = g.template_meal_id
                    where m.template_id = t.id),
      'hasPortions', false
    ) as summary
  from public.nutrition_plan_templates t
  where t.coach_id is not null
)
-- DRY-RUN: comentar el INSERT y dejar solo `select * from payloads;`
insert into public.nutrition_plan_templates_v2 (
  coach_id, name, description, strategy, draft, schema_version, summary, source, legacy_template_id
)
select coach_id, name, description, strategy, payload, 1, summary, 'import_v1', legacy_id
from payloads
on conflict do nothing;
