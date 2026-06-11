-- E (awareness v1): quién editó por última vez el contenido crítico del pool.
-- Aditivo/idempotente. Se setea EN CÓDIGO en los save-paths (workout.service corre con
-- service-role => un trigger con auth.uid() sería NULL; decisión del director: service/action).
-- workout_plans NO la lleva: el builder borra y recrea los plans en cada save.
ALTER TABLE public.workout_programs ADD COLUMN IF NOT EXISTS last_edited_by_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;
ALTER TABLE public.nutrition_plans  ADD COLUMN IF NOT EXISTS last_edited_by_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

-- Backfill: el mejor proxy del último editor hoy es el autor/dueño.
UPDATE public.workout_programs SET last_edited_by_coach_id = COALESCE(created_by_coach_id, coach_id)
WHERE last_edited_by_coach_id IS NULL AND COALESCE(created_by_coach_id, coach_id) IS NOT NULL;
UPDATE public.nutrition_plans SET last_edited_by_coach_id = coach_id
WHERE last_edited_by_coach_id IS NULL AND coach_id IS NOT NULL;
