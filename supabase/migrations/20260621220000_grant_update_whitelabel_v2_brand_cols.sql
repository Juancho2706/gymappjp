-- HOTFIX — white-label v2: GRANT UPDATE faltante en las columnas de marca nuevas.
-- La migracion 20260621150000_whitelabel_v2_brand_columns.sql agrego 7 columnas a coaches
-- (y 2 a teams) pero NO agrego el GRANT UPDATE(col) que exige el patron compra-only de
-- 20260612140000_modules_compra_only_grants.sql (coaches/teams: REVOKE UPDATE de tabla +
-- allowlist por columna). Consecuencia: cualquier PATCH user-scoped (web server action con
-- createClient() authenticated + mobile PostgREST con su JWT) que toque esas columnas muere
-- con 42501 "permission denied for table coaches" — y como el save de marca manda TODAS las
-- columnas en un solo UPDATE, falla el statement entero (incluido welcome_message, que SI
-- estaba granteado). Outage de "Creador de marca" web+mobile para todo coach Pro+.
--
-- Fix: aditivo, idempotente, forward-only (espejo feedback_no_supabase_branches). Un GRANT
-- es replay-safe (re-grantear una col ya granteada es no-op). NO toca datos, NO destructivo.
-- organizations YA tenia estos grants (verificado en prod 2026-06-21) -> no se incluye.

-- coaches: las 7 columnas nuevas de 20260621150000.
GRANT UPDATE (
  brand_secondary_color,
  accent_light,
  accent_dark,
  neutral_tint,
  logo_url_dark,
  brand_font_key,
  loader_variant
) ON public.coaches TO authenticated;

-- teams: solo las 2 nuevas (accent_light/accent_dark/neutral_tint/logo_url_dark ya estaban
-- en el allowlist de 20260612140000; brand_secondary_color y loader_variant son de 20260621150000).
GRANT UPDATE (
  brand_secondary_color,
  loader_variant
) ON public.teams TO authenticated;
