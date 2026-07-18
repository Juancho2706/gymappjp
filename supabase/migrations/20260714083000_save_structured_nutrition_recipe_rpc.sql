-- Guardado transaccional de recetas estructuradas.
-- Aplicada en Supabase project `constant` (jikjeokundmaafuytdcx) el 2026-07-14.
-- SECURITY INVOKER: respeta RLS de nutrition_recipes, foods e ingredients.

CREATE OR REPLACE FUNCTION public.save_structured_nutrition_recipe(
  p_recipe_id uuid,
  p_team_id uuid,
  p_name text,
  p_description text,
  p_instructions text,
  p_image_url text,
  p_servings numeric,
  p_prep_time_minutes integer,
  p_category text,
  p_ingredients jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipe_id uuid;
  v_expected integer;
  v_inserted integer;
  v_ingredients_text text;
  v_total_calories numeric;
  v_total_protein numeric;
  v_total_carbs numeric;
  v_total_fats numeric;
  v_total_fiber numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' OR length(btrim(p_name)) > 160 THEN
    RAISE EXCEPTION 'Nombre de receta inválido';
  END IF;

  IF p_servings IS NULL OR p_servings <= 0 OR p_servings > 1000 THEN
    RAISE EXCEPTION 'Porciones inválidas';
  END IF;

  IF p_prep_time_minutes IS NOT NULL AND (p_prep_time_minutes < 0 OR p_prep_time_minutes > 10080) THEN
    RAISE EXCEPTION 'Tiempo de preparación inválido';
  END IF;

  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
    RAISE EXCEPTION 'Ingredientes inválidos';
  END IF;

  v_expected := jsonb_array_length(p_ingredients);
  IF v_expected < 1 OR v_expected > 200 THEN
    RAISE EXCEPTION 'La receta debe tener entre 1 y 200 ingredientes';
  END IF;

  IF p_recipe_id IS NULL THEN
    INSERT INTO public.nutrition_recipes (
      coach_id, team_id, name, description, ingredients_text, instructions,
      image_url, recipe_mode, servings, prep_time_minutes, category
    )
    VALUES (
      auth.uid(), p_team_id, btrim(p_name),
      nullif(btrim(coalesce(p_description, '')), ''), null,
      nullif(btrim(coalesce(p_instructions, '')), ''),
      nullif(btrim(coalesce(p_image_url, '')), ''),
      'structured', p_servings, p_prep_time_minutes,
      nullif(btrim(coalesce(p_category, '')), '')
    )
    RETURNING id INTO v_recipe_id;
  ELSE
    UPDATE public.nutrition_recipes
    SET
      name = btrim(p_name),
      description = nullif(btrim(coalesce(p_description, '')), ''),
      instructions = nullif(btrim(coalesce(p_instructions, '')), ''),
      image_url = nullif(btrim(coalesce(p_image_url, '')), ''),
      recipe_mode = 'structured',
      servings = p_servings,
      prep_time_minutes = p_prep_time_minutes,
      category = nullif(btrim(coalesce(p_category, '')), ''),
      updated_at = now()
    WHERE id = p_recipe_id
      AND (
        (p_team_id IS NULL AND team_id IS NULL AND coach_id = auth.uid())
        OR (p_team_id IS NOT NULL AND team_id = p_team_id)
      )
    RETURNING id INTO v_recipe_id;

    IF v_recipe_id IS NULL THEN
      RAISE EXCEPTION 'Receta no encontrada o sin permiso';
    END IF;

    DELETE FROM public.nutrition_recipe_ingredients WHERE recipe_id = v_recipe_id;
  END IF;

  WITH input_rows AS (
    SELECT *
    FROM jsonb_to_recordset(p_ingredients) AS x(
      food_id uuid, quantity numeric, unit text, note text, order_index integer
    )
  ), inserted AS (
    INSERT INTO public.nutrition_recipe_ingredients (
      recipe_id, food_id, name_snapshot, brand_snapshot, quantity, unit,
      calories_snapshot, protein_g_snapshot, carbs_g_snapshot, fats_g_snapshot,
      fiber_g_snapshot, serving_size_snapshot, serving_unit_snapshot,
      order_index, note
    )
    SELECT
      v_recipe_id, f.id, f.name, f.brand, i.quantity,
      CASE WHEN lower(i.unit) IN ('u', 'un') THEN 'un' ELSE lower(i.unit) END,
      f.calories, f.protein_g, f.carbs_g, f.fats_g, f.fiber_g,
      greatest(f.serving_size, 1), f.serving_unit,
      coalesce(i.order_index, 0), nullif(btrim(coalesce(i.note, '')), '')
    FROM input_rows i
    JOIN public.foods f ON f.id = i.food_id
    WHERE i.quantity > 0 AND lower(i.unit) IN ('g', 'ml', 'u', 'un')
    RETURNING *
  )
  SELECT count(*) INTO v_inserted FROM inserted;

  IF v_inserted <> v_expected THEN
    RAISE EXCEPTION 'Uno o más ingredientes son inválidos o no son visibles';
  END IF;

  SELECT
    string_agg(concat(quantity, ' ', unit, ' ', name_snapshot), E'\n' ORDER BY order_index, id),
    coalesce(sum(calories_snapshot * CASE WHEN unit IN ('g','ml') THEN quantity / 100 ELSE quantity * serving_size_snapshot / 100 END), 0),
    coalesce(sum(protein_g_snapshot * CASE WHEN unit IN ('g','ml') THEN quantity / 100 ELSE quantity * serving_size_snapshot / 100 END), 0),
    coalesce(sum(carbs_g_snapshot * CASE WHEN unit IN ('g','ml') THEN quantity / 100 ELSE quantity * serving_size_snapshot / 100 END), 0),
    coalesce(sum(fats_g_snapshot * CASE WHEN unit IN ('g','ml') THEN quantity / 100 ELSE quantity * serving_size_snapshot / 100 END), 0),
    coalesce(sum(coalesce(fiber_g_snapshot, 0) * CASE WHEN unit IN ('g','ml') THEN quantity / 100 ELSE quantity * serving_size_snapshot / 100 END), 0)
  INTO v_ingredients_text, v_total_calories, v_total_protein, v_total_carbs, v_total_fats, v_total_fiber
  FROM public.nutrition_recipe_ingredients
  WHERE recipe_id = v_recipe_id;

  UPDATE public.nutrition_recipes
  SET
    ingredients_text = v_ingredients_text,
    calories_per_serving = round(v_total_calories / p_servings, 1),
    protein_g_per_serving = round(v_total_protein / p_servings, 1),
    carbs_g_per_serving = round(v_total_carbs / p_servings, 1),
    fats_g_per_serving = round(v_total_fats / p_servings, 1),
    fiber_g_per_serving = round(v_total_fiber / p_servings, 1),
    updated_at = now()
  WHERE id = v_recipe_id;

  RETURN v_recipe_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_structured_nutrition_recipe(
  uuid, uuid, text, text, text, text, numeric, integer, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_structured_nutrition_recipe(
  uuid, uuid, text, text, text, text, numeric, integer, text, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.save_structured_nutrition_recipe(
  uuid, uuid, text, text, text, text, numeric, integer, text, jsonb
) IS 'Guarda receta estructurada e ingredientes en una transacción, derivando snapshots y macros desde foods visibles por RLS.';
