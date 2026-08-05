-- Parte 2 Ola 0: (a) item json del catalogo expone coachId/orgId (aditivo — permite agrupar
-- "mios vs catalogo vs marca" en el picker sin heuristicas); (b) RPC de sugerencias pre-busqueda:
-- frecuentes del coach (por franja opcional), recientes y favoritos del alumno.
-- Aplicada en LIVE via MCP el 2026-08-05 (version 20260805213958); medida con claims reales: 20,6 ms.

drop function if exists public.__food_suggestions_test(uuid, text, integer);

create or replace function private.food_catalog_v2_item_json(p_food_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id,
    'catalogKey', f.catalog_key,
    'gtin', f.barcode,
    'name', f.name,
    'brand', f.brand,
    'category', f.category,
    'countryCode', f.country_code,
    'servingSize', f.serving_size,
    'servingUnit', coalesce(f.serving_unit, 'g'),
    'calories', f.calories,
    'proteinG', f.protein_g,
    'carbsG', f.carbs_g,
    'fatsG', f.fats_g,
    'fiberG', f.fiber_g,
    'sodiumMg', f.sodium_mg,
    'sugarG', f.sugar_g,
    'saturatedFatG', f.saturated_fat_g,
    'packageQuantity', f.package_quantity,
    'packageUnit', f.package_unit,
    'source', f.catalog_source,
    'sourceRef', f.source_ref,
    'verificationStatus', f.verification_status,
    'coachId', f.coach_id,
    'orgId', f.org_id,
    'media', private.food_catalog_v2_media_json(f.id)
  )
  from public.foods f
  where f.id = p_food_id;
$$;

create function public.get_coach_food_suggestions_v2(
  p_client_id uuid default null,
  p_slot_name text default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $FN$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 24);
  v_slot text := nullif(btrim(coalesce(p_slot_name, '')), '');
  v_coach_top jsonb;
  v_client_recent jsonb := '[]'::jsonb;
  v_client_favorites jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_food_suggestions_auth_required' using errcode = '42501';
  end if;

  -- Frecuentes del coach: lo que mas prescribe en sus planes V2 (opcionalmente por franja).
  select coalesce(jsonb_agg(item order by uses desc, last_used desc), '[]'::jsonb)
  into v_coach_top
  from (
    select
      private.food_catalog_v2_item_json(i.food_id)
        || jsonb_build_object('usageCount', count(*)::integer) as item,
      count(*) as uses,
      max(i.created_at) as last_used
    from public.nutrition_prescription_items_v2 i
    join public.nutrition_plan_versions_v2 v on v.id = i.version_id
    join public.nutrition_plans_v2 pl on pl.id = v.plan_id
    left join public.nutrition_meal_slots_v2 s on s.id = i.meal_slot_id
    where pl.coach_id = auth.uid()
      and i.food_id is not null
      and (v_slot is null or s.name ilike v_slot)
    group by i.food_id
    order by uses desc, last_used desc
    limit v_limit
  ) top;

  if p_client_id is not null and private.nutrition_v2_can_read_client(p_client_id) then
    -- Recientes del alumno: ultimo consumo real por alimento (90 dias).
    select coalesce(jsonb_agg(item order by last_at desc), '[]'::jsonb)
    into v_client_recent
    from (
      select
        private.food_catalog_v2_item_json(e.food_id) as item,
        max(coalesce(e.occurred_at, e.created_at)) as last_at
      from public.nutrition_intake_entries e
      where e.client_id = p_client_id
        and e.food_id is not null
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and e.log_date >= current_date - 90
        and private.food_catalog_v2_can_read_food(e.food_id)
      group by e.food_id
      order by last_at desc
      limit v_limit
    ) recents;

    -- Favoritos declarados por el alumno.
    select coalesce(jsonb_agg(private.food_catalog_v2_item_json(p.food_id) order by p.created_at desc), '[]'::jsonb)
    into v_client_favorites
    from (
      select cfp.food_id, cfp.created_at
      from public.client_food_preferences cfp
      where cfp.client_id = p_client_id
        and cfp.preference_type = 'favorite'
        and private.food_catalog_v2_can_read_food(cfp.food_id)
      order by cfp.created_at desc
      limit v_limit
    ) p;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'coachTop', coalesce(v_coach_top, '[]'::jsonb),
    'clientRecent', v_client_recent,
    'clientFavorites', v_client_favorites
  );
end;
$FN$;

revoke all on function public.get_coach_food_suggestions_v2(uuid, text, integer) from public, anon;
grant execute on function public.get_coach_food_suggestions_v2(uuid, text, integer) to authenticated;

comment on function public.get_coach_food_suggestions_v2(uuid, text, integer) is
  'Sugerencias pre-busqueda del picker de alimentos V2: coachTop (frecuentes del coach por prescripcion, filtro opcional por nombre de franja), clientRecent (consumo real 90d) y clientFavorites (preferencias del alumno). Items = food_catalog_v2_item_json + usageCount en coachTop. Scope: coach autenticado; datos del alumno solo si nutrition_v2_can_read_client.';
