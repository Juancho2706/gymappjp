-- =============================================================================
-- Compra-only de modulos + proteccion de columnas de billing (plan estrategia 03, F2.1).
-- Aditiva / idempotente / replay-safe: REVOKE/GRANT/DROP POLICY IF EXISTS y CREATE OR
-- REPLACE re-ejecutan limpio cuando el merge del branch efimero re-aplica TODO el historial.
--
-- REGLA DE MANTENIMIENTO (OBLIGATORIA): toda columna NUEVA de public.coaches o public.teams
-- que el usuario deba editar user-scoped (web server actions / mobile PostgREST con su JWT)
-- REQUIERE un GRANT UPDATE(<col>) en la MISMA migracion que la crea. Default-deny: una
-- columna sin GRANT explicito queda protegida (solo service-role la escribe). Si se agrega
-- una columna user-editable y NO se grantea, el escritor falla en runtime con 42501.
--
-- ⚠️ NO APLICAR AHORA. Esta migracion NO se aplica con apply_migration/db push/execute_sql.
--    Se ejecuta SOLO en el branch efimero del gate Movida (protocolo Director §3:
--    crear branch -> validar -> merge en verde -> borrar branch el MISMO dia), y SOLO una
--    vez que el codigo de F1 este desplegado en master/prod (si no, el checkout standalone
--    muere con 42501 al instante del merge_branch). Tras el merge: `npx supabase db pull` +
--    regenerar database.types.ts (los grants no cambian tipos, pero el protocolo lo exige
--    para detectar drift).
-- =============================================================================

-- ===== coaches ===============================================================
-- Default de Supabase = GRANT a nivel de TABLA. Un REVOKE UPDATE(col) sobre ese grant de
-- tabla seria un NO-OP; el patron correcto es revocar a nivel tabla y re-grantear por columna.
REVOKE INSERT, UPDATE, DELETE ON public.coaches FROM authenticated, anon;
GRANT UPDATE (
  full_name,
  brand_name,
  primary_color,
  use_brand_colors_coach,
  logo_url,
  welcome_message,
  loader_text,
  use_custom_loader,
  loader_text_color,
  loader_icon_mode,
  welcome_modal_enabled,
  welcome_modal_content,
  welcome_modal_type,
  welcome_modal_version,
  welcome_modal_updated_at,
  onboarding_guide,
  invite_code,           -- set-once a nivel DB lo impone el trigger de abajo, NO el grant
  updated_at
) ON public.coaches TO authenticated;

-- Policy legacy duplicada (USING-only, redundante con coaches_update_own; baseline:2576).
DROP POLICY IF EXISTS "Coach can update their own profile" ON public.coaches;

-- INSERT/DELETE own: cierran la via de auto-crear una fila coach con tier/modulos arbitrarios.
-- Auditoria 2026-06-11: TODOS los INSERT reales de coaches son service-role (signup/admin).
-- Drop RATIFICADO por el dueno 2026-06-11. Rollback = recrear las policies del baseline.
DROP POLICY IF EXISTS "coaches_insert_own" ON public.coaches;
DROP POLICY IF EXISTS "coaches_delete_own" ON public.coaches;

-- Quedan SOLO service-role en coaches: enabled_modules, subscription_tier, subscription_status,
-- max_clients, billing_cycle, current_period_end, subscription_mp_id, trial_*, payment_provider,
-- admin_notes, active_org_id, slug, etc. (cualquier columna NO listada arriba).

-- ===== teams =================================================================
REVOKE INSERT, UPDATE, DELETE ON public.teams FROM authenticated, anon;
-- OJO: public.teams NO tiene columna updated_at (verificado contra 20260609050855_team_foundation
-- + 20260610000000_team_brand_full + database.types.ts). Incluirla aqui haria FALLAR la migracion
-- con "column updated_at does not exist". invite_code de teams NO va en el grant: es service-role
-- (backfill de 20260610010000), solo coaches expone invite_code user-scoped.
GRANT UPDATE (
  name,
  primary_color,
  accent_light,
  accent_dark,
  splash_bg_color,
  loader_text,
  loader_text_color,
  loader_icon_mode,
  use_custom_loader,
  neutral_tint,
  logo_url,
  logo_url_dark
) ON public.teams TO authenticated;

-- Quedan SOLO service-role en teams: enabled_modules, seat_limit, owner_coach_id, suspended_at,
-- slug, invite_code, deleted_at, created_at, id (cualquier columna NO listada arriba).

-- ===== teams_guard_owner_fields endurecido (mejora aprobada 2026-06-11 — segunda capa) =======
-- CREATE OR REPLACE de la funcion de 20260609050855_team_foundation.sql:116-129. Cambio minimo:
-- el cambio de seat_limit pasa a estar bloqueado para TODO caller authenticated (INCLUIDO el
-- owner) — antes solo se bloqueaba para no-owners. service-role queda exento. Red de seguridad si
-- un GRANT futuro re-expone seat_limit (defensa en profundidad sobre el grant de columna).
-- La rama de owner_coach_id queda INTACTA: transfer_team_ownership (SECURITY DEFINER,
-- 20260609220000:44) sigue siendo el unico camino para cambiar el owner. El trigger ya esta
-- creado por la migracion de fundacion; aqui solo redefinimos el cuerpo de la funcion.
CREATE OR REPLACE FUNCTION public.teams_guard_owner_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- seat_limit: bloqueado para TODO authenticated (incluido el owner). Lo fija el CEO via /admin.
  IF NEW.seat_limit IS DISTINCT FROM OLD.seat_limit THEN
    RAISE EXCEPTION 'seat_limit solo lo cambia el operador (service-role); ni el owner del team puede modificarlo';
  END IF;
  -- owner_coach_id: rama INTACTA — solo el owner (via transfer_team_ownership SECURITY DEFINER).
  IF NEW.owner_coach_id IS DISTINCT FROM OLD.owner_coach_id AND auth.uid() <> OLD.owner_coach_id THEN
    RAISE EXCEPTION 'solo el owner del team puede cambiar owner_coach_id';
  END IF;
  RETURN NEW;
END;
$$;

-- ===== invite_code set-once a nivel DB en coaches (mejora aprobada 2026-06-11) ===============
-- Memoria project-coach-code-identity: el codigo es el identificador PRIMARIO del coach, jamas
-- debe mutar self-service. invite_code PERMANECE en el GRANT de columnas de coaches; el set-once
-- lo impone ESTE trigger, no el grant (el grant solo permite que el backfill legacy lo escriba).
--
-- coaches.invite_code es NOT NULL (20260517130008): el generador lo llena en INSERT. El backfill
-- legacy (app/coach/_data/public-code.queries.ts:32-40) reescribe el codigo cuando el actual es
-- "invalido" (vacio/whitespace) -> ese unico salto (sin-codigo-valido -> valor valido) debe seguir
-- pasando. Cambiar un valor YA valido a OTRO valor distinto -> RAISE EXCEPTION. service-role exento
-- (admin/operador puede corregir un codigo). Idempotente: CREATE OR REPLACE + DROP/CREATE TRIGGER.
CREATE OR REPLACE FUNCTION public.coaches_invite_code_set_once()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.role()) = 'service_role' OR auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Sin cambio efectivo -> no-op (permite UPDATE de otras columnas que no tocan invite_code).
  IF NEW.invite_code IS NOT DISTINCT FROM OLD.invite_code THEN RETURN NEW; END IF;
  -- OLD "no valido" (NULL o vacio/whitespace) -> set inicial / backfill legacy: PERMITIDO.
  IF OLD.invite_code IS NULL OR btrim(OLD.invite_code) = '' THEN RETURN NEW; END IF;
  -- OLD ya valido y NEW distinto -> mutacion self-service prohibida.
  RAISE EXCEPTION 'invite_code es set-once: un coach no puede cambiar su codigo publico (identificador primario)';
END;
$$;
DROP TRIGGER IF EXISTS coaches_invite_code_set_once ON public.coaches;
CREATE TRIGGER coaches_invite_code_set_once
  BEFORE UPDATE OF invite_code ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.coaches_invite_code_set_once();

-- ===== Clawback de modulos auto-activados (CINTURON — agregado 2026-06-12) ===================
-- El REVOKE/GRANT cierra la auto-activacion A FUTURO, pero NO resetea lo ya activado por el hueco
-- mientras estuvo abierto (la RLS permitia que un coach se auto-activara enabled_modules gratis;
-- el hueco vive hasta que ESTA migracion despliegue). Reset idempotente a '{}' de todo coach/team
-- REAL, EXCLUYENDO las cuentas de prueba permanentes (personas @evatest.cl — en especial
-- e2e-modules-coach@evatest.cl, que DEBE quedar con los 4 modulos ON — y los teams de prueba).
-- Mismo criterio de exclusion que los purges (memoria de cuentas de prueba permanentes).
-- Verificado en prod 2026-06-12: 26/27 coaches reales ya estan en '{}' y los teams con modulos
-- son de test => este UPDATE es DEFENSA (cierra la ventana), no una migracion de datos masiva.
-- Idempotente: el WHERE enabled_modules <> '{}' hace que un re-run no toque filas ya vacias.

-- coaches: excluir los coaches de prueba (join a auth.users por email LIKE '%@evatest.cl').
UPDATE public.coaches SET enabled_modules = '{}'::jsonb
WHERE enabled_modules <> '{}'::jsonb
  AND id NOT IN (
    SELECT c.id FROM public.coaches c
    JOIN auth.users u ON u.id = c.id
    WHERE u.email LIKE '%@evatest.cl'
  );

-- teams: mismo reset excluyendo los teams de prueba. La lista exacta de exclusion se DERIVA AL
-- SELLAR el .sql (antes del branch efimero del gate). Criterio (mismo que los purges):
--   (a) teams cuyo owner_coach_id es una cuenta @evatest.cl, Y
--   (b) teams seed E2E por slug (p.ej. 'e2e-pool-vortex'; ver tests/separation/personas.ts SLUGS.team)
--       + el/los team(s) "Movida (test)" creados en la pasada manual del gate (slugs/ids al sellar).
-- Si al sellar aparecen mas teams de prueba, AGREGAR sus slugs/ids aqui antes de ejecutar.
UPDATE public.teams SET enabled_modules = '{}'::jsonb
WHERE enabled_modules <> '{}'::jsonb
  AND id NOT IN (
    -- (a) teams cuyo owner es una cuenta de prueba
    SELECT t.id FROM public.teams t
    JOIN public.coaches c ON c.id = t.owner_coach_id
    JOIN auth.users u ON u.id = c.id
    WHERE u.email LIKE '%@evatest.cl'
  )
  AND slug NOT IN (
    -- (b) slugs de teams de prueba conocidos (DERIVAR/COMPLETAR al sellar el .sql)
    'e2e-pool-vortex'
  );
