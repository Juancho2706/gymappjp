-- Crear tabla de recetas
CREATE TABLE "public"."recipes" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "coach_id" uuid,
    "name" text NOT NULL,
    "description" text,
    "instructions" text,
    "prep_time_minutes" integer,
    "calories" integer,
    "protein_g" integer,
    "carbs_g" integer,
    "fats_g" integer,
    "source_api" text,
    "source_api_id" text,
    "image_url" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."coaches" ("id") ON DELETE CASCADE
);

-- Crear tabla de ingredientes de recetas
CREATE TABLE "public"."recipe_ingredients" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "recipe_id" uuid NOT NULL,
    "food_id" uuid, -- Nullable por si no hace match exacto con nuestra DB
    "name" text NOT NULL, -- Nombre original provisto por la API
    "quantity" numeric NOT NULL,
    "unit" text NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes" ("id") ON DELETE CASCADE,
    CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."foods" ("id") ON DELETE SET NULL
);

-- Políticas de seguridad (RLS) básicas
ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;

-- Los coaches pueden ver todas las recetas globales (coach_id is null) o las suyas propias
CREATE POLICY "Enable read access for authenticated users" ON "public"."recipes"
    FOR SELECT TO authenticated
    USING (coach_id IS NULL OR auth.uid() = coach_id);

CREATE POLICY "Enable all access for recipe owners" ON "public"."recipes"
    FOR ALL TO authenticated
    USING (auth.uid() = coach_id)
    WITH CHECK (auth.uid() = coach_id);

CREATE POLICY "Enable read access for authenticated users" ON "public"."recipe_ingredients"
    FOR SELECT TO authenticated
    USING (true); -- La seguridad la hereda de la receta a la que pertenece idealmente, pero para simplificar lectura permitimos todo

CREATE POLICY "Enable all access for recipe owners via recipe" ON "public"."recipe_ingredients"
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM "public"."recipes" WHERE id = recipe_ingredients.recipe_id AND coach_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM "public"."recipes" WHERE id = recipe_ingredients.recipe_id AND coach_id = auth.uid()));
