-- EVA — cierre de archivado y detalle histórico Nutrition V1 en V2.
--
-- Orden: esta migración corre DESPUÉS de
-- 20260731123000_archive_client_deactivates_assignments.sql. Esa migración instala el
-- trigger que desactiva todas las asignaciones al archivar; aquí se refuerza su backfill,
-- se cubre el ciclo V1 que faltaba en los guards de entrada y se cierra RLS para JWTs ya
-- emitidos. Es forward-only e idempotente.
--
-- Invariante: un alumno archivado/pausado no puede leer ni escribir sus datos por
-- PostgREST/RPC. Un coach o miembro autorizado sigue pudiendo gestionar SUS alumnos aunque
-- también tenga una fila `clients` propia archivada; por eso los gates se evalúan contra la
-- fila objetivo y la pertenencia de ese workspace, nunca con un bloqueo global del actor.

-- Repara estado previo al trigger (seguro repetir el backfill de la migración anterior).
UPDATE public.workout_programs AS wp
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE wp.client_id = c.id
  AND c.is_archived is true
  AND wp.is_active is true;

UPDATE public.nutrition_plans AS np
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE np.client_id = c.id
  AND c.is_archived is true
  AND np.is_active is true;

UPDATE public.nutrition_plan_cycles AS npc
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE npc.client_id = c.id
  AND c.is_archived is true
  AND npc.is_active is true;

UPDATE public.nutrition_plans_v2 AS np2
SET lifecycle_status = 'archived',
    archived_at = COALESCE(np2.archived_at, now()),
    updated_at = now()
FROM public.clients AS c
WHERE np2.client_id = c.id
  AND c.is_archived is true
  AND np2.lifecycle_status = 'active';

-- `nutrition_plan_cycles` también es una asignación activa V1. El primer fix cubría el
-- backfill, pero no impedía que una ruta residual la reactivara después de archivar.
CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.clients c
       WHERE c.id = NEW.client_id
         AND c.is_archived is true
     ) THEN
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan_cycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS nutrition_plan_cycles_archived_client_guard ON public.nutrition_plan_cycles;
CREATE TRIGGER nutrition_plan_cycles_archived_client_guard
BEFORE INSERT OR UPDATE OF client_id, is_active ON public.nutrition_plan_cycles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_archived_client_nutrition_plan_cycle();

-- La rama propia solo pasa si su ficha está vigente. Las ramas profesionales se validan
-- contra el MISMO cliente objetivo mediante el helper de workspace de V2; esto preserva el
-- acceso de standalone, Team y Enterprise sin permitir que un alumno lea filas ajenas.
CREATE OR REPLACE FUNCTION private.student_data_read_gate(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_client_id IS NULL
    OR (
      (
        auth.uid() = p_client_id
        OR EXISTS (
          SELECT 1
          FROM public.client_memberships cm
          WHERE cm.client_id = p_client_id
            AND cm.account_id = auth.uid()
            AND cm.deleted_at IS NULL
            AND cm.status = 'active'
        )
      )
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = p_client_id
          AND c.is_archived is not true
          AND c.is_active is not false
      )
    )
    OR private.nutrition_v2_can_manage_client(p_client_id);
$$;

-- Some audit rows intentionally have no client. A permissive policy on such a table must
-- never turn the `p_client_id IS NULL` template escape hatch above into a global audit feed.
CREATE OR REPLACE FUNCTION private.student_data_read_gate_required(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_client_id IS NOT NULL AND private.student_data_read_gate(p_client_id);
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_workout_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workout_plans wp
    WHERE wp.id = p_plan_id
      AND private.student_data_read_gate(wp.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_movement_assessment(p_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.movement_assessments ma
    WHERE ma.id = p_assessment_id
      AND private.student_data_read_gate(ma.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_nutrition_meal(p_meal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nutrition_meals nm
    JOIN public.nutrition_plans np ON np.id = nm.plan_id
    WHERE nm.id = p_meal_id
      AND private.student_data_read_gate(np.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_nutrition_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nutrition_plans np
    WHERE np.id = p_plan_id
      AND private.student_data_read_gate(np.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_daily_nutrition_log(p_daily_log_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.daily_nutrition_logs dl
    WHERE dl.id = p_daily_log_id
      AND private.student_data_read_gate(dl.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_nutrition_v2_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nutrition_plans_v2 p
    WHERE p.id = p_plan_id
      AND private.student_data_read_gate(p.client_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.student_data_read_gate_for_nutrition_v2_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nutrition_plan_versions_v2 v
    JOIN public.nutrition_plans_v2 p ON p.id = v.plan_id
    WHERE v.id = p_version_id
      AND private.student_data_read_gate(p.client_id)
  );
$$;

REVOKE ALL ON FUNCTION private.student_data_read_gate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_required(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_workout_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_movement_assessment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_nutrition_meal(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_nutrition_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_daily_nutrition_log(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_nutrition_v2_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.student_data_read_gate_for_nutrition_v2_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_required(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_workout_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_movement_assessment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_nutrition_meal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_nutrition_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_daily_nutrition_log(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_nutrition_v2_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.student_data_read_gate_for_nutrition_v2_version(uuid) TO authenticated;

-- Restrictive policies compose with the existing workspace policies. They remove only the
-- stale "own client" branch for archived/paused students and repair the historical open
-- `workout_sessions` policy without changing Team/coach authorization semantics.
DO $$
DECLARE
  rule record;
BEGIN
  FOR rule IN
    SELECT *
    FROM (
      VALUES
        ('clients', 'archive_gate_clients', 'private.student_data_read_gate(id)'),
        ('client_consents', 'archive_gate_client_consents', 'private.student_data_read_gate(client_id)'),
        ('client_feature_prefs', 'archive_gate_client_feature_prefs', 'private.student_data_read_gate(client_id)'),
        ('client_intake', 'archive_gate_client_intake', 'private.student_data_read_gate(client_id)'),
        ('client_memberships', 'archive_gate_client_memberships', 'private.student_data_read_gate(client_id)'),
        ('client_payments', 'archive_gate_client_payments', 'private.student_data_read_gate(client_id)'),
        ('check_ins', 'archive_gate_check_ins', 'private.student_data_read_gate(client_id)'),
        ('daily_habits', 'archive_gate_daily_habits', 'private.student_data_read_gate(client_id)'),
        ('body_composition_measurements', 'archive_gate_body_composition', 'private.student_data_read_gate(client_id)'),
        ('movement_assessments', 'archive_gate_movement_assessments', 'private.student_data_read_gate(client_id)'),
        ('movement_assessment_items', 'archive_gate_movement_items', 'private.student_data_read_gate_for_movement_assessment(assessment_id)'),
        ('workout_programs', 'archive_gate_workout_programs', 'private.student_data_read_gate(client_id)'),
        ('workout_plans', 'archive_gate_workout_plans', 'private.student_data_read_gate(client_id)'),
        ('workout_blocks', 'archive_gate_workout_blocks', 'private.student_data_read_gate_for_workout_plan(plan_id)'),
        ('workout_logs', 'archive_gate_workout_logs', 'private.student_data_read_gate(client_id)'),
        ('workout_sessions', 'archive_gate_workout_sessions', 'private.student_data_read_gate(client_id)'),
        ('nutrition_plans', 'archive_gate_nutrition_plans', 'private.student_data_read_gate(client_id)'),
        ('nutrition_plan_cycles', 'archive_gate_nutrition_cycles', 'private.student_data_read_gate(client_id)'),
        ('nutrition_meals', 'archive_gate_nutrition_meals', 'private.student_data_read_gate_for_nutrition_plan(plan_id)'),
        ('food_items', 'archive_gate_food_items', 'private.student_data_read_gate_for_nutrition_meal(meal_id)'),
        ('daily_nutrition_logs', 'archive_gate_daily_nutrition', 'private.student_data_read_gate(client_id)'),
        ('nutrition_meal_logs', 'archive_gate_meal_logs', 'private.student_data_read_gate_for_daily_nutrition_log(daily_log_id)'),
        ('nutrition_meal_comments', 'archive_gate_meal_comments', 'private.student_data_read_gate(client_id)'),
        ('nutrition_meal_food_swaps', 'archive_gate_food_swaps', 'private.student_data_read_gate(client_id)'),
        ('nutrition_intake_entries', 'archive_gate_intake_entries', 'private.student_data_read_gate(client_id)'),
        ('client_food_preferences', 'archive_gate_food_preferences', 'private.student_data_read_gate(client_id)'),
        ('nutrition_plan_day_variants', 'archive_gate_nutrition_plan_variants', 'private.student_data_read_gate_for_nutrition_plan(plan_id)'),
        ('meal_exchange_targets', 'archive_gate_meal_exchange_targets', 'private.student_data_read_gate_for_nutrition_meal(meal_id)'),
        ('nutrition_plan_history', 'archive_gate_nutrition_plan_history', 'private.student_data_read_gate(client_id)'),
        ('nutrition_private_notes', 'archive_gate_nutrition_private_notes', 'private.student_data_read_gate(client_id)'),
        ('nutrition_recipe_assignments', 'archive_gate_nutrition_recipe_assignments', 'private.student_data_read_gate(client_id)'),
        ('nutrition_plans_v2', 'archive_gate_nutrition_v2_plans', 'private.student_data_read_gate(client_id)'),
        ('nutrition_plan_versions_v2', 'archive_gate_nutrition_v2_versions', 'private.student_data_read_gate_for_nutrition_v2_plan(plan_id)'),
        ('nutrition_day_variants_v2', 'archive_gate_nutrition_v2_variants', 'private.student_data_read_gate_for_nutrition_v2_version(version_id)'),
        ('nutrition_meal_slots_v2', 'archive_gate_nutrition_v2_slots', 'private.student_data_read_gate_for_nutrition_v2_version(version_id)'),
        ('nutrition_prescription_items_v2', 'archive_gate_nutrition_v2_items', 'private.student_data_read_gate_for_nutrition_v2_version(version_id)'),
        ('nutrition_item_substitutions_v2', 'archive_gate_nutrition_v2_subs', 'private.student_data_read_gate_for_nutrition_v2_version(version_id)'),
        ('nutrition_day_snapshots_v2', 'archive_gate_nutrition_v2_snapshots', 'private.student_data_read_gate(client_id)'),
        ('nutrition_v2_audit_log', 'archive_gate_nutrition_v2_audit', 'private.student_data_read_gate_required(client_id)')
    ) AS rules(table_name, policy_name, predicate)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rule.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rule.policy_name, rule.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      rule.policy_name,
      rule.table_name,
      rule.predicate,
      rule.predicate
    );
  END LOOP;
END;
$$;

-- Nutrition V1 remains immutable source history. This adapter exposes only a normalized,
-- read-only detail for a selected date; it never writes V2 events or reuses a V1 UI.
CREATE OR REPLACE FUNCTION public.get_nutrition_legacy_history_detail_v2(
  p_client_id uuid,
  p_local_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_targets jsonb := '[]'::jsonb;
  v_meals jsonb := '[]'::jsonb;
  v_swaps jsonb := '[]'::jsonb;
  v_intake_entries jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.nutrition_v2_can_read_client(p_client_id) THEN
    RAISE EXCEPTION 'nutrition_v2_legacy_history_detail_scope_denied' USING errcode = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'planName', dl.plan_name_at_log,
        'calories', dl.target_calories_at_log,
        'proteinG', dl.target_protein_at_log,
        'carbsG', dl.target_carbs_at_log,
        'fatsG', dl.target_fats_at_log
      )
      ORDER BY dl.created_at ASC, dl.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_targets
  FROM public.daily_nutrition_logs dl
  WHERE dl.client_id = p_client_id
    AND dl.log_date = p_local_date;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'mealId', ml.meal_id,
        'mealName', COALESCE(nm.name, 'Comida anterior'),
        'completedAt', ml.created_at,
        'consumedQuantity', ml.consumed_quantity,
        'satisfactionScore', ml.satisfaction_score,
        'foods', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'foodId', fi.food_id,
              'name', COALESCE(f.name, 'Alimento anterior'),
              'brand', f.brand,
              'quantity', fi.quantity,
              'unit', fi.unit
            )
            ORDER BY fi.id ASC
          )
          FROM public.food_items fi
          LEFT JOIN public.foods f ON f.id = fi.food_id
          WHERE fi.meal_id = ml.meal_id
        ), '[]'::jsonb)
      )
      ORDER BY nm.order_index ASC NULLS LAST, ml.created_at ASC, ml.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_meals
  FROM public.nutrition_meal_logs ml
  JOIN public.daily_nutrition_logs dl ON dl.id = ml.daily_log_id
  LEFT JOIN public.nutrition_meals nm ON nm.id = ml.meal_id
  WHERE dl.client_id = p_client_id
    AND dl.log_date = p_local_date
    AND ml.is_completed IS TRUE;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'mealId', s.meal_id,
        'originalFoodId', s.original_food_id,
        'originalFoodName', COALESCE(original_food.name, 'Alimento anterior'),
        'swappedFoodId', s.swapped_food_id,
        'swappedFoodName', COALESCE(swapped_food.name, 'Alimento anterior'),
        'quantity', COALESCE(s.swapped_quantity, fi.quantity),
        'unit', COALESCE(s.swapped_unit, fi.unit),
        'createdAt', s.created_at
      )
      ORDER BY s.created_at ASC, s.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_swaps
  FROM public.nutrition_meal_food_swaps s
  JOIN public.daily_nutrition_logs dl ON dl.id = s.daily_log_id
  LEFT JOIN public.food_items fi
    ON fi.meal_id = s.meal_id
   AND fi.food_id = s.original_food_id
  LEFT JOIN public.foods original_food ON original_food.id = s.original_food_id
  LEFT JOIN public.foods swapped_food ON swapped_food.id = s.swapped_food_id
  WHERE s.client_id = p_client_id
    AND dl.log_date = p_local_date;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'entryId', e.id,
        'foodName', COALESCE(e.snapshot_name, e.custom_name, f.name, 'Registro anterior'),
        'brand', COALESCE(e.snapshot_brand, f.brand),
        'quantity', e.quantity,
        'unit', e.unit,
        'mealSlot', e.meal_slot,
        'source', e.source,
        'note', e.note,
        'occurredAt', COALESCE(e.occurred_at, e.created_at),
        'calories', COALESCE(e.snapshot_calories, f.calories),
        'proteinG', COALESCE(e.snapshot_protein_g, f.protein_g),
        'carbsG', COALESCE(e.snapshot_carbs_g, f.carbs_g),
        'fatsG', COALESCE(e.snapshot_fats_g, f.fats_g)
      )
      ORDER BY COALESCE(e.occurred_at, e.created_at) ASC, e.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_intake_entries
  FROM public.nutrition_intake_entries e
  LEFT JOIN public.foods f ON f.id = e.food_id
  WHERE e.client_id = p_client_id
    AND e.log_date = p_local_date
    AND e.idempotency_key IS NULL;

  RETURN jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'source', 'legacy_v1',
    'localDate', p_local_date,
    'targets', v_targets,
    'meals', v_meals,
    'swaps', v_swaps,
    'intakeEntries', v_intake_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_nutrition_legacy_history_detail_v2(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nutrition_legacy_history_detail_v2(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_nutrition_legacy_history_detail_v2(uuid, date) IS
  'Nutrition V2 read-only adapter over immutable V1 history. Returns completed meals, foods, swaps, old intake and historical targets for one date.';
