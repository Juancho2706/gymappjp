-- ==========================================
-- 07_overview_data_foundation.sql
-- ==========================================
-- Crea las tablas base para registrar las acciones del alumno
-- y la función para calcular la racha (streak).

-- 1. Tabla de Sesiones de Entrenamiento Completadas
CREATE TABLE IF NOT EXISTS workout_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES workout_plans(id) ON DELETE SET NULL, -- Opcional, por si se borra el plan
    date_completed DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_workout_sessions_client_id ON workout_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_date_completed ON workout_sessions(date_completed);

-- 2. Tabla de Comidas Completadas (si no existe)
CREATE TABLE IF NOT EXISTS meal_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    meal_id UUID NOT NULL, -- Referencia a la comida en el plan
    date_completed DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meal_completions_client_id ON meal_completions(client_id);
CREATE INDEX IF NOT EXISTS idx_meal_completions_date_completed ON meal_completions(date_completed);


-- 3. Verificación/Creación de la tabla check_ins
CREATE TABLE IF NOT EXISTS check_ins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight NUMERIC(5,2),
    body_fat_percentage NUMERIC(4,2),
    front_photo_url TEXT,
    side_photo_url TEXT,
    back_photo_url TEXT,
    notes TEXT,
    energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
    sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
    digestion_quality INTEGER CHECK (digestion_quality BETWEEN 1 AND 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_check_ins_client_id ON check_ins(client_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON check_ins(date);


-- 4. Función para calcular la Racha (Streak) actual
-- Una racha se mantiene si hay al menos un entrenamiento o una comida completada en días consecutivos.
CREATE OR REPLACE FUNCTION get_client_current_streak(p_client_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_streak INTEGER := 0;
    v_last_date DATE;
    v_current_date DATE;
    v_activity_dates DATE[];
    v_date DATE;
BEGIN
    -- Obtener todas las fechas únicas de actividad (entrenamientos o comidas) ordenadas descendentemente
    SELECT ARRAY_AGG(activity_date ORDER BY activity_date DESC)
    INTO v_activity_dates
    FROM (
        SELECT date_completed AS activity_date FROM workout_sessions WHERE client_id = p_client_id
        UNION
        SELECT date_completed AS activity_date FROM meal_completions WHERE client_id = p_client_id
    ) sub;

    IF v_activity_dates IS NULL OR array_length(v_activity_dates, 1) = 0 THEN
        RETURN 0;
    END IF;

    -- Empezar a comprobar desde hoy o ayer
    v_current_date := CURRENT_DATE;
    
    -- Si el primer registro no es de hoy ni de ayer, la racha actual es 0
    IF v_activity_dates[1] < v_current_date - INTERVAL '1 day' THEN
        RETURN 0;
    END IF;

    v_last_date := v_activity_dates[1];
    v_streak := 1;

    -- Iterar sobre el resto de las fechas
    FOR i IN 2..array_length(v_activity_dates, 1) LOOP
        v_date := v_activity_dates[i];
        
        -- Si la fecha actual es exactamente el día anterior a la última fecha comprobada
        IF v_date = v_last_date - INTERVAL '1 day' THEN
            v_streak := v_streak + 1;
            v_last_date := v_date;
        -- Si hay huecos de más de un día, se rompe la racha
        ELSIF v_date < v_last_date - INTERVAL '1 day' THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN v_streak;
END;
$$;

-- Añadir políticas RLS (Row Level Security) para las nuevas tablas
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_completions ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (Coach puede ver/editar todo lo de sus clientes, Cliente solo lo suyo)
-- Asumimos que la lógica de auth.uid() = id en profiles se aplica.
-- Por simplicidad en este script base, permitimos todo a usuarios autenticados. Ajustar según requerimientos reales.
CREATE POLICY "Enable read access for authenticated users" ON workout_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON workout_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON workout_sessions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON workout_sessions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON meal_completions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON meal_completions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON meal_completions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON meal_completions FOR DELETE TO authenticated USING (true);

CREATE POLICY "Enable read access for authenticated users" ON check_ins FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for authenticated users" ON check_ins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for authenticated users" ON check_ins FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Enable delete access for authenticated users" ON check_ins FOR DELETE TO authenticated USING (true);
