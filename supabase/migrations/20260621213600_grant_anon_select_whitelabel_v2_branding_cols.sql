-- White-label v2 (#37) agregó 7 columnas de branding a `coaches` que el proxy
-- (apps/web/src/proxy.ts, coachBrandingPromise) selecciona para pintar el login
-- pre-auth y el árbol /c/[coach_slug]/*. Esa lectura corre como rol `anon` cuando
-- el alumno NO tiene sesión (login page). `coaches` usa GRANTs de columna a nivel
-- de tabla para `anon` (no SELECT de tabla completa), así que toda columna nueva
-- exige un GRANT SELECT(col) explícito — el gotcha de CLAUDE.md ("42501 en runtime").
--
-- La migración v2 que creó estas columnas NO las granteó a `anon` → el SELECT del
-- proxy tiraba `42501 permission denied` → supabase-js devolvía {data:null} → el
-- proxy interpretaba "coach inexistente" y redirigía a /not-found. Resultado: el
-- login de alumnos (deslogueado) caía con 404 para TODOS los coaches. El alumno ya
-- autenticado no se veía afectado (rol `authenticated` tiene SELECT a nivel de tabla).
--
-- Fix: grantear SELECT de estas 7 columnas a `anon`. Son branding PÚBLICO (colores,
-- fuente, logo dark, variante de loader) que el login muestra por diseño — cero PII
-- ni billing. Las columnas sensibles (card_*, payment_provider, subscription_mp_id,
-- enabled_modules, registration_ip, etc.) siguen denegadas a `anon`.
--
-- Idempotente y forward-only: re-ejecutar GRANT es no-op. Ya aplicado en LIVE el
-- 2026-06-21 (incidente login alumnos); esta migración lo deja en el historial para
-- sobrevivir merge_branch/resets (que re-ejecutan todo el historial).

GRANT SELECT (
  brand_secondary_color,
  accent_light,
  accent_dark,
  neutral_tint,
  logo_url_dark,
  brand_font_key,
  loader_variant
) ON public.coaches TO anon;
