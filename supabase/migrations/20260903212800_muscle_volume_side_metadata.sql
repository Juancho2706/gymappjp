-- Volumen por grupo muscular con reps POR LADO (R15 + R3 + R27, DATA-SECURITY §3.1).
--
-- Cuarta migracion del tren «Ciclo real y por lado». Va junto con
-- 20260903212700_daily_tonnage_side_metadata.sql: las dos comparten EXACTAMENTE el mismo reps_eff,
-- asi que volumen por musculo y tonelaje dejan de contradecirse en la misma pantalla (se piden en
-- el mismo Promise.all: apps/web/src/services/client/client-detail.service.ts y
-- apps/mobile/lib/coach-client-detail.ts). Sin esta migracion, con R3 (reps_done = MINIMO de los dos
-- lados) el volumen por musculo de una serie por lado caeria a la mitad.
--
-- Base: definicion VIGENTE EN LIVE (snapshot pg_get_functiondef 2026-09-03), que es la de
-- 20260701140000_workout_logs_exercise_id_snapshot.sql:88-101 — OJO: el JOIN de exercises usa
-- COALESCE(wb.exercise_id, wl.exercise_id), no wb.exercise_id a secas como el linaje
-- 20260612052000_rpc_client_progress_aggregations.sql. Se conserva tal cual.
--
-- Cambian DOS cosas y nada mas: SUM(wl.weight_kg * wl.reps_done) -> SUM(wl.weight_kg * reps_eff), y
-- el mismo reps_eff en el filtro del WHERE. reps_eff es defensivo POR REGEX, nunca jsonb_typeof
-- (R27): 'number' tambien es 10.5 (=> 22P02) y 1e30 (=> 22003), y cualquiera de las dos tumbaria la
-- funcion entera para ese alumno. Lo que no matchea ^[0-9]{1,4}$ en LOS DOS lados nunca se castea y
-- cae al fallback reps_done. La columna metadata no tiene CHECK y no se agrega (R27).
--
-- Misma firma (uuid, integer), mismos flags, mismo guard IDOR de 3 vias (sin bypass de service-role)
-- y mismos JOINs. Aditiva, idempotente, forward-only, sin DROP.
-- Rollback: re-aplicar el cuerpo de 20260701140000_workout_logs_exercise_id_snapshot.sql:88-101 con
-- los REVOKE/GRANT de 20260612052000:76-77.

CREATE OR REPLACE FUNCTION public.get_client_muscle_volume(
    p_client_id uuid,
    p_days_back integer DEFAULT 30
)
RETURNS TABLE(muscle_group text, volume numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- 3-way SELECT guard: replica de las policies SELECT de workout_logs
    -- (cliente legacy / coach dueno / pool de coaches).
    IF auth.uid() IS NULL OR NOT (
        p_client_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
        OR p_client_id IN (SELECT public.current_user_pool_client_ids())
    ) THEN RETURN; END IF;

    -- Paridad con los espejos TS (apps/mobile/lib/enterprise-profile-analytics.ts y
    -- apps/mobile/lib/coach-client-detail.ts), que leen los lados con el helper unico
    -- sideRepsFromMetadata de @eva/workout-engine — mismo criterio que esta regex.
    --   mg      = exercises.muscle_group trim, '' -> 'Otro'
    --   reps_eff= left+right si LOS DOS matchean ^[0-9]{1,4}$, si no reps_done
    --   ventana = logged_at >= now() - 30d (instante, NO truncado a fecha) -> sin reasignacion TZ
    RETURN QUERY
    SELECT
        COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro') AS muscle_group,
        SUM(
          wl.weight_kg * CASE
            WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
             AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
            THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
            ELSE wl.reps_done
          END
        )::numeric                                          AS volume
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
    LEFT JOIN public.exercises e       ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
    WHERE wl.client_id = p_client_id
      AND wl.logged_at >= now() - make_interval(days => p_days_back)
      AND (
        COALESCE(wl.weight_kg, 0) * COALESCE(
          CASE
            WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
             AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
            THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
            ELSE wl.reps_done
          END, 0)
      ) > 0
    GROUP BY COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')
    ORDER BY volume DESC;
END;
$$;

-- Patron unico de grants del tren (R16): service_role EXPLICITO en el REVOKE (el baseline lo grantea
-- por default privileges) y repuesto en el GRANT, que es lo que ya tenia el linaje
-- 20260612052000_rpc_client_progress_aggregations.sql:76-77.
REVOKE ALL ON FUNCTION public.get_client_muscle_volume(uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_muscle_volume(uuid, integer) TO authenticated, service_role;

-- Verificacion INMEDIATA de la ACL en la misma sesion, justo despues del CREATE.
-- Esperado: anon false, authenticated true, service_role true.
DO $verify$
DECLARE
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.get_client_muscle_volume(uuid, integer)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_client_muscle_volume(uuid, integer)', 'EXECUTE'),
         has_function_privilege('service_role',  'public.get_client_muscle_volume(uuid, integer)', 'EXECUTE')
    INTO v_anon, v_auth, v_service;

  IF v_anon OR NOT v_auth OR NOT v_service THEN
    RAISE EXCEPTION
      'ACL inesperada en get_client_muscle_volume(uuid, integer): anon=% (esperado false), authenticated=% (esperado true), service_role=% (esperado true)',
      v_anon, v_auth, v_service;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.get_client_muscle_volume(uuid, integer) IS
  'Volumen (kg x reps) por grupo muscular del alumno en los ultimos p_days_back dias (ventana de instante). En series por lado usa left_reps + right_reps de workout_logs.metadata cuando LOS DOS matchean ^[0-9]{1,4}$ (R27, mismo reps_eff que get_client_daily_tonnage); en cualquier otro caso cae a reps_done. Guard IDOR: propio, coach o pool.';
