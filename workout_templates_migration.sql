-- Migration to allow workout programs to be templates (client_id NULL)
ALTER TABLE workout_programs ALTER COLUMN client_id DROP NOT NULL;

-- Also allow workout plans to have NULL client_id and assigned_date if they belong to a template program
ALTER TABLE workout_plans ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE workout_plans ALTER COLUMN assigned_date DROP NOT NULL;

-- Update RLS policies to allow coaches to manage their templates (where client_id is NULL)
-- (Assuming existing policies might be tied to client_id)

-- Let's check existing policies if possible, but usually coaches have access to everything where coach_id = auth.uid()
