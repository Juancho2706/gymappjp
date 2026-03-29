-- La tabla saved_meals ya tiene coach_id y name, lo cual es suficiente para "Grupos de Alimentos".
-- La tabla saved_meal_items ya tiene saved_meal_id, food_id y quantity, lo cual es suficiente.

-- Agregamos políticas RLS para saved_meals si no existen (asumiendo que se crearon sin ellas en la migración original)
ALTER TABLE "public"."saved_meals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."saved_meal_items" ENABLE ROW LEVEL SECURITY;

-- Políticas para saved_meals
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'saved_meals' AND policyname = 'Coaches can manage their own saved meals'
    ) THEN
        CREATE POLICY "Coaches can manage their own saved meals" ON "public"."saved_meals"
            FOR ALL TO authenticated
            USING (auth.uid() = coach_id)
            WITH CHECK (auth.uid() = coach_id);
    END IF;
END $$;

-- Políticas para saved_meal_items
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'saved_meal_items' AND policyname = 'Coaches can manage items of their own saved meals'
    ) THEN
        CREATE POLICY "Coaches can manage items of their own saved meals" ON "public"."saved_meal_items"
            FOR ALL TO authenticated
            USING (EXISTS (SELECT 1 FROM "public"."saved_meals" WHERE id = saved_meal_items.saved_meal_id AND coach_id = auth.uid()))
            WITH CHECK (EXISTS (SELECT 1 FROM "public"."saved_meals" WHERE id = saved_meal_items.saved_meal_id AND coach_id = auth.uid()));
    END IF;
END $$;
