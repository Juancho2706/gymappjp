-- Add configurable default coach capacity to organizations.
-- Replaces the hardcoded TARGET_CLIENTS_PER_COACH = 25 in the app.
-- Defaults to 25 to preserve current behavior.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS default_coach_capacity integer NOT NULL DEFAULT 25
  CHECK (default_coach_capacity BETWEEN 1 AND 500);
