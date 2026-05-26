-- Allow enterprise clients to exist before they are assigned to a coach.
-- Standalone clients continue to use org_id IS NULL + coach_id IS NOT NULL.
ALTER TABLE public.clients
  ALTER COLUMN coach_id DROP NOT NULL;
