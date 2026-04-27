-- Phase 3: admin_notes column on coaches
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS admin_notes text;
COMMENT ON COLUMN public.coaches.admin_notes IS 'Internal admin notes — not visible to coach';
