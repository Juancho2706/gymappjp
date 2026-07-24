-- Racha del home alineada a la regla CEO 2026-07-22: "un dia sin asignacion es NEUTRO".
--
-- ANTES (20260616165712): dias calendario consecutivos con CUALQUIER actividad (workout O comida
-- completada), cortando ante cualquier dia sin actividad, con dia calculado en TZ del servidor (UTC).
-- Problema reportado: coach programa lunes y miercoles; alumno entrena ambos; el martes (sin
-- asignacion) cortaba la racha.
--
-- AHORA (reglamento confirmado por el CEO, sesion 2026-07-22/23):
--   1. Dia ASIGNADO + entrenado ese dia (log de SU plan)                       = +1
--   2. Dia ASIGNADO sin entrenar NADA (cero logs ese dia, dia ya pasado)       = CORTA.
--      Hoy en curso nunca corta. Recuperar despues NO repara el corte.
--   3. Dia libre entrenando un dia asignado PERDIDO de la MISMA semana
--      (lunes-domingo, America/Santiago)                                       = +1 (recuperacion)
--   4. Dia libre repitiendo algo ya hecho, o sesion libre                      = NEUTRO
--   5. Dia asignado entrenando OTRA cosa (incluye logs huerfanos block NULL)   = NEUTRO
--      (entreno algo -> no corta; no fue lo suyo -> no suma)
--   6. Nutricion FUERA de esta racha (se elimina el UNION de comidas)
--   7. Sin programa activo cubriendo la fecha (o sin programa del todo):
--      todo dia entrenado suma y ningun dia corta
--
-- Semantica de ASIGNACION (identica al dashboard/ejecutor, ver programWeekVariant.ts):
--   - dia asignado = plan del programa ACTIVO (workout_programs.is_active) con
--     day_of_week = ISODOW del dia (1=Lun..7=Dom) y week_variant que matchea la variante A/B
--     efectiva de esa semana del programa (indice clampeado a weeks_to_repeat, con el
--     "dead-end fix": si la variante del ciclo no tiene planes cargados, cae a la otra).
--   - end_date NO se consulta (el codigo de la app tampoco: el programa vive hasta desactivarse).
--   - assigned_date NO es senal de asignacion para planes de programa (es un eco de start_date);
--     solo se honra como asignacion puntual cuando program_id IS NULL (legacy, hoy 0 filas).
--   - el enlace log->plan es workout_logs.block_id -> workout_blocks.plan_id (no hay plan_id
--     directo); un log = una SERIE, por eso todo se evalua con EXISTS por dia.
--
-- TZ: se corrige de paso el bug latente de dia UTC — todo pasa por eva_santiago_day(logged_at)
-- y "hoy" = eva_santiago_day(now()), la unidad canonica que ya usa el indice unico
-- workout_logs_one_set_per_day.
--
-- Se conservan: firma (uuid)->integer, guard IDOR con bypass service-role (la ruta mobile pulse
-- depende de el), cap de 730 dias, grants. Los dos batch (get_clients_streaks_by_ids,
-- get_coach_clients_streaks) delegan a esta funcion y heredan la nueva semantica gratis.
--
-- Validada en LIVE antes de aplicar: funcion espejo temporal + comparacion vieja/nueva sobre
-- todos los clientes con logs + EXPLAIN ANALYZE (patron de 20260612053000). Forward-only,
-- idempotente (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_client_current_streak(p_client_id uuid)
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

  -- Poda sin cambio semantico: antes de la semana del PRIMER log nada puede sumar (no hay logs),
  -- y un corte previo solo detendria un conteo que ya es cero -> arrancar la ventana en el lunes
  -- de la semana del log mas antiguo (se incluye la semana completa para no romper la atribucion
  -- greedy de esa semana). Sin logs en 730d -> racha 0 directo.
  SELECT min(public.eva_santiago_day(wl.logged_at))
    INTO v_first_log
  FROM public.workout_logs wl
  WHERE wl.client_id = p_client_id
    AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago');
  IF v_first_log IS NULL THEN
    RETURN 0;
  END IF;
  v_from := GREATEST(v_from, v_first_log - (EXTRACT(ISODOW FROM v_first_log)::int - 1));

  -- Zona con regimen de asignacion = desde el start_date mas antiguo de los programas activos
  -- (NULL start = cubre toda la ventana). Antes de esa zona no hay como saber que estuvo
  -- asignado (los planes viejos se BORRAN al re-guardar) -> regla 7: entrenado suma, nada corta.
  SELECT min(COALESCE(g.start_date, v_from))
    INTO v_regime_start
  FROM public.workout_programs g
  WHERE g.client_id = p_client_id AND g.is_active = true;
  v_has_regime := v_regime_start IS NOT NULL;

  FOR rec IN
    WITH progs AS (
      SELECT g.id,
             g.start_date,
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
    -- Asignaciones por dia: plan del programa activo cuyo day_of_week coincide y cuya variante
    -- matchea la variante EFECTIVA de la semana del programa para ese dia.
    assigned AS (
      SELECT dy.day, dy.week_monday, p.id AS plan_id
      FROM days dy
      JOIN progs g ON (g.start_date IS NULL OR g.start_date <= dy.day)
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN (GREATEST(1, LEAST(g.weeks,
                        CASE WHEN g.start_date IS NULL THEN 1
                             ELSE ((dy.day - g.start_date) / 7) + 1 END)) % 2) = 1
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
      -- Legacy: plan suelto puntual (program_id NULL). Hoy 0 filas en prod; se soporta por
      -- completitud del modelo de lectura de la app.
      SELECT p.assigned_date,
             (p.assigned_date - (EXTRACT(ISODOW FROM p.assigned_date)::int - 1)),
             p.id
      FROM public.workout_plans p
      WHERE p.program_id IS NULL
        AND p.client_id = p_client_id
        AND p.assigned_date BETWEEN v_from AND v_today
    ),
    -- Dia Santiago x plan con al menos un log (un log = una serie -> DISTINCT).
    -- plan_id NULL = log huerfano (bloque borrado) o sesion sin bloque.
    logdays AS (
      SELECT public.eva_santiago_day(wl.logged_at) AS day, wb.plan_id
      FROM public.workout_logs wl
      LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
      WHERE wl.client_id = p_client_id
        AND wl.logged_at >= (v_from::timestamp AT TIME ZONE 'America/Santiago')
      GROUP BY 1, 2
    ),
    anylog AS (SELECT DISTINCT day FROM logdays),
    -- Fase 1 (regla 1): dia asignado con log de SU plan ese mismo dia.
    phase1 AS (
      SELECT DISTINCT a.day
      FROM assigned a
      JOIN logdays l ON l.plan_id = a.plan_id AND l.day = a.day
    ),
    -- Fase 2 (regla 3): atribucion greedy por (plan, semana Lun-Dom) — espejo del dashboard.
    -- Log-dias sobrantes de un plan (dias donde se logueo el plan sin ser su dia asignado)
    -- cierran, en orden, las ocurrencias perdidas de ese plan en la MISMA semana.
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
              OR ((NOT v_has_regime OR dy.day < v_regime_start) AND al.day IS NOT NULL)) AS qualifies,
             -- Regla 2: dia asignado YA PASADO con cero logs corta. Hoy nunca corta.
             (dy.day < v_today AND ad.day IS NOT NULL AND al.day IS NULL) AS breaks
      FROM days dy
      LEFT JOIN phase1 p1 ON p1.day = dy.day
      LEFT JOIN phase2 p2 ON p2.day = dy.day
      LEFT JOIN anylog al ON al.day = dy.day
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

COMMENT ON FUNCTION public.get_client_current_streak(uuid) IS
  'Racha diaria del alumno por DIAS ASIGNADOS (regla CEO 2026-07-22): asignado hecho = +1; asignado sin entrenar nada = corta (hoy no corta; recuperar no repara); dia libre recuperando un perdido de la misma semana Lun-Dom Santiago = +1; repeticion/sesion libre = neutro; asignado entrenando otra cosa = neutro; nutricion FUERA; sin programa activo todo dia entrenado suma. Dia = eva_santiago_day. Cap 730d. Guard IDOR con bypass service-role.';
