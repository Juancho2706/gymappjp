-- Program phases (metadata), day sections, template lineage & per-block overrides
-- Run in Supabase SQL editor or via `supabase db push` if you use the CLI.

ALTER TABLE workout_programs
  ADD COLUMN IF NOT EXISTS program_phases jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE workout_programs
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES workout_programs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workout_programs_source_template_id
  ON workout_programs (source_template_id);

ALTER TABLE workout_blocks
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'main';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workout_blocks_section_check'
  ) THEN
    ALTER TABLE workout_blocks
      ADD CONSTRAINT workout_blocks_section_check
      CHECK (section IN ('warmup', 'main', 'cooldown'));
  END IF;
END $$;

ALTER TABLE workout_blocks
  ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workout_programs.program_phases IS 'JSON array: [{name, weeks, color}] — visual macrocycle metadata';
COMMENT ON COLUMN workout_programs.source_template_id IS 'Template this client program was assigned from; used for sync';
COMMENT ON COLUMN workout_blocks.section IS 'warmup | main | cooldown — grouping within a day';
COMMENT ON COLUMN workout_blocks.is_override IS 'If true, block is skipped when syncing from source_template';
