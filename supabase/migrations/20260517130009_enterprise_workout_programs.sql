-- Programas creados dentro de org (si coach sale, quedan accesibles al admin)
ALTER TABLE workout_programs ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE workout_programs ADD COLUMN IF NOT EXISTS created_by_coach_id uuid REFERENCES coaches(id);
