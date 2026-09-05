-- ============================================================================
-- SEC — advisor `anon_security_definer_function_executable`: sacar de anon /
-- authenticated / PUBLIC las dos funciones de TRIGGER que quedaron ejecutables.
-- ----------------------------------------------------------------------------
-- Estado en LIVE antes de esta migracion (verificado 2026-09-05 via pg_proc.proacl):
--   public.coaches_invite_code_set_once()  acl = {=X/postgres, postgres=X/postgres,
--                                                 authenticated=X/postgres,
--                                                 service_role=X/postgres}
--   public.sync_coach_enabled_modules()    acl = idem
--   El `=X/postgres` es el GRANT a PUBLIC; de ahi anon hereda EXECUTE. Ambas son
--   SECURITY DEFINER con `search_path=public` y owner postgres.
--
-- Triggers que las usan (pg_trigger, no internos):
--   · coaches_invite_code_set_once  BEFORE UPDATE OF invite_code ON public.coaches
--       FOR EACH ROW EXECUTE FUNCTION coaches_invite_code_set_once()
--   · trg_coach_addons_sync         AFTER INSERT OR DELETE OR UPDATE ON public.coach_addons
--       FOR EACH ROW EXECUTE FUNCTION sync_coach_enabled_modules()
--
-- POR QUE ES SEGURO (y por que el advisor igual tiene razon):
--   PostgreSQL verifica el privilegio EXECUTE sobre la funcion de un trigger UNA sola
--   vez, al CREAR el trigger, no en cada disparo. Una vez creado, el trigger corre con
--   los permisos del creador y el rol que hace el INSERT/UPDATE nunca necesita EXECUTE.
--   Verificado en PROD dentro de una transaccion con ROLLBACK (2026-09-05):
--     BEGIN;
--       REVOKE EXECUTE ON FUNCTION public.coaches_invite_code_set_once() FROM PUBLIC, anon, authenticated;
--       -- has_function_privilege(anon|authenticated|public, ...) => false
--       SET LOCAL ROLE authenticated;
--       SET LOCAL request.jwt.claims TO '{"sub":"<coach uuid>","role":"authenticated"}';
--       UPDATE public.coaches SET invite_code = invite_code WHERE id = '<coach uuid>';  -- 1 fila
--     ROLLBACK;
--   El UPDATE paso igual: el trigger disparo SIN EXECUTE en el rol authenticated.
--   Mismo resultado para trg_coach_addons_sync (ahi el UPDATE se probo con rol postgres
--   porque authenticated/anon no tienen ni siquiera UPDATE de tabla sobre
--   public.coach_addons: has_table_privilege(...,'UPDATE') = false para ambos).
--
--   Lo que el REVOKE SI cierra es la llamada DIRECTA: hoy un cliente con la anon key
--   podria hacer `select public.sync_coach_enabled_modules()` por PostgREST y forzar el
--   recalculo de `coaches.enabled_modules` de un coach arbitrario, porque la funcion es
--   SECURITY DEFINER (owner postgres) y hace UPDATE sobre public.coaches sin chequear
--   quien llama. Eso es lo que el advisor marca y lo que aca se corta.
--
-- Se conservan service_role y postgres: los flujos de billing/addons corren por
-- service_role, y postgres es el owner (recrea los triggers en migraciones futuras;
-- si perdiera EXECUTE, un `CREATE TRIGGER` posterior fallaria).
--
-- ROLLBACK: `grant execute on function public.coaches_invite_code_set_once() to public;`
--           `grant execute on function public.sync_coach_enabled_modules() to public;`
--           (y lo mismo a authenticated si se quiere volver al ACL exacto de hoy).
-- ============================================================================

revoke execute on function public.coaches_invite_code_set_once()
  from public, anon, authenticated;

revoke execute on function public.sync_coach_enabled_modules()
  from public, anon, authenticated;

comment on function public.coaches_invite_code_set_once() is
  'Trigger BEFORE UPDATE OF invite_code en public.coaches: invite_code es set-once. Sin EXECUTE para anon/authenticated/PUBLIC (el trigger no lo necesita: Postgres valida EXECUTE al crear el trigger, no al dispararlo).';

comment on function public.sync_coach_enabled_modules() is
  'Trigger AFTER I/U/D en public.coach_addons: recalcula coaches.enabled_modules. Sin EXECUTE para anon/authenticated/PUBLIC (el trigger no lo necesita y la llamada directa por PostgREST era el hueco: SECURITY DEFINER que escribe public.coaches).';
