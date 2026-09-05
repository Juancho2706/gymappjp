-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-19 00:10:30 y nunca se versionó. Idempotente; la fila 20260619001030 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: crear el scaffolding `public.coach_nutrition_prefs` y `public.client_nutrition_prefs`
-- (preferencias de secciones del módulo de nutrición, específicas por dominio).
--
-- ⚠️ Ese scaffolding YA NO EXISTE. Lo reemplazó, 1h16m después, la versión remota 20260619020611
-- `feature_prefs` (= archivo local 20260618200000_feature_prefs.sql) por el modelo genérico
-- coach_feature_prefs / team_feature_prefs / client_feature_prefs con columna `domain`.
--
-- Evidencia (archivo local 20260618200000_feature_prefs.sql):
--   :10  «DROP de scaffolding nutrition_prefs (verificado 0 filas).»
--   :12  DROP TABLE IF EXISTS public.coach_nutrition_prefs;   -- scaffolding vacio (0 filas verificadas)
--   :13  DROP TABLE IF EXISTS public.client_nutrition_prefs;
--
-- Estado VIGENTE en LIVE al 2026-09-05:
--   to_regclass('public.coach_nutrition_prefs')  = NULL
--   to_regclass('public.client_nutrition_prefs') = NULL
--   to_regclass('public.nutrition_prefs')        = NULL
--   Existen en su lugar: coach_feature_prefs, team_feature_prefs, client_feature_prefs
--   (columnas coach_id/team_id/client_id, domain, preset*, sections jsonb DEFAULT '{}', updated_at).
--
-- ⚠️ Gotcha de ORDEN — por eso este archivo NO recrea las tablas: los timestamps locales están
-- invertidos respecto de los remotos. El archivo que DROPEA (20260618200000) ordena ANTES que este
-- (20260619001030). Si acá se hiciera el CREATE, un replay desde cero dejaría el scaffolding VIVO
-- y el esquema local dejaría de coincidir con LIVE. La única reconstrucción fiel del estado
-- vigente es afirmar la AUSENCIA, de forma idempotente.

DROP TABLE IF EXISTS public.coach_nutrition_prefs;
DROP TABLE IF EXISTS public.client_nutrition_prefs;
