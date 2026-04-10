-- Migration: Add flexibility fields to workout_programs
-- Applied: 2026-04-07
-- Purpose: Allows coaches to define programs with exact day counts, async cycles,
--          flexible start dates, and global program notes.

ALTER TABLE workout_programs
    ADD COLUMN IF NOT EXISTS duration_type text DEFAULT 'weeks',
    ADD COLUMN IF NOT EXISTS duration_days integer,
    ADD COLUMN IF NOT EXISTS program_notes text,
    ADD COLUMN IF NOT EXISTS start_date_flexible boolean DEFAULT true;

-- Optional: constrain duration_type to known values
ALTER TABLE workout_programs
    DROP CONSTRAINT IF EXISTS workout_programs_duration_type_check;

ALTER TABLE workout_programs
    ADD CONSTRAINT workout_programs_duration_type_check
    CHECK (duration_type IN ('weeks', 'calendar_days', 'async'));
