-- RLS fase 2: saved_meals / saved_meal_items (grupos guardados del coach, meal-groups, PlanBuilder).
-- Aplicado también vía MCP Supabase el 2026-04-10 en el proyecto vinculado.

ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_meals_coach_all" ON saved_meals;
CREATE POLICY "saved_meals_coach_all"
  ON saved_meals
  FOR ALL
  TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

ALTER TABLE saved_meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_meal_items_coach_all" ON saved_meal_items;
CREATE POLICY "saved_meal_items_coach_all"
  ON saved_meal_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM saved_meals s
      WHERE s.id = saved_meal_items.saved_meal_id
        AND s.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_meals s
      WHERE s.id = saved_meal_items.saved_meal_id
        AND s.coach_id = auth.uid()
    )
  );
