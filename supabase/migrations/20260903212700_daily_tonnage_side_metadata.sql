-- Tonelaje diario con reps POR LADO (R3, tren «Ciclo real y por lado», DATA-SECURITY §3).
--
-- En un bloque de fuerza con side_mode per_side/alternating el alumno registra izq/der:
-- workout_logs.reps_done guarda el MINIMO de los dos lados (para no romper la doble progresion de
-- apps/web/src/lib/workout/progression.ts ni el e1RM de packages/workout-engine/pr-detect.ts) y el
-- desglose vive en workout_logs.metadata {left_reps, right_reps} (columna jsonb de
-- 20260611090003_workout_logs_polymorphic_mirror.sql:22). El TONELAJE si es la suma:
-- 20 kg x (10 izq + 10 der) = 400.
--
-- Fallback: sin metadata (todo el historico) se usa reps_done tal cual => 0 diff sobre datos
-- previos al deploy. Verificado en LIVE 2026-09-03: 0 filas de workout_logs con metadata ? 'left_reps'.
--
-- ROBUSTEZ DEL CAST (R27). El jsonb lo escribe el cliente; RN insertea el item de la cola crudo, sin
-- zod (apps/mobile/lib/offline-cache.ts:166, apps/mobile/lib/workout-session.ts:940,1067) y la
-- columna NO tiene CHECK (no se agrega: R27). NADA de jsonb_typeof: 'number' tambien es 10.5 (=>
-- '10.5'::int lanza 22P02) y 1e30 (=> 22003), y cualquiera de las dos tumbaria la funcion COMPLETA
-- para ese alumno (lectura que hace su coach). El filtro es una REGEX sobre el texto que devuelve
-- ->>: solo se suma cuando LOS DOS lados son enteros de 1 a 4 digitos (0..9999); cualquier otra
-- cosa (ausente, null, negativo, decimal, notacion cientifica, objeto) cae al fallback reps_done.
-- Nunca se castea algo que la regex no acepto, asi que no hay 22P02/22003 posible.
--
-- COSTO (R26). Se ACEPTA leer metadata fuera del indice covering parcial
-- (20260612050000_workout_logs_perf_indexes.sql:9-12, INCLUDE (weight_kg, reps_done, block_id)
-- WHERE weight_kg IS NOT NULL): metadata NO esta en el INCLUDE, aparecen heap fetch + detoast.
-- EXPLAIN (ANALYZE, BUFFERS) medido antes/despues en LIVE (§3 «Resultado LIVE 2026-09-03»); solo si
-- el tiempo sube MAS DE 2x se hace una migracion extra con metadata en el INCLUDE, y como
-- SEGUIMIENTO: no entra en este tren.
--
-- DIFERENCIA DE COMPORTAMIENTO declarada: el filtro `AND wl.reps_done > 0` del original pasa a
-- `WHERE e.reps_eff > 0`. Para una fila sin metadata valida es identico (reps_eff = reps_done). Solo
-- cambia para una fila nueva por lado con un lado en 0 ({"left_reps":10,"right_reps":0}): antes
-- reps_done = min = 0 la excluia pese a haber 10 reps hechas; ahora suma 10. Es la correccion
-- buscada, no un efecto colateral.
--
-- Misma firma (uuid, integer), mismos flags, mismo guard IDOR de 3 vias (sin bypass de service-role:
-- auth.uid() IS NULL => RETURN). Aditiva, idempotente, forward-only, sin DROP.
-- Rollback: re-aplicar el cuerpo de 20260612052000_rpc_client_progress_aggregations.sql:200-245.

CREATE OR REPLACE FUNCTION public.get_client_daily_tonnage(
  p_client_id uuid,
  p_max_days integer DEFAULT 21
)
RETURNS TABLE(day date, tonnage numeric, sessions integer, moving_avg numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3-way SELECT guard replicando las policies SELECT de workout_logs (cliente legacy / coach dueno / pool).
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH eff AS (
    SELECT
      (wl.logged_at AT TIME ZONE 'America/Santiago')::date AS d,
      wl.weight_kg,
      -- reps_eff (R27): se suma SOLO si LOS DOS lados matchean la regex de entero de 1-4 digitos.
      CASE
        WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
         AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
        THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
        ELSE wl.reps_done
      END AS reps_eff
    FROM public.workout_logs wl
    WHERE wl.client_id = p_client_id
      AND wl.weight_kg > 0
  ),
  daily AS (
    SELECT e.d, round(sum(e.weight_kg * e.reps_eff)) AS t
    FROM eff e
    WHERE e.reps_eff > 0
    GROUP BY 1
  ),
  kept AS (
    SELECT d, t FROM daily ORDER BY d DESC LIMIT p_max_days
  )
  SELECT
    k.d AS day,
    k.t AS tonnage,
    1 AS sessions,
    round(avg(k.t) OVER (ORDER BY k.d ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)) AS moving_avg
  FROM kept k
  ORDER BY k.d ASC;
END;
$$;

-- Patron unico de grants del tren (R16): service_role va EXPLICITO en el REVOKE (el baseline lo
-- grantea por default privileges, 00000000000001_baseline.sql:3815) y se repone en el GRANT, que es
-- lo que ya tenia el linaje 20260612052000:243-244 y lo que exige TASKS W6.9b (RPC de lectura que
-- tambien usa el servidor).
REVOKE ALL ON FUNCTION public.get_client_daily_tonnage(uuid, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_daily_tonnage(uuid, integer) TO authenticated, service_role;

-- Verificacion INMEDIATA de la ACL en la misma sesion, justo despues del CREATE.
-- Esperado: anon false, authenticated true, service_role true.
DO $verify$
DECLARE
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.get_client_daily_tonnage(uuid, integer)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_client_daily_tonnage(uuid, integer)', 'EXECUTE'),
         has_function_privilege('service_role',  'public.get_client_daily_tonnage(uuid, integer)', 'EXECUTE')
    INTO v_anon, v_auth, v_service;

  IF v_anon OR NOT v_auth OR NOT v_service THEN
    RAISE EXCEPTION
      'ACL inesperada en get_client_daily_tonnage(uuid, integer): anon=% (esperado false), authenticated=% (esperado true), service_role=% (esperado true)',
      v_anon, v_auth, v_service;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.get_client_daily_tonnage(uuid, integer) IS
  'Tonelaje diario (kg x reps) del alumno, ultimos p_max_days dias con actividad, con media movil de 7. En series por lado usa left_reps + right_reps de workout_logs.metadata cuando LOS DOS matchean ^[0-9]{1,4}$ (R27); en cualquier otro caso cae a reps_done. Guard IDOR: propio, coach o pool. Dia en America/Santiago.';
