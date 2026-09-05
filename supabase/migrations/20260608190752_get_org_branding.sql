-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-08 19:07:52 y nunca se versionó. Idempotente; la fila 20260608190752 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: dejar `get_org_branding(uuid)` en su forma definitiva y ABRIRLA a `anon`.
--   El branding de la org lo lee el proxy /c y /e ANTES del login (hot path anon).
--
-- Estado VIGENTE en LIVE al 2026-09-05:
--   · Cuerpo: idéntico byte a byte (md5 del prosrc normalizado = 97ac3f86b17c1d3779c322aaf61962ef)
--     al del archivo local 20260608220000_is_coach_active_org_member.sql:49-74, que ordena DESPUÉS
--     de esta versión. El CREATE OR REPLACE de abajo es esa misma definición, copiada de LIVE.
--   · proconfig = {search_path=public}; STABLE; SECURITY DEFINER.
--   · proacl    = postgres=X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X/postgres
--
-- De dónde sale el grant a anon (evidencia por eliminación): el único archivo local que otorga
-- EXECUTE sobre get_org_branding es 20260608220000_is_coach_active_org_member.sql:77-78, y sólo
-- otorga a `authenticated`. El grant a `anon` que HOY está en LIVE no puede venir de otra local:
-- 20260805182248_revoke_anon_execute_writer_definer_fns.sql lo menciona sólo en un comentario
-- (:7) para dejarlo EXPLÍCITAMENTE fuera del revoke ("hot path anon del proxy /c y /e").
--
-- Cross-check de orden: en un replay, este archivo corre ANTES de 20260608220000, que hace
-- `REVOKE ALL ... FROM PUBLIC` — y PUBLIC no es `anon`, así que el grant a anon sobrevive.
-- Estado final del replay = estado de LIVE. ✔

CREATE OR REPLACE FUNCTION public.get_org_branding(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', o.name,
    'primary_color', o.primary_color,
    'logo_url', o.logo_url,
    'loader_text', o.loader_text,
    'use_custom_loader', o.use_custom_loader,
    'loader_text_color', o.loader_text_color,
    'loader_icon_mode', o.loader_icon_mode,
    'accent_light', o.accent_light,
    'accent_dark', o.accent_dark,
    'logo_url_dark', o.logo_url_dark,
    'neutral_tint', o.neutral_tint
  )
  FROM public.organizations o
  WHERE o.id = p_org_id
    AND (
      EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.org_id = o.id AND m.user_id = auth.uid()
          AND m.status = 'active' AND m.deleted_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = auth.uid() AND c.org_id = o.id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_org_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_branding(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_branding(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_branding(uuid) TO service_role;
