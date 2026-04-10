-- Add preference toggle to clients table for brand colors
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS use_coach_brand_colors BOOLEAN DEFAULT true;

-- Remove the global use_brand_colors from coaches as it's now client-specific
ALTER TABLE public.coaches
DROP COLUMN IF EXISTS use_brand_colors;

COMMENT ON COLUMN public.clients.use_coach_brand_colors IS 'If true, the student sees the coach''s brand color. If false, they see the default app blue color. Default is true.';
