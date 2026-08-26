-- The coach builder supports custom cycles from 1 to 14 days on web and mobile.
-- The baseline still capped workout_plans.day_of_week at 7 and left
-- workout_programs.cycle_length unconstrained, so days 8-14 failed at persistence
-- time while larger invalid cycle lengths could enter through non-UI clients.
-- This is forward-only constraint alignment; valid existing programs are unchanged.

ALTER TABLE public.workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_day_of_week_check;

ALTER TABLE public.workout_plans
  ADD CONSTRAINT workout_plans_day_of_week_check
  CHECK (day_of_week BETWEEN 1 AND 14)
  NOT VALID;

ALTER TABLE public.workout_plans
  VALIDATE CONSTRAINT workout_plans_day_of_week_check;

ALTER TABLE public.workout_programs
  DROP CONSTRAINT IF EXISTS workout_programs_cycle_length_check;

ALTER TABLE public.workout_programs
  ADD CONSTRAINT workout_programs_cycle_length_check
  CHECK (cycle_length IS NULL OR cycle_length BETWEEN 1 AND 14)
  NOT VALID;

ALTER TABLE public.workout_programs
  VALIDATE CONSTRAINT workout_programs_cycle_length_check;
