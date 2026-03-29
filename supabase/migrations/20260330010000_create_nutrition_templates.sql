-- Migration to support Nutrition Plan Templates (Global Plans) and mass assignment

-- 1. Create nutrition_plan_templates table
CREATE TABLE IF NOT EXISTS "public"."nutrition_plan_templates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "daily_calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "instructions" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "nutrition_plan_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nutrition_plan_templates_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches" ("id") ON DELETE CASCADE
);

-- 2. Create template_meals table (to store meals for the template)
CREATE TABLE IF NOT EXISTS "public"."template_meals" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "template_id" uuid NOT NULL,
    "name" text NOT NULL,
    "order_index" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "template_meals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "template_meals_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."nutrition_plan_templates" ("id") ON DELETE CASCADE
);

-- 3. Create template_meal_groups table (to link meals to meal groups/templates)
-- This table allows a meal in a plan template to be composed of one or more "Meal Groups" (saved_meals)
CREATE TABLE IF NOT EXISTS "public"."template_meal_groups" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "template_meal_id" uuid NOT NULL,
    "saved_meal_id" uuid NOT NULL,
    "order_index" integer NOT NULL DEFAULT 0,
    CONSTRAINT "template_meal_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "template_meal_groups_template_meal_id_fkey" FOREIGN KEY ("template_meal_id") REFERENCES "public"."template_meals" ("id") ON DELETE CASCADE,
    CONSTRAINT "template_meal_groups_saved_meal_id_fkey" FOREIGN KEY ("saved_meal_id") REFERENCES "public"."saved_meals" ("id") ON DELETE CASCADE
);

-- 4. Enable RLS
ALTER TABLE "public"."nutrition_plan_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."template_meals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."template_meal_groups" ENABLE ROW LEVEL SECURITY;

-- 5. Policies for nutrition_plan_templates
CREATE POLICY "Coaches can manage their own templates" ON "public"."nutrition_plan_templates"
    FOR ALL TO authenticated
    USING (auth.uid() = coach_id)
    WITH CHECK (auth.uid() = coach_id);

-- 6. Policies for template_meals
CREATE POLICY "Coaches can manage meals of their templates" ON "public"."template_meals"
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM "public"."nutrition_plan_templates" WHERE id = template_meals.template_id AND coach_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM "public"."nutrition_plan_templates" WHERE id = template_meals.template_id AND coach_id = auth.uid()));

-- 7. Policies for template_meal_groups
CREATE POLICY "Coaches can manage meal groups of their templates" ON "public"."template_meal_groups"
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM "public"."template_meals" tm
        JOIN "public"."nutrition_plan_templates" npt ON tm.template_id = npt.id
        WHERE tm.id = template_meal_groups.template_meal_id AND npt.coach_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM "public"."template_meals" tm
        JOIN "public"."nutrition_plan_templates" npt ON tm.template_id = npt.id
        WHERE tm.id = template_meal_groups.template_meal_id AND npt.coach_id = auth.uid()
    ));

-- Note: We don't need a nutrition_plan_assignments table because we can directly 
-- instantiate a nutrition_plan for each student from the template.
-- This allows per-student customization later if needed.
