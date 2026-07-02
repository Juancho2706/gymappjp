-- White-label W1/W3: temas preset + layout de login + loader compuesto.
-- ADITIVA, nullable, cero impacto en coaches existentes (NULL = comportamiento actual).
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS theme_preset_key text NULL;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS login_layout_key text NULL;
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS loader_config jsonb NULL;

-- Lección 42501 (whitelabel v2): toda columna user-editable exige GRANT UPDATE en la MISMA migración.
GRANT UPDATE (theme_preset_key, login_layout_key, loader_config) ON public.coaches TO authenticated;

-- Lección incidente login alumno (anon-grant): el proxy/login del alumno lee branding con anon.
GRANT SELECT (theme_preset_key, login_layout_key, loader_config) ON public.coaches TO anon;
GRANT SELECT (theme_preset_key, login_layout_key, loader_config) ON public.coaches TO authenticated;
