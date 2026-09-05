-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-20 01:08:58 y nunca se versionó. Idempotente; la fila 20260620010858 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: la v2 de `apply_nutrition_template_to_client` — la que acepta `p_coach` cuando el
-- caller es service_role (el CRON de ciclos corre sin sesión, auth.uid() NULL). Se aplicó 15m29s
-- después de la versión remota 20260620005329 `nutrition_propagation_rpc` (= archivo local
-- 20260619140000_nutrition_propagation_rpc.sql), que fue el primer deploy de la RPC.
--
-- Estado VIGENTE en LIVE al 2026-09-05:
--   · Firma: apply_nutrition_template_to_client(p_op jsonb, p_coach uuid DEFAULT NULL::uuid)
--     → jsonb, plpgsql, SECURITY DEFINER, SET search_path = ''
--   · Cuerpo: idéntico byte a byte al del archivo local 20260619140000_nutrition_propagation_rpc.sql
--     (md5 del prosrc normalizado, LIVE y local = 5de971367bd9d2e1c4e7c41a0a4bc199). El autor
--     mergeó la v2 en el espejo local; el CREATE OR REPLACE de abajo es ese mismo cuerpo.
--   · proacl = postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres  (sin anon)
--
-- Cross-check: NO contradice a 20260805182248_revoke_anon_execute_writer_definer_fns.sql:9, que
-- ordena después y le saca EXECUTE a `anon`. Este archivo no le da anon: sólo authenticated
-- (+ service_role, que hereda del owner postgres). Estado final del replay = estado de LIVE. ✔

-- La firma vieja de 1 arg (deploy inicial de este branch) se reemplaza por la de 2 args.
DROP FUNCTION IF EXISTS public.apply_nutrition_template_to_client(jsonb);

CREATE OR REPLACE FUNCTION public.apply_nutrition_template_to_client(p_op jsonb, p_coach uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Sesión de usuario → auth.uid() (ignora p_coach). Cron service-role → p_coach (sin sesión).
  v_coach uuid := COALESCE(
    (SELECT auth.uid()),
    CASE WHEN (SELECT auth.role()) = 'service_role' THEN p_coach END
  );
  v_client uuid := (p_op->>'client_id')::uuid;
  v_org uuid := NULLIF(p_op->>'org_id', '')::uuid;
  v_template uuid := NULLIF(p_op->>'template_id', '')::uuid;
  v_mode text := p_op->>'mode';
  v_plan_id uuid := NULLIF(p_op->>'plan_id', '')::uuid;
  v_pf jsonb := COALESCE(p_op->'plan_fields', '{}'::jsonb);
  v_meal jsonb;
  v_meal_id uuid;
  v_del_ids uuid[];
  v_deleted int := 0;
  v_updated int := 0;
  v_inserted int := 0;
BEGIN
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'apply_nutrition_template_to_client: sin sesion ni coach service-role';
  END IF;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'apply_nutrition_template_to_client: client_id requerido';
  END IF;

  -- Ownership del alumno (org-scoped). NULL org = standalone; set = enterprise.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = v_client
      AND c.coach_id = v_coach
      AND ((v_org IS NULL AND c.org_id IS NULL) OR c.org_id = v_org)
  ) THEN
    RAISE EXCEPTION 'apply_nutrition_template_to_client: alumno % no pertenece al coach', v_client;
  END IF;

  -- ── CREATE: alumno nuevo para la plantilla (sin logs históricos) ──────────────────────────────
  IF v_mode = 'create' THEN
    -- Invariante "un plan activo por alumno": desactiva CUALQUIER plan activo previo (incl. custom o
    -- de otra plantilla) antes de crear el nuevo. Asimétrico a propósito con update-mode (que NO toca
    -- planes custom): aquí el alumno aún no tenía este plan, y dos planes activos romperían el "plan
    -- activo" único que lee la app. Espeja el comportamiento histórico de propagateTemplateChanges.
    UPDATE public.nutrition_plans
      SET is_active = false
      WHERE client_id = v_client AND coach_id = v_coach AND is_active = true
        AND ((v_org IS NULL AND org_id IS NULL) OR org_id = v_org);

    INSERT INTO public.nutrition_plans
      (client_id, coach_id, org_id, template_id, name, daily_calories, protein_g, carbs_g, fats_g,
       instructions, is_active, is_custom)
    VALUES
      (v_client, v_coach, v_org, v_template,
       v_pf->>'name',
       NULLIF(v_pf->>'daily_calories', '')::int,
       NULLIF(v_pf->>'protein_g', '')::int,
       NULLIF(v_pf->>'carbs_g', '')::int,
       NULLIF(v_pf->>'fats_g', '')::int,
       v_pf->>'instructions',
       true, false)
    RETURNING id INTO v_plan_id;

    FOR v_meal IN SELECT * FROM jsonb_array_elements(COALESCE(p_op->'meals_insert', '[]'::jsonb))
    LOOP
      INSERT INTO public.nutrition_meals (plan_id, name, description, order_index, day_of_week)
      VALUES (v_plan_id, v_meal->>'name', COALESCE(v_meal->>'description', ''),
              COALESCE((v_meal->>'order_index')::int, 0), NULLIF(v_meal->>'day_of_week', '')::int)
      RETURNING id INTO v_meal_id;

      INSERT INTO public.food_items (meal_id, food_id, quantity, unit, swap_options)
      SELECT v_meal_id, (fi->>'food_id')::uuid, (fi->>'quantity')::numeric, fi->>'unit',
             COALESCE(fi->'swap_options', '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(v_meal->'food_items', '[]'::jsonb)) fi;

      v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object('client_id', v_client, 'plan_id', v_plan_id, 'mode', 'create',
                              'inserted', v_inserted);
  END IF;

  -- ── UPDATE in-place del plan synced existente (preserva plan_id → meal_logs siguen válidos) ────
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'apply_nutrition_template_to_client: plan_id requerido en update';
  END IF;
  -- El plan debe ser del alumno+coach y NO custom (los planes custom no se sobreescriben al propagar).
  IF NOT EXISTS (
    SELECT 1 FROM public.nutrition_plans p
    WHERE p.id = v_plan_id AND p.client_id = v_client AND p.coach_id = v_coach
      AND p.is_custom IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'apply_nutrition_template_to_client: plan % no pertenece o es custom', v_plan_id;
  END IF;

  UPDATE public.nutrition_plans SET
    name = v_pf->>'name',
    daily_calories = NULLIF(v_pf->>'daily_calories', '')::int,
    protein_g = NULLIF(v_pf->>'protein_g', '')::int,
    carbs_g = NULLIF(v_pf->>'carbs_g', '')::int,
    fats_g = NULLIF(v_pf->>'fats_g', '')::int,
    instructions = v_pf->>'instructions'
  WHERE id = v_plan_id;

  -- Borrar SOLO huérfanas DENTRO del plan y SIN logs (re-guarda log-aware; cascade-safety).
  SELECT array_agg(m.id) INTO v_del_ids
  FROM public.nutrition_meals m
  WHERE m.plan_id = v_plan_id
    AND m.id IN (
      SELECT t::uuid FROM jsonb_array_elements_text(COALESCE(p_op->'meals_delete', '[]'::jsonb)) t
    )
    AND NOT EXISTS (SELECT 1 FROM public.nutrition_meal_logs l WHERE l.meal_id = m.id);

  IF v_del_ids IS NOT NULL THEN
    DELETE FROM public.food_items WHERE meal_id = ANY(v_del_ids);
    DELETE FROM public.nutrition_meals WHERE id = ANY(v_del_ids);
    v_deleted := COALESCE(array_length(v_del_ids, 1), 0);
  END IF;

  -- Update in-place de comidas matcheadas (id preservado) + reemplazo de sus food_items.
  FOR v_meal IN SELECT * FROM jsonb_array_elements(COALESCE(p_op->'meals_update', '[]'::jsonb))
  LOOP
    v_meal_id := (v_meal->>'id')::uuid;
    UPDATE public.nutrition_meals SET
      name = v_meal->>'name',
      description = COALESCE(v_meal->>'description', ''),
      order_index = COALESCE((v_meal->>'order_index')::int, 0),
      day_of_week = NULLIF(v_meal->>'day_of_week', '')::int
    WHERE id = v_meal_id AND plan_id = v_plan_id;

    -- food_items delete PLAN-SCOPED (P2-3): solo si la comida pertenece a este plan; un id de otro
    -- plan no puede nukear sus items.
    DELETE FROM public.food_items fi
      USING public.nutrition_meals m
      WHERE fi.meal_id = m.id AND m.id = v_meal_id AND m.plan_id = v_plan_id;

    INSERT INTO public.food_items (meal_id, food_id, quantity, unit, swap_options)
    SELECT v_meal_id, (fi->>'food_id')::uuid, (fi->>'quantity')::numeric, fi->>'unit',
           COALESCE(fi->'swap_options', '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(v_meal->'food_items', '[]'::jsonb)) fi
    WHERE EXISTS (SELECT 1 FROM public.nutrition_meals m WHERE m.id = v_meal_id AND m.plan_id = v_plan_id);

    v_updated := v_updated + 1;
  END LOOP;

  -- Insertar comidas nuevas (order_index de plantilla sin comida existente) + food_items.
  FOR v_meal IN SELECT * FROM jsonb_array_elements(COALESCE(p_op->'meals_insert', '[]'::jsonb))
  LOOP
    INSERT INTO public.nutrition_meals (plan_id, name, description, order_index, day_of_week)
    VALUES (v_plan_id, v_meal->>'name', COALESCE(v_meal->>'description', ''),
            COALESCE((v_meal->>'order_index')::int, 0), NULLIF(v_meal->>'day_of_week', '')::int)
    RETURNING id INTO v_meal_id;

    INSERT INTO public.food_items (meal_id, food_id, quantity, unit, swap_options)
    SELECT v_meal_id, (fi->>'food_id')::uuid, (fi->>'quantity')::numeric, fi->>'unit',
           COALESCE(fi->'swap_options', '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(v_meal->'food_items', '[]'::jsonb)) fi;

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('client_id', v_client, 'plan_id', v_plan_id, 'mode', 'update',
                            'deleted', v_deleted, 'updated', v_updated, 'inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_nutrition_template_to_client(jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_nutrition_template_to_client(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_nutrition_template_to_client(jsonb, uuid) TO service_role;
