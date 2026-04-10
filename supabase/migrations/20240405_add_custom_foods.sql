-- 1. Añadir columna coach_id a la tabla de alimentos
ALTER TABLE foods ADD COLUMN IF NOT EXISTS coach_id UUID REFERENCES coaches(id) ON DELETE CASCADE;

-- 2. Crear un índice para optimizar las búsquedas por coach
CREATE INDEX IF NOT EXISTS idx_foods_coach_id ON foods(coach_id);

-- 3. Habilitar RLS en la tabla foods (si no estaba habilitada)
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- 4. Política para que TODOS puedan ver alimentos globales (coach_id IS NULL)
CREATE POLICY "Anyone can view global foods" 
ON foods FOR SELECT 
USING (coach_id IS NULL);

-- 5. Política para que un COACH vea sus propios alimentos
CREATE POLICY "Coaches can view their own custom foods" 
ON foods FOR SELECT 
TO authenticated
USING (auth.uid() = coach_id);

-- 6. Política para que un COACH inserte sus propios alimentos
CREATE POLICY "Coaches can insert their own custom foods" 
ON foods FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = coach_id);

-- 7. Política para que un ALUMNO vea los alimentos de SU coach
CREATE POLICY "Clients can view their coach's custom foods" 
ON foods FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM clients 
    WHERE clients.id = auth.uid() 
    AND clients.coach_id = foods.coach_id
  )
);

-- Comentario: Hecho con éxito. Los alimentos globales siguen disponibles y los custom son privados por coach.
