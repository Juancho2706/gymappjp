-- F17: minor security-advisor cleanups.
-- 1) Pin search_path on public.try_uuid (function_search_path_mutable WARN). It only
--    casts text->uuid, so an empty search_path is safe.
-- Rollback: ALTER FUNCTION public.try_uuid(text) RESET search_path;
ALTER FUNCTION public.try_uuid(text) SET search_path = '';

-- NOTE (manual / not SQL): the following advisor items are intentionally NOT changed here:
--  - Leaked-password protection (HaveIBeenPwned) is an Auth dashboard toggle — enable in
--    Supabase Auth settings (no migration possible).
--  - Extensions unaccent / pg_trgm live in `public` (extension_in_public WARN). Moving them
--    is risky for existing indexes/queries; deferred as low priority.
--  - RLS-enabled-no-policy tables (exercises_backup_20260405, beta_invite_registrations,
--    personal_gastos) are backup/unused; effectively locked. Drop/triage separately.
