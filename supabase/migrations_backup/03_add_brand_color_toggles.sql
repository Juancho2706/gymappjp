-- Add brand color toggles to coaches table
ALTER TABLE public.coaches 
ADD COLUMN IF NOT EXISTS use_brand_colors BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_brand_colors_coach BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN public.coaches.use_brand_colors IS 'If true, the coach''s custom brand color will be used in the student app. If false, the default blue will be used.';
COMMENT ON COLUMN public.coaches.use_brand_colors_coach IS 'If true, the coach''s custom brand color will be used in their own dashboard. If false, the default blue will be used.';
