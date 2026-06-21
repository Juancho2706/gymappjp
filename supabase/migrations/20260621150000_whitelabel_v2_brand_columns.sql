-- White-label v2 — columnas de marca (decisión CEO 2026-06-21).
-- Aditivo, zero-regression: todas nullable o con DEFAULT. NULL accent ⇒ resolveBrandTheme cae a brandColor.
-- El gate de estos campos (branding = Pro+ ENTERO) vive en el server action (isBrandingAllowed),
-- NO en RLS: coaches_update_own ya cubre el self-update y RLS no ve el tier barato.
-- IF NOT EXISTS = idempotente / forward-only (espejo de feedback_no_supabase_branches).

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS brand_secondary_color text NULL,
  ADD COLUMN IF NOT EXISTS accent_light text NULL,
  ADD COLUMN IF NOT EXISTS accent_dark text NULL,
  ADD COLUMN IF NOT EXISTS neutral_tint boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url_dark text NULL,
  ADD COLUMN IF NOT EXISTS brand_font_key text NULL,
  ADD COLUMN IF NOT EXISTS loader_variant text NOT NULL DEFAULT 'eva';

-- Paridad: que el selector de color2/loader funcione también en team y org (marca del team/org).
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS brand_secondary_color text NULL,
  ADD COLUMN IF NOT EXISTS loader_variant text NOT NULL DEFAULT 'eva';

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_secondary_color text NULL,
  ADD COLUMN IF NOT EXISTS loader_variant text NOT NULL DEFAULT 'eva';
