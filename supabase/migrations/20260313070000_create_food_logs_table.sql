-- Tabla para el resumen diario del log nutricional del cliente
CREATE TABLE "public"."daily_nutrition_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "client_id" uuid NOT NULL,
    "plan_id" uuid NOT NULL,
    "log_date" date NOT NULL,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "daily_nutrition_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_nutrition_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "daily_nutrition_logs_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."nutrition_plans"("id") ON DELETE CASCADE,
    CONSTRAINT "daily_nutrition_logs_unique_date" UNIQUE ("client_id", "plan_id", "log_date")
);

-- Tabla para el log de cada comida del día (Asociado al Daily Log)
CREATE TABLE "public"."nutrition_meal_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "daily_log_id" uuid NOT NULL,
    "meal_id" uuid NOT NULL,
    "is_completed" boolean NOT NULL DEFAULT false,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "nutrition_meal_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nutrition_meal_logs_daily_log_id_fkey" FOREIGN KEY ("daily_log_id") REFERENCES "public"."daily_nutrition_logs"("id") ON DELETE CASCADE,
    CONSTRAINT "nutrition_meal_logs_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "public"."nutrition_meals"("id") ON DELETE CASCADE,
    CONSTRAINT "nutrition_meal_logs_unique_meal" UNIQUE ("daily_log_id", "meal_id")
);

-- Habilitar RLS
ALTER TABLE "public"."daily_nutrition_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."nutrition_meal_logs" ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para daily_nutrition_logs
CREATE POLICY "Client can manage their own daily nutrition logs" ON "public"."daily_nutrition_logs" FOR ALL USING (auth.uid() = client_id);
CREATE POLICY "Coach can view their clients' daily nutrition logs" ON "public"."daily_nutrition_logs" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."clients" WHERE id = daily_nutrition_logs.client_id AND coach_id = auth.uid())
);

-- Políticas de seguridad para nutrition_meal_logs
CREATE POLICY "Client can manage their own meal logs" ON "public"."nutrition_meal_logs" FOR ALL USING (
    EXISTS (SELECT 1 FROM "public"."daily_nutrition_logs" WHERE id = nutrition_meal_logs.daily_log_id AND client_id = auth.uid())
);
CREATE POLICY "Coach can view their clients' meal logs" ON "public"."nutrition_meal_logs" FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM "public"."daily_nutrition_logs"
        JOIN "public"."clients" ON clients.id = daily_nutrition_logs.client_id 
        WHERE daily_nutrition_logs.id = nutrition_meal_logs.daily_log_id 
        AND clients.coach_id = auth.uid()
    )
);