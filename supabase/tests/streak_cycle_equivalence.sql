-- supabase/tests/streak_cycle_equivalence.sql
--
-- Prueba de equivalencia de la rama `cycle` de la racha (tren "Ciclo real y por lado", 2026-09).
-- Compara, para TODO cliente con logs en la ventana de 730 dias, el veredicto de la funcion
-- VIGENTE public.get_client_current_streak contra el cuerpo NUEVO de
-- supabase/migrations/20260903212441_streak_cycle_branch_and_null_start.sql, instalado aca como
-- espejo public._streak_next (R25).
--
-- CRITERIO DE PASO (cuatro condiciones; si falla cualquiera el DO del paso 3 lanza EXCEPTION y la
-- transaccion aborta -> NO aplicar la migracion):
--   1. difs_weekly       = 0  -> la rama no contamino el camino semanal (criterio DURO, OUTLINE 8)
--   2. difs_sin_programa = 0  -> la regla 7 sigue igual para quien no tiene programa activo
--   3. mixtos            = 0  -> nadie tiene weekly Y cycle activos a la vez; si aparece alguno hay
--                                que revisarlo A MANO (su racha cambia a proposito, ver
--                                DATA-SECURITY.md 1.1)
--   4. cycle_con_cambio  > 0  -> la prueba no es vacua: si la rama cycle no mueve NINGUN numero, no
--                                se esta arreglando el bug que motiva el tren
--
-- RESULTADO DE REFERENCIA (LIVE jikjeokundmaafuytdcx, 2026-09-03): 109 clientes, difs_weekly = 0
-- (91 weekly), difs_sin_programa = 0 (5), mixtos = 0, clientes_cycle = 13, cycle_con_cambio = 11.
--
-- El cuerpo del espejo es el de la migracion VERBATIM: lo unico que cambia es el nombre
-- get_client_current_streak -> _streak_next. Si se edita cualquier otra linea, la prueba deja de
-- probar lo que se va a aplicar.
--
-- Solo lectura salvo la funcion espejo, y termina en ROLLBACK. Se corre como owner (sin JWT): la
-- funcion tiene bypass IDOR cuando auth.uid() IS NULL, que es justamente lo que permite compararla
-- sobre todos los clientes. La verificacion de RLS con JWTs REALES es un paso aparte del protocolo
-- (DATA-SECURITY.md 5, pasos 4 y 5) y NUNCA se hace con service_role.
--
-- Sin PII: la salida son UUIDs y enteros, nada de nombres ni correos.

BEGIN;
SET LOCAL statement_timeout = '600s';

-- ---------------------------------------------------------------------------
-- Paso 1 - funcion espejo con el cuerpo NUEVO (verbatim de la migracion).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._streak_next(p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date := public.eva_santiago_day(now());
  v_from date;
  v_first_log date;
  v_regime_start date;
  v_has_regime boolean;
  v_cycle_start date;          -- CAMBIO 2
  v_streak integer := 0;
  rec record;
BEGIN
  -- IDOR guard: bloquea lectura cross-tenant; deja pasar service-role (auth.uid() IS NULL).
  IF auth.uid() IS NOT NULL AND NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN 0; END IF;

  v_from := v_today - 730;

  -- Poda sin cambio semantico (identica a 20260723110000:69-81).
  SELECT min(public.eva_santiago_day(wl.logged_at))
    INTO v_first_log
  FROM public.workout_logs wl
  WHERE wl.client_id = p_client_id
    AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago');
  IF v_first_log IS NULL THEN
    RETURN 0;
  END IF;
  v_from := GREATEST(v_from, v_first_log - (EXTRACT(ISODOW FROM v_first_log)::int - 1));

  -- CAMBIO 1 (R2): un programa sin start_date NO crea regimen de asignacion. Antes se hacia
  -- min(COALESCE(g.start_date, v_from)), que metia toda la ventana bajo regimen.
  SELECT min(g.start_date)
    INTO v_regime_start
  FROM public.workout_programs g
  WHERE g.client_id = p_client_id
    AND g.is_active = true
    AND g.start_date IS NOT NULL;
  v_has_regime := v_regime_start IS NOT NULL;

  -- CAMBIO 2 (R1): ancla del regimen de ciclo. NULL => la rama cycle queda apagada por completo.
  SELECT min(g.start_date)
    INTO v_cycle_start
  FROM public.workout_programs g
  WHERE g.client_id = p_client_id
    AND g.is_active = true
    AND g.start_date IS NOT NULL
    AND COALESCE(g.program_structure_type, 'weekly') = 'cycle';

  FOR rec IN
    WITH progs AS (
      SELECT g.id,
             g.start_date,
             COALESCE(g.program_structure_type, 'weekly') AS structure,   -- CAMBIO 3
             GREATEST(1, COALESCE(g.weeks_to_repeat, 1)) AS weeks,
             COALESCE(g.ab_mode, false) AS ab,
             EXISTS (SELECT 1 FROM public.workout_plans p
                     WHERE p.program_id = g.id AND COALESCE(NULLIF(p.week_variant, ''), 'A') = 'A') AS has_a,
             EXISTS (SELECT 1 FROM public.workout_plans p
                     WHERE p.program_id = g.id AND COALESCE(NULLIF(p.week_variant, ''), 'A') = 'B') AS has_b
      FROM public.workout_programs g
      WHERE g.client_id = p_client_id AND g.is_active = true
    ),
    days AS (
      SELECT d::date AS day,
             EXTRACT(ISODOW FROM d::date)::int AS dow,
             (d::date - (EXTRACT(ISODOW FROM d::date)::int - 1)) AS week_monday
      FROM generate_series(v_from, v_today, interval '1 day') d
    ),
    -- Asignaciones por dia: SOLO programas weekly ya empezados. En cycle el day_of_week es el
    -- indice del ciclo, no ISODOW: no se puede comparar contra dy.dow (CAMBIO 3), y un programa
    -- sin start_date no asigna nada (CAMBIO 4).
    assigned AS (
      SELECT dy.day, dy.week_monday, p.id AS plan_id
      FROM days dy
      JOIN progs g
        ON g.structure <> 'cycle'                                          -- CAMBIO 3
       AND g.start_date IS NOT NULL AND g.start_date <= dy.day             -- CAMBIO 4
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN (GREATEST(1, LEAST(g.weeks, ((dy.day - g.start_date) / 7) + 1)) % 2) = 1
                 THEN 'A' ELSE 'B'
               END AS cycle_variant
      ) cv
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN NOT g.ab THEN 'A'
                 WHEN cv.cycle_variant = 'A' THEN
                   CASE WHEN g.has_a THEN 'A' WHEN g.has_b THEN 'B' ELSE 'A' END
                 ELSE
                   CASE WHEN g.has_b THEN 'B' WHEN g.has_a THEN 'A' ELSE 'B' END
               END AS eff_variant
      ) ev
      JOIN public.workout_plans p
        ON p.program_id = g.id
       AND p.day_of_week = dy.dow
       AND COALESCE(NULLIF(p.week_variant, ''), 'A') = ev.eff_variant
      UNION
      -- Legacy: plan suelto puntual (program_id NULL). Hoy 0 filas en prod.
      SELECT p.assigned_date,
             (p.assigned_date - (EXTRACT(ISODOW FROM p.assigned_date)::int - 1)),
             p.id
      FROM public.workout_plans p
      WHERE p.program_id IS NULL
        AND p.client_id = p_client_id
        AND p.assigned_date BETWEEN v_from AND v_today
    ),
    -- Dia Santiago x plan con al menos un log. plan_id NULL = log huerfano o sesion sin bloque.
    logdays AS (
      SELECT public.eva_santiago_day(wl.logged_at) AS day, wb.plan_id
      FROM public.workout_logs wl
      LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
      WHERE wl.client_id = p_client_id
        AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago')
      GROUP BY 1, 2
    ),
    anylog AS (SELECT DISTINCT day FROM logdays),
    -- CAMBIO 5 (R1): dia con >=1 log de un plan de un programa CYCLE activo ya empezado = +1.
    -- Un log huerfano (bloque borrado, plan_id NULL) o de otro programa NO entra: sigue siendo
    -- NEUTRO, igual que las reglas 4 y 5 de la semantica vigente (R29).
    cycledays AS (
      SELECT DISTINCT l.day
      FROM logdays l
      JOIN public.workout_plans p ON p.id = l.plan_id
      JOIN progs g ON g.id = p.program_id
      WHERE g.structure = 'cycle'
        AND g.start_date IS NOT NULL
        AND g.start_date <= l.day
    ),
    -- CAMBIO 6 (R1): unica ventana de corte en cycle. Semana Lun-Dom Santiago YA CERRADA
    -- (week_monday + 6 < hoy) con CERO logs de cualquier tipo. Solo se juzgan las semanas que
    -- empiezan en o despues del ancla del ciclo: una semana anterior al programa no se evalua.
    cycle_empty_weeks AS (
      SELECT dy.week_monday
      FROM days dy
      LEFT JOIN anylog al ON al.day = dy.day
      WHERE v_cycle_start IS NOT NULL
        AND dy.week_monday >= v_cycle_start
        AND dy.week_monday + 6 < v_today
      GROUP BY dy.week_monday
      HAVING count(al.day) = 0
    ),
    -- Fase 1 (regla 1): dia asignado con log de SU plan ese mismo dia.
    phase1 AS (
      SELECT DISTINCT a.day
      FROM assigned a
      JOIN logdays l ON l.plan_id = a.plan_id AND l.day = a.day
    ),
    -- Fase 2 (regla 3): atribucion greedy por (plan, semana Lun-Dom) — espejo del dashboard.
    leftover_logs AS (
      SELECT l.day, l.plan_id,
             (l.day - (EXTRACT(ISODOW FROM l.day)::int - 1)) AS week_monday,
             ROW_NUMBER() OVER (
               PARTITION BY l.plan_id, (l.day - (EXTRACT(ISODOW FROM l.day)::int - 1))
               ORDER BY l.day
             ) AS rn
      FROM logdays l
      WHERE l.plan_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM assigned a WHERE a.plan_id = l.plan_id AND a.day = l.day)
    ),
    missed_occurrences AS (
      SELECT a.day, a.plan_id, a.week_monday,
             ROW_NUMBER() OVER (PARTITION BY a.plan_id, a.week_monday ORDER BY a.day) AS rn
      FROM assigned a
      WHERE NOT EXISTS (SELECT 1 FROM logdays l WHERE l.plan_id = a.plan_id AND l.day = a.day)
    ),
    phase2 AS (
      SELECT DISTINCT ll.day
      FROM leftover_logs ll
      JOIN missed_occurrences mo
        ON mo.plan_id = ll.plan_id
       AND mo.week_monday = ll.week_monday
       AND mo.rn = ll.rn
    ),
    day_status AS (
      SELECT dy.day,
             (p1.day IS NOT NULL
              OR p2.day IS NOT NULL
              -- Regla 7: fuera de la zona con regimen, todo dia entrenado suma.
              OR ((NOT v_has_regime OR dy.day < v_regime_start) AND al.day IS NOT NULL)
              OR cd.day IS NOT NULL) AS qualifies,                        -- CAMBIO 7
             -- Regla 2 (weekly): dia asignado YA PASADO con cero logs corta. Hoy nunca corta.
             -- CAMBIO 8 (cycle): corta la semana Lun-Dom cerrada sin ningun entreno.
             ((dy.day < v_today AND ad.day IS NOT NULL AND al.day IS NULL)
              OR ew.week_monday IS NOT NULL) AS breaks
      FROM days dy
      LEFT JOIN phase1 p1 ON p1.day = dy.day
      LEFT JOIN phase2 p2 ON p2.day = dy.day
      LEFT JOIN anylog al ON al.day = dy.day
      LEFT JOIN cycledays cd ON cd.day = dy.day
      LEFT JOIN cycle_empty_weeks ew ON ew.week_monday = dy.week_monday
      LEFT JOIN (SELECT DISTINCT day FROM assigned) ad ON ad.day = dy.day
    )
    SELECT day, qualifies, breaks FROM day_status ORDER BY day DESC
  LOOP
    IF rec.qualifies THEN
      v_streak := v_streak + 1;
    ELSIF rec.breaks THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$function$;

REVOKE ALL ON FUNCTION public._streak_next(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Paso 2 - universo: todo cliente con al menos un log en la ventana de la funcion (730 d),
-- clasificado por la estructura de sus programas ACTIVOS.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _ids(client_id uuid) ON COMMIT DROP;
INSERT INTO _ids
  SELECT DISTINCT wl.client_id
    FROM public.workout_logs wl
   WHERE wl.logged_at >= now() - interval '730 days';

CREATE TEMP TABLE _cls(client_id uuid, estructura text) ON COMMIT DROP;
INSERT INTO _cls
  SELECT i.client_id,
         CASE
           WHEN count(g.id) = 0 THEN 'sin_programa'
           WHEN bool_and(COALESCE(g.program_structure_type, 'weekly') = 'cycle')  THEN 'cycle'
           WHEN bool_and(COALESCE(g.program_structure_type, 'weekly') <> 'cycle') THEN 'weekly'
           ELSE 'mixto'
         END
    FROM _ids i
    LEFT JOIN public.workout_programs g
      ON g.client_id = i.client_id AND g.is_active = true
   GROUP BY i.client_id;

CREATE TEMP TABLE _d(client_id uuid, estructura text, actual int, next int) ON COMMIT DROP;
INSERT INTO _d
  SELECT c.client_id,
         c.estructura,
         public.get_client_current_streak(c.client_id),
         public._streak_next(c.client_id)
    FROM _cls c;

-- ---------------------------------------------------------------------------
-- Paso 3 - GUARD: una sola fila weekly (o sin_programa) divergente, un cliente mixto, o una rama
-- cycle que no mueve nada, y la prueba FALLA con EXCEPTION. No es un aviso: aborta.
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
  v_weekly int;
  v_sinprog int;
  v_mixtos int;
  v_cycle_chg int;
  v_muestra text;
BEGIN
  SELECT count(*) FILTER (WHERE estructura = 'weekly'       AND actual IS DISTINCT FROM next),
         count(*) FILTER (WHERE estructura = 'sin_programa' AND actual IS DISTINCT FROM next),
         count(*) FILTER (WHERE estructura = 'mixto'),
         count(*) FILTER (WHERE estructura = 'cycle'        AND actual IS DISTINCT FROM next)
    INTO v_weekly, v_sinprog, v_mixtos, v_cycle_chg
    FROM _d;

  IF v_weekly > 0 THEN
    SELECT string_agg(format('%s: %s -> %s', left(s.client_id::text, 8), s.actual, s.next), ', ')
      INTO v_muestra
      FROM (SELECT client_id, actual, next FROM _d
             WHERE estructura = 'weekly' AND actual IS DISTINCT FROM next
             ORDER BY client_id LIMIT 20) s;
    RAISE EXCEPTION
      'streak_cycle_equivalence: % cliente(s) WEEKLY divergentes (criterio duro). Muestra: %',
      v_weekly, v_muestra;
  END IF;

  IF v_sinprog > 0 THEN
    RAISE EXCEPTION
      'streak_cycle_equivalence: % cliente(s) SIN PROGRAMA divergentes; la regla 7 cambio de comportamiento',
      v_sinprog;
  END IF;

  IF v_mixtos > 0 THEN
    RAISE EXCEPTION
      'streak_cycle_equivalence: % cliente(s) con weekly Y cycle activos a la vez; revisar A MANO antes de aplicar (DATA-SECURITY.md 1.1)',
      v_mixtos;
  END IF;

  IF v_cycle_chg = 0 THEN
    RAISE EXCEPTION
      'streak_cycle_equivalence: la rama cycle no movio NINGUN numero; la prueba es vacua y no demuestra el fix';
  END IF;
END
$chk$;

-- ---------------------------------------------------------------------------
-- Paso 4 - resultado agregado.
-- ---------------------------------------------------------------------------
SELECT count(*)                                                                             AS clientes,
       count(*) FILTER (WHERE estructura = 'weekly'       AND actual IS DISTINCT FROM next)  AS difs_weekly,
       count(*) FILTER (WHERE estructura = 'sin_programa' AND actual IS DISTINCT FROM next)  AS difs_sin_programa,
       count(*) FILTER (WHERE estructura = 'mixto')                                          AS mixtos,
       count(*) FILTER (WHERE estructura = 'cycle')                                          AS clientes_cycle,
       count(*) FILTER (WHERE estructura = 'cycle' AND actual IS DISTINCT FROM next)         AS cycle_con_cambio
  FROM _d;

-- ---------------------------------------------------------------------------
-- Paso 5 - detalle: toda diferencia que NO sea de un cliente 'cycle' (con el guard del paso 3
-- esto es siempre vacio; queda para el dia en que falle y haya que mirarlo).
-- ---------------------------------------------------------------------------
SELECT estructura, client_id, actual, next
  FROM _d
 WHERE actual IS DISTINCT FROM next AND estructura <> 'cycle'
 ORDER BY estructura, client_id;

-- ---------------------------------------------------------------------------
-- Paso 6 - muestra de la rama cycle: el numero que van a ver los alumnos (Movens incluido).
-- Se guarda como snapshot para comparar despues de aplicar.
-- ---------------------------------------------------------------------------
SELECT d.client_id, d.actual, d.next,
       g.cycle_length, g.start_date, COALESCE(g.ab_mode, false) AS ab_mode
  FROM _d d
  JOIN public.workout_programs g
    ON g.client_id = d.client_id AND g.is_active = true
 WHERE d.estructura = 'cycle'
 ORDER BY d.next DESC, d.client_id;

-- ---------------------------------------------------------------------------
-- Paso 7 - salida UNICA para runners que solo devuelven el ultimo result set (MCP execute_sql).
-- Mismo contenido de los pasos 4-6 en una sola fila.
-- ---------------------------------------------------------------------------
SELECT jsonb_pretty(jsonb_build_object(
  'resumen', (
    SELECT to_jsonb(r) FROM (
      SELECT count(*)                                                                            AS clientes,
             count(*) FILTER (WHERE estructura = 'weekly'       AND actual IS DISTINCT FROM next) AS difs_weekly,
             count(*) FILTER (WHERE estructura = 'sin_programa' AND actual IS DISTINCT FROM next) AS difs_sin_programa,
             count(*) FILTER (WHERE estructura = 'mixto')                                         AS mixtos,
             count(*) FILTER (WHERE estructura = 'weekly')                                        AS clientes_weekly,
             count(*) FILTER (WHERE estructura = 'sin_programa')                                  AS clientes_sin_programa,
             count(*) FILTER (WHERE estructura = 'cycle')                                         AS clientes_cycle,
             count(*) FILTER (WHERE estructura = 'cycle' AND actual IS DISTINCT FROM next)        AS cycle_con_cambio
        FROM _d) r),
  'no_cycle_difs', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.estructura, x.cid8) FROM (
      SELECT estructura, left(client_id::text, 8) AS cid8, actual, next
        FROM _d WHERE actual IS DISTINCT FROM next AND estructura <> 'cycle') x), '[]'::jsonb),
  'cycle', COALESCE((
    SELECT jsonb_agg(to_jsonb(y) ORDER BY y.next DESC, y.cid8) FROM (
      SELECT left(d.client_id::text, 8) AS cid8, d.actual, d.next,
             g.cycle_length, g.start_date::text AS start_date, COALESCE(g.ab_mode, false) AS ab_mode
        FROM _d d
        JOIN public.workout_programs g ON g.client_id = d.client_id AND g.is_active = true
       WHERE d.estructura = 'cycle') y), '[]'::jsonb)
)) AS equivalencia;

ROLLBACK;
