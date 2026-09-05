-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-08 18:32:37 y nunca se versionó. Idempotente; la fila 20260608183237 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: agregar el flag de corte del área del alumno enterprise sobre `organizations`.
--
-- Estado VIGENTE en LIVE al 2026-09-05 (information_schema.columns):
--   organizations.alumno_area_migrated_at  timestamp with time zone  NULL  (sin default, sin comment)
--   Filas: 1 organización, 0 con el flag seteado (SELECT count(*), count(alumno_area_migrated_at)).
--
-- Por qué esta reconstrucción SÍ hace falta (no es cosmética): el archivo local
-- 20260608230000_enterprise_alumno_context.sql:37 LEE `o.alumno_area_migrated_at` y ordena
-- DESPUÉS de esta versión. Sin este ADD COLUMN, un replay del historial desde cero rompe ahí.
-- Ninguna otra migración local crea la columna (grep en supabase/migrations: 0 hits).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS alumno_area_migrated_at timestamptz;
