-- Reconstruida el 2026-09-05 desde el estado de LIVE: la migración original se aplicó vía MCP el 2026-06-08 17:13:06 y nunca se versionó. Idempotente; la fila 20260608171306 ya existe en supabase_migrations.schema_migrations, por lo que db push NO la reejecuta.
--
-- Qué hacía: sacarle EXECUTE a `authenticated` sobre el RPC del panel admin
-- `get_admin_coaches_paginated` (SECURITY DEFINER: devuelve TODOS los coaches de la plataforma
-- con datos de suscripción). Las olas previas del 2026-06-08 ya le habían sacado anon
-- (20260608120150_revoke_anon_definer_read_rpcs.sql:24) y PUBLIC
-- (20260608120160_revoke_public_definer_read_rpcs.sql:22); faltaba authenticated.
--
-- Estado VIGENTE en LIVE al 2026-09-05 (pg_proc.proacl):
--   get_admin_coaches_paginated(text,text,text,boolean,text,text,integer,integer)
--     = postgres=X/postgres | service_role=X/postgres
--   → sin anon, sin authenticated, sin PUBLIC. ✔ coincide con lo que este archivo deja.
--
-- Cross-check: NO contradice a 20260826011239_admin_coaches_paginated_demo_client_count.sql:84-87,
-- que ordena después y repite exactamente el mismo cierre (REVOKE ALL de PUBLIC/anon/authenticated
-- + GRANT EXECUTE a service_role). Tampoco toca el CUERPO de la función: ese lo gobiernan las
-- migraciones locales 20260826010542 / 20260826011239 / 20260826022428 / 20260826042748.
--
-- Guardado por to_regprocedure: en un replay desde cero la función la crea el baseline, pero si
-- alguna vez no existiera, el REVOKE no debe tumbar el push.

DO $$
DECLARE
  v_fn regprocedure := to_regprocedure(
    'public.get_admin_coaches_paginated(text,text,text,boolean,text,text,integer,integer)'
  );
BEGIN
  IF v_fn IS NULL THEN
    RAISE NOTICE 'get_admin_coaches_paginated no existe todavia: REVOKE omitido';
    RETURN;
  END IF;

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
END
$$;
