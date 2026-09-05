-- ============================================================================
-- SEC-01 fase 3 — cerrar la enumeración anónima de coaches.invite_code
-- (docs/operations/MANUAL_TASKS.md § SEC-01). Aplicada en LIVE el 2026-09-05.
-- ----------------------------------------------------------------------------
-- Gate de la fase (verificado 2026-09-05 con los logs de PostgREST, rol del JWT de
-- Authorization, ventanas diarias 2026-08-29 → 2026-09-05): las lecturas de invite_code
-- bajo rol anon se cortaron el 2026-09-02 01:37:07Z (tren fase 2: los 9 call sites pasaron
-- al RPC get_coach_public_branding) y llevan 3 días en cero. Lado nativo: 100 % de los
-- eventos en app 1.1.2 con el OTA del 04-09 (PostHog, 7 días).
--
-- Estado en LIVE antes (verificado en transacción con ROLLBACK):
--   has_column_privilege('anon','public.coaches','invite_code','SELECT') = true
--   generate_invite_code()        acl {=X/postgres, anon=X, authenticated=X, service_role=X}
--   generate_unique_invite_code() acl {=X/postgres, anon=X, authenticated=X, service_role=X}
--
-- Qué se cierra:
--   1. anon deja de poder SELECT (y por lo tanto FILTRAR) por invite_code sobre coaches.
--      El login por código, el proxy /c/<CÓDIGO>/**, manifest/splash/og y la pantalla de
--      código de RN ya resuelven por el RPC SECURITY DEFINER get_coach_public_branding(text)
--      (fase 1/2). Probado como anon en la misma transacción: branding por código y por
--      slug siguen respondiendo; las demás columnas de coaches siguen visibles.
--   2. generate_invite_code() (función de TRIGGER BEFORE INSERT en coaches) y
--      generate_unique_invite_code() (la llama solo el admin con service_role en
--      org.actions.ts) pierden EXECUTE para PUBLIC, anon y authenticated. Postgres no
--      exige EXECUTE al rol que dispara un trigger (validado hoy con el REVOKE de
--      coaches_invite_code_set_once, migración 20260905171020), así que el alta de coaches
--      no cambia.
--
-- Verificación post-aplicación (a mano): con la anon key,
--   GET /rest/v1/coaches?select=invite_code  ⇒ 42501
--   GET /c/<slug>/login                        ⇒ 200
--
-- ROLLBACK:
--   grant select (invite_code) on public.coaches to anon;
--   grant execute on function public.generate_invite_code(), public.generate_unique_invite_code()
--     to public, anon, authenticated;
-- ============================================================================

revoke select (invite_code) on public.coaches from anon;

revoke execute on function public.generate_invite_code()
  from public, anon, authenticated;

revoke execute on function public.generate_unique_invite_code()
  from public, anon, authenticated;

comment on function public.generate_unique_invite_code() is
  'Genera un invite_code único (coaches/orgs/teams). Solo service_role y postgres: SEC-01 fase 3 (2026-09-05) le sacó EXECUTE a PUBLIC/anon/authenticated; el único llamador es el admin en org.actions.ts.';
