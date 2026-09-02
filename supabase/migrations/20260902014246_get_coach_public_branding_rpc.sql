-- SEC-01 fase 1 (2026-09-02) — Lector público de branding de coach, de UNA fila, por slug-o-código.
--
-- POR QUÉ:
--   (1) Hoy `anon` tiene `GRANT SELECT (invite_code)` sobre `public.coaches` y la política
--       `coaches_select_anon` corre con `USING (true)`. Con la anon key (que viaja en el bundle de
--       la web y en el de la app) `GET /rest/v1/coaches?select=invite_code` devuelve las 91 filas:
--       enumeración completa de los códigos de invitación de todos los coaches. Es el pendiente que
--       dejó escrito `20260818214003_revoke_anon_coaches_pii.sql` («LA ENUMERACION SIGUE ABIERTA»).
--   (2) Revocar la columna a secas rompe producción: Postgres exige `SELECT` sobre la columna
--       también para FILTRAR por ella, así que cada `.eq('invite_code', …)` anónimo cae con 42501.
--       Hay 9 lecturas así (proxy `/c/<CÓDIGO>/**`, login del alumno, `/api/manifest`, `/api/splash`,
--       `/api/og`, `/api/pwa-screenshot` y la pantalla «ingresá tu código» de la app, que corre
--       PRE-LOGIN como `anon`).
--   (3) Esta función es el reemplazo: `SECURITY DEFINER`, devuelve UNA fila (o `null`) por
--       identificador. Mata la enumeración masiva sin quitarle a nadie el dato que ya conoce —
--       quien tiene el código, tiene el código. Con los 9 call sites migrados (fase 2) y la OTA
--       adoptada, la fase 3 revoca `select (invite_code)` a `anon`.
--
-- QUÉ DEVUELVE: exactamente las 31 columnas que `anon` puede leer HOY de `public.coaches`
-- (grant de `20260617033845_coaches_restrict_anon_select_to_branding.sql` menos la PII revocada por
-- `20260818214003_revoke_anon_coaches_pii.sql`; verificado contra `information_schema.column_privileges`
-- el 2026-09-02). Ni una columna de más: nada de billing, PII, `admin_notes` ni timestamps de cuenta.
--
-- REGLA DE MATCH: espeja la bifurcación que YA hacen los call sites — `coachIdentifierColumn()`
-- (`apps/web/src/lib/coach/invite-code.ts`, regex `^[A-Z2-9]{5}$`), el `INVITE_CODE_RE` del proxy
-- (`apps/web/src/proxy.ts`) y `parseCoachIdentifier()` (`packages/schemas/coach-identifier.ts`):
-- formato de código ⇒ `invite_code`; si no ⇒ `slug`. Es EXCLUYENTE, nunca prueba las dos columnas.
-- Si cambia el regex de un lado, hay que cambiar el otro.
--
-- Modelada sobre `get_org_branding` (`20260608220000_is_coach_active_org_member.sql`): misma forma
-- (jsonb, `stable`, `security definer`, `set search_path = public`, `revoke all` + `grant execute`).
-- Aditiva y reversible: no toca columnas, políticas, grants ni datos.

create or replace function public.get_coach_public_branding(p_identifier text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'slug', c.slug,
    'invite_code', c.invite_code,
    'brand_name', c.brand_name,
    'primary_color', c.primary_color,
    'logo_url', c.logo_url,
    'logo_url_dark', c.logo_url_dark,
    'welcome_message', c.welcome_message,
    'subscription_tier', c.subscription_tier,
    'instagram_handle', c.instagram_handle,
    'use_brand_colors_coach', c.use_brand_colors_coach,
    'brand_secondary_color', c.brand_secondary_color,
    'accent_light', c.accent_light,
    'accent_dark', c.accent_dark,
    'neutral_tint', c.neutral_tint,
    'brand_font_key', c.brand_font_key,
    'theme_preset_key', c.theme_preset_key,
    'login_layout_key', c.login_layout_key,
    'loader_variant', c.loader_variant,
    'loader_config', c.loader_config,
    'use_custom_loader', c.use_custom_loader,
    'loader_text', c.loader_text,
    'loader_text_color', c.loader_text_color,
    'loader_icon_mode', c.loader_icon_mode,
    'loader_show_icon', c.loader_show_icon,
    'executor_theme', c.executor_theme,
    'welcome_modal_enabled', c.welcome_modal_enabled,
    'welcome_modal_content', c.welcome_modal_content,
    'welcome_modal_type', c.welcome_modal_type,
    'welcome_modal_version', c.welcome_modal_version,
    'welcome_modal_updated_at', c.welcome_modal_updated_at
  )
  from public.coaches c
  where case
          when p_identifier ~ '^[A-Z2-9]{5}$' then c.invite_code = p_identifier
          else c.slug = p_identifier
        end
  limit 1;
$$;

comment on function public.get_coach_public_branding(text) is
  'SEC-01: branding público de UNA fila de coaches por slug-o-código de invitación. Reemplaza los SELECT anónimos directos a public.coaches para poder revocarle a anon el SELECT de invite_code.';

revoke all on function public.get_coach_public_branding(text) from public;
grant execute on function public.get_coach_public_branding(text) to anon, authenticated, service_role;

-- Rollback:
--   drop function if exists public.get_coach_public_branding(text);
