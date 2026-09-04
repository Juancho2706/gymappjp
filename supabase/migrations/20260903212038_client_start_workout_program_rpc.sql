-- supabase/migrations/20260903212038_client_start_workout_program_rpc.sql
--
-- "Empezar hoy" (D3 / OUTLINE R2 y §3.2): el ALUMNO fija el start_date de su programa flexible.
-- Pieza 2 del tren "Ciclo real y por lado" (docs/specs/ciclo-real-y-por-lado/DATA-SECURITY.md §2).
--
-- POR QUE RPC. El alumno solo tiene SELECT sobre workout_programs (baseline:3373); la unica policy
-- de escritura es la del coach (20260609180000:30-42) y el archive gate es RESTRICTIVE
-- (20260801023414:307). Abrir un UPDATE al alumno le daria is_active/coach_id/weeks_to_repeat.
-- SECURITY DEFINER + guards internos, mismo criterio que 20260813040921_coach_food_last_qty_remember.
--
-- CONTRATO (R23)
--   client_start_workout_program(p_program_id uuid, p_start_date date DEFAULT NULL)
--     RETURNS TABLE (start_date date, end_date date, started boolean)
--   - `started` = true SOLO cuando ESTA llamada escribio la fecha. Es la traza que faltaba: el
--     evento PostHog program_started_by_client (OUTLINE §9) se emite unicamente con started = true,
--     asi que el auto-start de cada serie no lo cuenta doble.
--   - Solo el alumno DUENO del programa. El guard es EXACTAMENTE el predicado de la policy INSERT
--     del alumno sobre workout_logs (R40). Verificado en LIVE (pg_policies, 2026-09-03):
--     `workout_logs_client` es PERMISSIVE FOR ALL a `authenticated` con
--     qual = with_check = `client_id = (SELECT auth.uid())`, sin client_memberships ni
--     student_readable_client_ids; la capa restrictiva del INSERT es
--     `student_write_gate_ins_workout_logs` = `client_id <> auth.uid() OR
--     private.student_write_allowed(client_id)`. Esta RPC replica las dos. La otra policy permisiva
--     de la tabla, `team_workout_logs_member_all` (current_user_pool_client_ids()), es la del POOL
--     DEL COACH, no la del alumno: no entra al guard. Nunca el coach, nunca service_role
--     (auth.uid() IS NULL => 'unauthenticated'): el coach fija la fecha desde el builder.
--   - Solo programas is_active = true y start_date_flexible = true.
--   - GATE DE ESCRITURA DEL ALUMNO: private.student_write_allowed(auth.uid()). Toda RPC DEFINER de
--     escritura del alumno lo lleva (20260718120000:101-126 la define; :290 y :496 son el patron, e
--     idem 20260718140000:184,397). Sin el, esta RPC seria la unica escritura del alumno que se
--     salta el gate: SECURITY DEFINER saltea RLS (la funcion es owned by postgres, BYPASSRLS, y por
--     eso las policies RESTRICTIVAS de 20260718120000:148-208 no la alcanzan) y el trigger
--     workout_programs_archived_client_guard solo dispara en INSERT OR UPDATE OF client_id,
--     is_active (verificado en LIVE con pg_get_triggerdef), nunca en un UPDATE de start_date.
--   - IDEMPOTENTE (R28): si el programa YA tiene start_date, devuelve la fecha existente con
--     started = false y sin escribir. Si el UPDATE afecta 0 filas por CUALQUIER OTRA causa =>
--     program_not_startable. Esto es lo que hace seguro el auto-start del ejecutor (web
--     workout-log.actions.ts, RN lib/workout-session.ts): puede llamarse en cada serie sin mover la
--     fecha ni "reescribir historia" (D3) y sin re-emitir el evento.
--   - Fecha por defecto = hoy en America/Santiago via public.eva_santiago_day(now()) - la MISMA
--     unidad de dia del indice unico workout_logs_one_set_per_day (20260707120000:63) y de la racha.
--     Firma verificada en LIVE: public.eva_santiago_day(ts timestamptz) RETURNS date, IMMUTABLE.
--   - Escribe start_date Y end_date en el MISMO UPDATE (R21: end_date = start + weeks_to_repeat*7
--     - 1, calculado server-side con la weeks_to_repeat de la propia fila; el alumno no lo elige).
--     Misma formula que el unico calculo de la casa (apps/web/src/services/workout/workout.service.ts
--     :425-428 y :978-981), que NO ramifica por duration_type. En LIVE workout_programs.weeks_to_repeat
--     es NOT NULL DEFAULT 1 (min 1, max 12), asi que el GREATEST/COALESCE es cinturon, no parche.
--     Las dos columnas viajan juntas y las dos son NULL mientras el programa no empezo: la ficha del
--     coach calcula semana y dias restantes solo si estan ambas (client-detail.service.ts:314).
--   - VENTANA = SOLO HOY (R14). p_start_date NULL o IGUAL a hoy (Santiago) pasa; CUALQUIER otra
--     fecha => start_date_out_of_range. No hay "Elegir otra fecha" ni estado "Empieza el <fecha>"
--     en este tren (backlog). El pasado esta cerrado porque la RPC es idempotente estricta (una
--     fecha retroactiva no se puede corregir despues) y en weekly flexible crearia dias asignados
--     hacia atras (migracion 1, CTE `assigned`) que la regla 2 cuenta como CORTE => la racha se
--     rompe en el mismo instante en que el alumno "empieza". El futuro esta cerrado porque
--     adelantaria semana, fases y variante A/B en cycle
--     (apps/web/src/lib/workout/programWeekVariant.ts:7-22) hacia un estado que la UI no tiene.
--
-- Aditiva, idempotente (CREATE OR REPLACE), forward-only, sin DROP. Rollback al pie.

CREATE OR REPLACE FUNCTION public.client_start_workout_program(
  p_program_id uuid,
  p_start_date date DEFAULT NULL
) RETURNS TABLE (start_date date, end_date date, started boolean)   -- R23
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid      uuid := (SELECT auth.uid());
  v_today    date := public.eva_santiago_day(now());
  v_existing date;
  v_date     date;
  v_end      date;
  v_found    boolean := false;
BEGIN
  -- Sin sesion no hay dueno: service_role NO tiene camino aca (a proposito).
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF p_program_id IS NULL THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  -- Gate de acceso del alumno segun la suscripcion de SU coach (R17, 20260718120000). Espejo del
  -- patron de las RPCs V2 de nutricion (20260718120000:290, :496): post-gracia el alumno queda en
  -- SOLO-LECTURA y no empieza programas. Va ANTES del SELECT ... FOR UPDATE para no tomar el lock.
  IF NOT private.student_write_allowed(v_uid) THEN
    RAISE EXCEPTION 'coach_account_paused' USING ERRCODE = '42501';
  END IF;

  -- Guard de pertenencia + estado. Mismo predicado que la policy INSERT del alumno sobre
  -- workout_logs (R40: workout_logs_client => client_id = (SELECT auth.uid()); sin
  -- client_memberships). FOR UPDATE serializa dos "Empezar hoy" simultaneos (boton + auto-start del
  -- primer set): el segundo ve la fecha ya escrita y sale por idempotencia.
  -- OJO plpgsql: los OUT de RETURNS TABLE se llaman start_date/end_date, asi que TODA referencia a
  -- esas columnas dentro del cuerpo va calificada con el alias (g.start_date, g.end_date) o Postgres
  -- lanza "column reference is ambiguous".
  SELECT true, g.start_date, g.end_date
    INTO v_found, v_existing, v_end
  FROM public.workout_programs g
  WHERE g.id = p_program_id
    AND g.client_id = v_uid
    AND g.is_active = true
    AND COALESCE(g.start_date_flexible, false) = true
  FOR UPDATE;

  -- Mismo error para "no existe", "no es tuyo", "no esta activo" y "no es flexible": no se filtra
  -- la existencia de un programa ajeno (el IDOR se cierra sin oraculo).
  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  -- R28: idempotente. La fecha ya estaba => se devuelve tal cual, con started = false y sin
  -- escribir (asi el auto-start de cada serie no re-emite program_started_by_client).
  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, v_end, false;
    RETURN;
  END IF;

  v_date := COALESCE(p_start_date, v_today);

  -- VENTANA = SOLO HOY (R14). NULL o hoy pasan; cualquier otra fecha se rechaza. "Elegir otra
  -- fecha" quedo fuera de este tren, asi que la RPC no tiene por que aceptar futuro: el pasado es
  -- irreversible (idempotencia estricta) y corta la racha en weekly flexible, y el futuro crea un
  -- estado "Empieza el <fecha>" que la UI de este tren no tiene.
  IF v_date <> v_today THEN
    RAISE EXCEPTION 'start_date_out_of_range' USING ERRCODE = '22007';
  END IF;

  -- RETURNING: los valores devueltos son SIEMPRE los persistidos. Con el cinturon
  -- `start_date IS NULL`, un UPDATE que afecta 0 filas (carrera que gano otra sesion entre el SELECT
  -- y el UPDATE) dejaba v_date "de fantasia": el hero del alumno y el auto-start de cada serie
  -- (workout-log.actions.ts / workout-session.ts) pintan el estado con lo que devuelve esta RPC.
  -- end_date viaja SIEMPRE con start_date (R21): la ficha del coach calcula semana actual y dias
  -- restantes solo si estan LAS DOS (apps/web/src/services/client/client-detail.service.ts:314);
  -- fijar solo start_date dejaria el progreso del programa en 0.
  UPDATE public.workout_programs g
     SET start_date = v_date,
         end_date   = v_date + (GREATEST(1, COALESCE(g.weeks_to_repeat, 1)) * 7 - 1)
   WHERE g.id = p_program_id
     AND g.client_id = v_uid
     AND g.start_date IS NULL             -- cinturon: nunca pisa una fecha existente
  RETURNING g.start_date, g.end_date INTO v_date, v_end;

  IF FOUND THEN
    RETURN QUERY SELECT v_date, v_end, true;   -- started = true: ESTA llamada escribio (R23)
    RETURN;
  END IF;

  -- R28: 0 filas. Si es porque la fecha ya estaba (carrera que gano otra sesion entre el
  -- SELECT ... FOR UPDATE y el UPDATE), se devuelve la existente con started = false. Si es por
  -- cualquier otra causa (la fila dejo de cumplir el guard), program_not_startable.
  SELECT g.start_date, g.end_date INTO v_date, v_end
    FROM public.workout_programs g
   WHERE g.id = p_program_id AND g.client_id = v_uid;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'program_not_startable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT v_date, v_end, false;
END;
$$;

-- Patron unico de grants del tren (R16). REVOKE tambien a service_role: el baseline tiene
-- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role`
-- (00000000000001_baseline.sql:3815), asi que TODA funcion nueva nace con un GRANT EXPLICITO a
-- service_role que un REVOKE de PUBLIC/anon no toca (el mismo hallazgo que motivo
-- 20260608120160_revoke_public_definer_read_rpcs.sql:1-4 para PUBLIC). Sin esta linea, el paso 3 del
-- protocolo (DATA-SECURITY §5) mide `service_role = true` y contradice al threat model (§8.2).
-- Esta es la UNICA RPC del tren donde service_role queda SIN EXECUTE.
REVOKE ALL ON FUNCTION public.client_start_workout_program(uuid, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.client_start_workout_program(uuid, date) TO authenticated;

-- Verificacion INMEDIATA (misma sesion, justo despues del CREATE): que el REVOKE haya quedado.
-- Esperado: anon false, authenticated true, service_role false. Si no coincide, la migracion aborta.
DO $verify$
DECLARE
  v_anon    boolean := has_function_privilege('anon',          'public.client_start_workout_program(uuid, date)', 'EXECUTE');
  v_auth    boolean := has_function_privilege('authenticated', 'public.client_start_workout_program(uuid, date)', 'EXECUTE');
  v_service boolean := has_function_privilege('service_role',  'public.client_start_workout_program(uuid, date)', 'EXECUTE');
BEGIN
  IF v_anon OR v_service OR NOT v_auth THEN
    RAISE EXCEPTION
      'client_start_workout_program: ACL inesperada (anon=%, authenticated=%, service_role=%); esperado (false, true, false)',
      v_anon, v_auth, v_service
      USING ERRCODE = '42501';
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.client_start_workout_program(uuid, date) IS
  'El alumno fija el start_date (y el end_date derivado = start + weeks_to_repeat*7 - 1) de SU programa flexible sin empezar ("Empezar hoy", D3). Devuelve TABLE(start_date, end_date, started); started = true solo cuando ESTA llamada escribio, y el evento program_started_by_client se emite unicamente en ese caso. Guards: private.student_write_allowed(auth.uid()) (gate de suscripcion del coach) + client_id = auth.uid() AND is_active AND start_date_flexible AND start_date IS NULL, mismo predicado que la policy INSERT del alumno sobre workout_logs. Idempotente: si ya tiene fecha la devuelve con started = false y sin escribir (habilita el auto-start en cada serie); devuelve SIEMPRE los valores persistidos (RETURNING + relectura). Ventana: SOLO HOY (p_start_date NULL o = eva_santiago_day(now()), America/Santiago); cualquier otra fecha => start_date_out_of_range. EXECUTE solo a authenticated; el grant por default privileges a service_role se revoca explicitamente.';

-- ============================================================================
-- ROLLBACK (referencia de operacion; no se ejecuta aca):
--   DROP FUNCTION IF EXISTS public.client_start_workout_program(uuid, date);
-- ============================================================================
