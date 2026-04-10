-- EMERGENCY MIGRATION: BRAND COLORS FIX
-- Run this if columns are missing despite migrations 03 and 04

-- 1. Ensure coaches table has use_brand_colors_coach
ALTER TABLE public.coaches 
ADD COLUMN IF NOT EXISTS use_brand_colors_coach BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.coaches.use_brand_colors_coach IS 'If true, the coach''s custom brand color will be used in their own dashboard. If false, the default blue will be used.';

-- 2. Ensure clients table has use_coach_brand_colors
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS use_coach_brand_colors BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.clients.use_coach_brand_colors IS 'If true, the student sees the coach''s brand color. If false, they see the default app blue color. Default is true.';

-- 3. Cleanup: remove the old global toggle if it exists
ALTER TABLE public.coaches
DROP COLUMN IF EXISTS use_brand_colors;
