-- Nutrición: RLS fase 1 (alumno = auth.uid() == clients.id; coach == coaches.id).
-- Aplicar en staging antes de producción. El rol service_role ignora RLS.
-- Si alguna tabla ya tenía RLS, revisar conflictos antes de ejecutar.

-- ---------------------------------------------------------------------------
-- daily_nutrition_logs
-- ---------------------------------------------------------------------------
ALTER TABLE daily_nutrition_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_nutrition_logs_client_all" ON daily_nutrition_logs;
CREATE POLICY "daily_nutrition_logs_client_all"
  ON daily_nutrition_logs
  FOR ALL
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "daily_nutrition_logs_coach_select" ON daily_nutrition_logs;
CREATE POLICY "daily_nutrition_logs_coach_select"
  ON daily_nutrition_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_plans np
      WHERE np.id = daily_nutrition_logs.plan_id
        AND np.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- nutrition_meal_logs
-- ---------------------------------------------------------------------------
ALTER TABLE nutrition_meal_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_meal_logs_client_all" ON nutrition_meal_logs;
CREATE POLICY "nutrition_meal_logs_client_all"
  ON nutrition_meal_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_nutrition_logs d
      WHERE d.id = nutrition_meal_logs.daily_log_id
        AND d.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_nutrition_logs d
      WHERE d.id = nutrition_meal_logs.daily_log_id
        AND d.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "nutrition_meal_logs_coach_select" ON nutrition_meal_logs;
CREATE POLICY "nutrition_meal_logs_coach_select"
  ON nutrition_meal_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM daily_nutrition_logs d
      JOIN nutrition_plans np ON np.id = d.plan_id
      WHERE d.id = nutrition_meal_logs.daily_log_id
        AND np.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- nutrition_plans
-- ---------------------------------------------------------------------------
ALTER TABLE nutrition_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_plans_client_select" ON nutrition_plans;
CREATE POLICY "nutrition_plans_client_select"
  ON nutrition_plans
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "nutrition_plans_coach_all" ON nutrition_plans;
CREATE POLICY "nutrition_plans_coach_all"
  ON nutrition_plans
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ---------------------------------------------------------------------------
-- nutrition_meals
-- ---------------------------------------------------------------------------
ALTER TABLE nutrition_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nutrition_meals_client_select" ON nutrition_meals;
CREATE POLICY "nutrition_meals_client_select"
  ON nutrition_meals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_plans p
      WHERE p.id = nutrition_meals.plan_id
        AND p.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "nutrition_meals_coach_all" ON nutrition_meals;
CREATE POLICY "nutrition_meals_coach_all"
  ON nutrition_meals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_plans p
      WHERE p.id = nutrition_meals.plan_id
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nutrition_plans p
      WHERE p.id = nutrition_meals.plan_id
        AND p.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- food_items
-- ---------------------------------------------------------------------------
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "food_items_client_select" ON food_items;
CREATE POLICY "food_items_client_select"
  ON food_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_meals m
      JOIN nutrition_plans p ON p.id = m.plan_id
      WHERE m.id = food_items.meal_id
        AND p.client_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "food_items_coach_all" ON food_items;
CREATE POLICY "food_items_coach_all"
  ON food_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nutrition_meals m
      JOIN nutrition_plans p ON p.id = m.plan_id
      WHERE m.id = food_items.meal_id
        AND p.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nutrition_meals m
      JOIN nutrition_plans p ON p.id = m.plan_id
      WHERE m.id = food_items.meal_id
        AND p.coach_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- foods (lectura catálogo; escritura solo coach dueño)
-- ---------------------------------------------------------------------------
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "foods_select_global" ON foods;
CREATE POLICY "foods_select_global"
  ON foods
  FOR SELECT
  TO authenticated
  USING (coach_id IS NULL);

DROP POLICY IF EXISTS "foods_select_own_coach" ON foods;
CREATE POLICY "foods_select_own_coach"
  ON foods
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "foods_select_client_coach_catalog" ON foods;
CREATE POLICY "foods_select_client_coach_catalog"
  ON foods
  FOR SELECT
  TO authenticated
  USING (
    coach_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = auth.uid()
        AND c.coach_id = foods.coach_id
    )
  );

DROP POLICY IF EXISTS "foods_coach_insert" ON foods;
CREATE POLICY "foods_coach_insert"
  ON foods
  FOR INSERT
  TO authenticated
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "foods_coach_update" ON foods;
CREATE POLICY "foods_coach_update"
  ON foods
  FOR UPDATE
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

DROP POLICY IF EXISTS "foods_coach_delete" ON foods;
CREATE POLICY "foods_coach_delete"
  ON foods
  FOR DELETE
  TO authenticated
  USING (coach_id = auth.uid());
