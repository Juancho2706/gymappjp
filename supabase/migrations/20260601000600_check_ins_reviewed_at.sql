-- Add reviewed_at + reviewed_by to check_ins for coach response-time tracking.
-- reviewed_at NULL = not yet reviewed by coach.
-- Enables org-level "response time" metric (diferenciador: coaching personalizado).

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_check_ins_reviewed_at ON check_ins (reviewed_at);
