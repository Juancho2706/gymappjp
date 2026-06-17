-- Audit DB 2026-06-16/17: FUGA DE SEGURIDAD — coaches es world-readable (RLS qual=true para anon) y
-- anon tenía SELECT sobre las 45 columnas, incluyendo card_last4/card_brand/card_payment_method_id
-- (metadata de tarjeta), trial_used_email + registration_ip (PII), subscription_mp_id /
-- superseded_mp_preapproval_id (IDs MercadoPago), admin_notes y todo el billing. Confirmado en prod:
-- anon (deslogueado) leía las 29 coaches con 7 trial_used_email + 3 registration_ip expuestos.
--
-- FIX: restringir el SELECT de anon a SOLO columnas de branding/identidad (lo único que necesitan las
-- páginas públicas: proxy /c/[slug], api/splash, api/manifest, api/health). authenticated y service_role
-- quedan INTACTOS (45 cols) — la app del coach/alumno y los flujos de pago/registro (service-role) no
-- cambian. El override del CEO y la lógica de billing siguen igual.
--
-- Self-guarding: tras el REVOKE/GRANT, corre como anon las queries REALES de branding (si pierde una
-- columna necesaria -> 42501 -> RAISE -> rollback) y confirma que card_last4/registration_ip/
-- trial_used_email/subscription_mp_id quedan bloqueadas. Solo commitea si todo pasa. Idempotente.
DO $sec$
DECLARE blocked boolean;
BEGIN
  REVOKE SELECT ON public.coaches FROM anon;
  GRANT SELECT (
    id, slug, full_name, brand_name, primary_color, logo_url, created_at, updated_at,
    subscription_tier, use_brand_colors_coach, welcome_message, slug_changed_at, previous_slugs,
    welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version,
    welcome_modal_updated_at, loader_text, use_custom_loader, loader_text_color, loader_show_icon,
    loader_icon_mode, invite_code
  ) ON public.coaches TO anon;

  PERFORM set_config('request.jwt.claims','',true);
  SET LOCAL ROLE anon;

  -- (1) queries anon REALES deben seguir funcionando
  BEGIN
    EXECUTE 'SELECT id, brand_name, primary_color, logo_url, slug, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, subscription_tier FROM public.coaches WHERE slug = ''josefit'' LIMIT 1';
    EXECUTE 'SELECT id, brand_name, primary_color, logo_url, slug, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, subscription_tier FROM public.coaches WHERE invite_code = ''CRDZ9'' LIMIT 1';
    EXECUTE 'SELECT brand_name, primary_color, logo_url FROM public.coaches WHERE slug = ''josefit'' LIMIT 1';
    EXECUTE 'SELECT id, brand_name, logo_url, primary_color FROM public.coaches WHERE slug = ''josefit'' LIMIT 1';
    EXECUTE 'SELECT id FROM public.coaches LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE EXCEPTION 'ABORT: una query anon de branding perdió una columna necesaria -> %', SQLERRM;
  END;

  -- (2) columnas sensibles DEBEN quedar bloqueadas para anon
  blocked := false;
  BEGIN EXECUTE 'SELECT card_last4 FROM public.coaches LIMIT 1'; EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RESET ROLE; RAISE EXCEPTION 'ABORT: anon todavía puede leer card_last4'; END IF;
  blocked := false;
  BEGIN EXECUTE 'SELECT registration_ip FROM public.coaches LIMIT 1'; EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RESET ROLE; RAISE EXCEPTION 'ABORT: anon todavía puede leer registration_ip'; END IF;
  blocked := false;
  BEGIN EXECUTE 'SELECT trial_used_email FROM public.coaches LIMIT 1'; EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RESET ROLE; RAISE EXCEPTION 'ABORT: anon todavía puede leer trial_used_email'; END IF;
  blocked := false;
  BEGIN EXECUTE 'SELECT subscription_mp_id FROM public.coaches LIMIT 1'; EXCEPTION WHEN insufficient_privilege THEN blocked := true; END;
  IF NOT blocked THEN RESET ROLE; RAISE EXCEPTION 'ABORT: anon todavía puede leer subscription_mp_id'; END IF;

  RESET ROLE;
END $sec$;
