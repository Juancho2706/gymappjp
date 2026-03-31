-- MIGRACIÓN PARA EL SISTEMA DE PLANES DE ENTRENAMIENTO (WORKOUT PROGRAMS)
-- ESTE ARCHIVO DEBE EJECUTARSE MANUALMENTE EN EL SQL EDITOR DE SUPABASE.

-- 1. Creación de la tabla 'workout_programs'
CREATE TABLE IF NOT EXISTS public.workout_programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    weeks_to_repeat INTEGER NOT NULL DEFAULT 1,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Modificación de 'workout_plans' para añadir 'program_id' y 'day_of_week'
ALTER TABLE public.workout_plans 
ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES public.workout_programs(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7);

-- 3. Habilitar RLS para 'workout_programs'
ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de RLS para 'workout_programs' (similares a 'workout_plans')

-- Política para que los coaches puedan gestionar sus propios programas
DROP POLICY IF EXISTS "Coaches can manage their own programs" ON public.workout_programs;
CREATE POLICY "Coaches can manage their own programs"
ON public.workout_programs
FOR ALL
TO authenticated
USING (auth.uid() = coach_id)
WITH CHECK (auth.uid() = coach_id);

-- Política para que los clientes puedan ver sus propios programas
DROP POLICY IF EXISTS "Clients can view their own programs" ON public.workout_programs;
CREATE POLICY "Clients can view their own programs"
ON public.workout_programs
FOR SELECT
TO authenticated
USING (auth.uid() = client_id);

-- 5. Trigger para actualizar 'updated_at' automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.workout_programs;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.workout_programs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
