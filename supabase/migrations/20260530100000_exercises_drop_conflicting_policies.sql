-- Remove old conflicting exercises RLS policies.
-- These permissive SELECT policies with qual=true or broad coach_id IS NULL
-- override the workspace-scoped policies added in 20260527120100.
-- In Postgres RLS, PERMISSIVE policies are OR-ed: one passing policy grants access.
-- Must keep only: exercises_select_visible, exercises_org_select (SELECT)
-- and exercises_{insert,update,delete}_own + exercises_org_{insert,update,delete} (mutations).

-- Broad SELECT policies that bypass isolation
DROP POLICY IF EXISTS "Anyone can read global or coach exercises" ON public.exercises;
DROP POLICY IF EXISTS "Todos pueden ver ejercicios" ON public.exercises;
DROP POLICY IF EXISTS "exercises_read" ON public.exercises;
DROP POLICY IF EXISTS "read_global_exercises" ON public.exercises;
DROP POLICY IF EXISTS "clients_read_coach_exercises" ON public.exercises;

-- Old catch-all mutation policies that bypass org isolation
DROP POLICY IF EXISTS "coaches_manage_exercises" ON public.exercises;
DROP POLICY IF EXISTS "exercises_write_own" ON public.exercises;
DROP POLICY IF EXISTS "Coach can delete their own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coach can insert their own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coach can update their own exercises" ON public.exercises;
DROP POLICY IF EXISTS "Coaches pueden borrar sus ejercicios" ON public.exercises;
DROP POLICY IF EXISTS "Coaches pueden crear ejercicios" ON public.exercises;
DROP POLICY IF EXISTS "Coaches pueden editar sus ejercicios" ON public.exercises;
