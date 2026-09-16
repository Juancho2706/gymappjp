-- Dossier por meses (docs/specs/dossier-por-meses) — capa de datos.
--
-- PROPOSITO
--   Dos RPC de SOLO LECTURA que alimentan la exportacion mensual del informe del alumno (web + RN):
--     1. public.get_client_month_reports(uuid, date[]) -> jsonb  { "months": [ {...}, ... ] }
--        Un unico read para TODA la exportacion (hasta 24 meses en una llamada, R2): dias
--        entrenados, sesiones, volumen por grupo, records con su maximo previo, programa del mes,
--        check-ins, peso y nutricion. Reemplaza las 3+N llamadas que habria hecho el cliente.
--     2. public.get_client_report_bounds(uuid) -> jsonb { "first_month", "current_month" } (R11)
--        Rango de meses seleccionables en el dialogo/sheet de exportacion.
--
-- CONTRATO (R10) — un elemento de "months":
--   { "month": "2026-07-01", "period": { "from": "2026-07-01", "to": "2026-07-31" },
--     "training_days": ["2026-07-01", ...], "sessions": 24,
--     "planned_days": 31 | null, "planned_per_week": 7 | null,
--     "volume_total": 363927, "volume_by_group": [{ "muscle_group": "Gluteos", "volume": 52533 }, ...],
--     "prs": [{ "exercise_id", "name", "muscle_group", "max_weight_kg", "reps_at_max",
--               "achieved_at", "prev_max_kg" }, ...],
--     "program": { "id", "name", "start_date", "end_date", "weeks_total", "week_from", "week_to",
--                  "days": [{ "title", "day_of_week", "block_count" }, ...] } | null,
--     "plan_names_from_logs": ["Push day", ...],
--     "check_ins": [{ "id", "created_at", "weight", "energy_level", "notes", "front_photo_url" }, ...],
--     "weight": { "last_kg", "last_at", "prev_kg" } | null,
--     "nutrition": { "plan_name", "in_range_days", "tracked_days" } | null }
--
-- DECISIONES QUE ESTA MIGRACION FIJA (todas vienen de RESOLUCIONES.md del tren)
--   R1  Zona horaria America/Santiago HARDCODEADA, sin parametro. Igual que
--       get_client_activity_dates / get_client_daily_tonnage. El mes en curso corta en HOY Santiago.
--   R2  Filtro temporal SARGABLE: el WHERE compara la columna cruda
--       (wl.logged_at < ((m + interval '1 month')::timestamp AT TIME ZONE 'America/Santiago')),
--       nunca timezone(...)::date. timezone('America/Santiago', ts)::date se usa SOLO en el SELECT
--       para etiquetar el dia local. Una sola pasada sobre workout_logs del alumno
--       (idx_workout_logs_client_id_logged_at / idx_wl_client_logged_notnull) y el maximo previo
--       por ejercicio sale de una window function, no de subconsultas por mes.
--       El CTE `logs` NO lleva cota inferior a proposito: prev_max_kg tiene que ver TODO el
--       historial anterior, incluidos los meses que el coach no pidio.
--   R3  Denegacion = raise exception ... errcode '42501'. Nunca devolver vacio.
--       Guard de 3 vias VERBATIM (propio / coach dueno / pool), copiado de get_client_muscle_volume.
--   R4  language plpgsql stable security definer set search_path = '' con TODOS los nombres
--       calificados. ACL con service_role explicito en el REVOKE y repuesto en el GRANT,
--       + DO $verify$ con has_function_privilege por funcion, + COMMENT ON FUNCTION.
--   R5  Eje temporal de check-ins = check_ins.created_at (NO check_ins.date: el peso rapido escribe
--       'YYYY-MM-DD' => medianoche UTC => dia anterior en Santiago).
--   R6  Predicados VERBATIM: records de get_client_exercise_prs (20260910205101) y reps_eff por lado
--       de get_client_muscle_volume (20260903212800).
--   R7  Programa del mes por fecha con fallback a plan_name_at_log.
--   R9  Nutricion SOLO LECTURA (nunca get_nutrition_today_v2 ni nada que llame
--       private.nutrition_v2_ensure_day_snapshot, que es VOLATILE y materializa snapshots).
--   R11 get_client_report_bounds.
--
-- DESVIACIONES / INTERPRETACIONES declaradas (ver tambien DATA-TESTING.md):
--   a) muscle_group de los records usa la forma de VOLUMEN
--      (COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')), no el COALESCE(e.muscle_group, '—')
--      de get_client_exercise_prs: R6 declara "grupo" una sola vez para toda la funcion y un mismo
--      informe no puede imprimir 'Otro' en volumen y '—' en records para el mismo ejercicio.
--      El PREDICADO de records si es verbatim.
--   b) planned_days = round(planned_per_week * dias_cubiertos_por_el_programa / 7), donde
--      dias_cubiertos = solape del programa con el periodo. R7 solo dice "dias planificados del
--      periodo"; con 7/semana y julio entero da 31, que es el ejemplo del contrato.
--   c) volume_total / volume_by_group van SIN redondear, igual que get_client_muscle_volume.
--      El redondeo es del modelo/PDF.
--   d) plan_names_from_logs excluye NULL (array_agg(distinct ...) los incluiria como elemento).
--   e) Con ab_mode, "days" puede repetir el mismo day_of_week (variante A y B): el contrato R10 no
--      tiene week_variant y no se agrega. planned_per_week si promedia A y B (R7).
--   f) Programa con plan_names pero sin dias planificados => planned_per_week = 0 y
--      planned_days = 0 (no null). El modelo debe tratar planned_days <= 0 como adherencia null.
--
-- ROLLBACK (documentado, no ejecutado): las dos funciones son NUEVAS, no reemplazan nada.
--   DROP FUNCTION IF EXISTS public.get_client_month_reports(uuid, date[]);
--   DROP FUNCTION IF EXISTS public.get_client_report_bounds(uuid);
--   No toca tablas, filas, indices ni RLS.
--
-- Aditiva, idempotente (CREATE OR REPLACE) y forward-only. Sin DROP, sin DDL destructiva.

-- ============================================================================
-- 1) public.get_client_month_reports(p_client_id uuid, p_months date[]) -> jsonb
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_client_month_reports(
  p_client_id uuid,
  p_months date[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_months        date[];        -- meses normalizados y deduplicados (primer dia de mes)
  v_min_month     date;
  v_max_month     date;
  v_from          timestamptz;   -- inicio del rango total, en Santiago
  v_to            timestamptz;   -- fin EXCLUSIVO del rango total, en Santiago
  v_today         date;          -- hoy en Santiago
  v_current_month date;          -- primer dia del mes en curso, en Santiago
  v_result        jsonb;
BEGIN
  -- ── Validacion de entrada (22023). Va antes del guard: no revela nada del alumno. ──────────
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_month_reports_invalid_client' USING errcode = '22023';
  END IF;

  IF p_months IS NULL
     OR pg_catalog.array_ndims(p_months) <> 1
     OR pg_catalog.array_length(p_months, 1) IS NULL
     OR pg_catalog.array_length(p_months, 1) > 24
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_months) AS m WHERE m IS NULL)
  THEN
    RAISE EXCEPTION 'client_month_reports_invalid_months'
      USING errcode = '22023',
            detail  = 'p_months debe ser un array de 1 a 24 fechas no nulas (primer dia de cada mes).';
  END IF;

  -- ── Guard IDOR de 3 vias, VERBATIM de get_client_muscle_volume / get_client_exercise_prs.
  --    R3: denegar con 42501, nunca devolver vacio. ────────────────────────────────────────────
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RAISE EXCEPTION 'client_month_reports_denied' USING errcode = '42501';
  END IF;

  -- ── Normalizacion de meses + ventana total en Santiago ─────────────────────────────────────
  SELECT array_agg(DISTINCT date_trunc('month', m)::date)
    INTO v_months
    FROM pg_catalog.unnest(p_months) AS m;

  SELECT min(m), max(m) INTO v_min_month, v_max_month FROM pg_catalog.unnest(v_months) AS m;

  -- R2 verbatim: el limite del range scan se calcula UNA vez y se compara contra la columna cruda.
  v_from  := (v_min_month::timestamp AT TIME ZONE 'America/Santiago');
  v_to    := ((v_max_month + interval '1 month')::timestamp AT TIME ZONE 'America/Santiago');
  v_today := (timezone('America/Santiago', now()))::date;
  v_current_month := date_trunc('month', v_today)::date;

  WITH
  -- Meses TAL COMO los pidio el caller (con ordinalidad) => el array de salida respeta ese orden.
  months_req AS (
    SELECT t.ord, date_trunc('month', t.m)::date AS month
    FROM pg_catalog.unnest(p_months) WITH ORDINALITY AS t(m, ord)
  ),
  -- Meses distintos + su periodo. El mes en curso corta en HOY (Santiago), R1/R10.
  months AS (
    SELECT DISTINCT
      mr.month,
      mr.month AS period_from,
      CASE
        WHEN mr.month = v_current_month THEN v_today
        ELSE (mr.month + interval '1 month')::date - 1
      END AS period_to
    FROM months_req mr
  ),

  -- ── UNA sola pasada sobre workout_logs (R2). Sin cota inferior: prev_max_kg necesita el
  --    historial completo anterior al primer mes pedido. El unico predicado sobre la columna es
  --    sargable (client_id + logged_at <), asi que es un range scan por
  --    idx_workout_logs_client_id_logged_at. ───────────────────────────────────────────────────
  logs AS (
    SELECT
      wl.id,
      wl.logged_at,
      -- timezone(...)::date SOLO acá (SELECT), nunca en el WHERE.
      (timezone('America/Santiago', wl.logged_at))::date                          AS local_day,
      date_trunc('month', timezone('America/Santiago', wl.logged_at))::date       AS month_bucket,
      wl.weight_kg,
      wl.reps_done,
      wl.plan_name_at_log,
      wp.title                                                                    AS plan_title,
      COALESCE(wb.exercise_id, wl.exercise_id)                                    AS exercise_id,
      COALESCE(e.name, 'Ejercicio')                                               AS exercise_name,
      COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')                         AS muscle_group,
      -- reps_eff VERBATIM de get_client_muscle_volume (R6/R27): regex defensiva, nunca jsonb_typeof.
      CASE
        WHEN wl.metadata ->> 'left_reps'  ~ '^[0-9]{1,4}$'
         AND wl.metadata ->> 'right_reps' ~ '^[0-9]{1,4}$'
        THEN (wl.metadata ->> 'left_reps')::int + (wl.metadata ->> 'right_reps')::int
        ELSE wl.reps_done
      END                                                                          AS reps_eff
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
    LEFT JOIN public.workout_plans  wp ON wp.id = wb.plan_id
    LEFT JOIN public.exercises      e  ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
    WHERE wl.client_id = p_client_id
      AND wl.logged_at < v_to
  ),
  -- Subconjunto de los meses pedidos (todo lo "del mes" sale de acá).
  scoped AS (
    SELECT l.* FROM logs l WHERE l.month_bucket = ANY (v_months)
  ),

  -- Dias entrenados: dia local distinto con al menos UN log (sin filtro de peso/reps).
  day_rows AS (
    SELECT s.month_bucket AS month, s.local_day
    FROM scoped s
    GROUP BY 1, 2
  ),
  day_agg AS (
    SELECT d.month,
           jsonb_agg(d.local_day ORDER BY d.local_day) AS training_days,
           count(*)::int                                AS training_days_count
    FROM day_rows d
    GROUP BY d.month
  ),
  -- sessions = count(distinct (dia_local, COALESCE(plan_name_at_log, wp.title))) — R10 verbatim.
  sess_agg AS (
    SELECT s.month_bucket AS month,
           count(DISTINCT (s.local_day, COALESCE(s.plan_name_at_log, s.plan_title)))::int AS sessions
    FROM scoped s
    GROUP BY 1
  ),
  -- Fallback de programa (R7): nombres de plan tal como quedaron congelados en el log.
  plan_names_agg AS (
    SELECT s.month_bucket AS month,
           jsonb_agg(DISTINCT s.plan_name_at_log) AS plan_names
    FROM scoped s
    WHERE s.plan_name_at_log IS NOT NULL
    GROUP BY 1
  ),

  -- Volumen por grupo (R6 verbatim: reps_eff + producto > 0). Sin redondear.
  vol_group AS (
    SELECT s.month_bucket AS month,
           s.muscle_group,
           SUM(s.weight_kg * s.reps_eff)::numeric AS volume
    FROM scoped s
    WHERE (COALESCE(s.weight_kg, 0) * COALESCE(s.reps_eff, 0)) > 0
    GROUP BY 1, 2
  ),
  vol_agg AS (
    SELECT g.month,
           SUM(g.volume)::numeric AS volume_total,
           jsonb_agg(
             jsonb_build_object('muscle_group', g.muscle_group, 'volume', g.volume)
             ORDER BY g.volume DESC, g.muscle_group ASC
           ) AS volume_by_group
    FROM vol_group g
    GROUP BY g.month
  ),

  -- ── Records. Predicado VERBATIM de get_client_exercise_prs (20260910205101). ────────────────
  pr_sets AS (
    SELECT l.*
    FROM logs l
    WHERE l.weight_kg IS NOT NULL
      AND l.weight_kg > 0
      AND l.reps_done IS NOT NULL
      AND l.reps_done > 0
      AND l.exercise_id IS NOT NULL
  ),
  -- Maximo por (ejercicio, mes) sobre TODO el historial, incluidos los meses NO pedidos:
  -- es lo que hace honesto a prev_max_kg.
  pr_month AS (
    SELECT DISTINCT ON (s.exercise_id, s.month_bucket)
      s.exercise_id,
      s.month_bucket,
      s.exercise_name,
      s.muscle_group,
      s.weight_kg  AS max_weight_kg,
      s.reps_done  AS reps_at_max,
      s.local_day  AS achieved_at
    FROM pr_sets s
    -- Desempate identico al de get_client_exercise_prs: peso desc, logged_at desc, id desc.
    ORDER BY s.exercise_id, s.month_bucket, s.weight_kg DESC, s.logged_at DESC, s.id DESC
  ),
  pr_prev AS (
    SELECT
      p.*,
      max(p.max_weight_kg) OVER (
        PARTITION BY p.exercise_id
        ORDER BY p.month_bucket
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS prev_max_kg
    FROM pr_month p
  ),
  pr_agg AS (
    SELECT p.month_bucket AS month,
           jsonb_agg(
             jsonb_build_object(
               'exercise_id',   p.exercise_id,
               'name',          p.exercise_name,
               'muscle_group',  p.muscle_group,
               'max_weight_kg', p.max_weight_kg,
               'reps_at_max',   p.reps_at_max,
               'achieved_at',   p.achieved_at,
               'prev_max_kg',   p.prev_max_kg
             )
             ORDER BY p.max_weight_kg DESC, p.exercise_name ASC
           ) AS prs
    FROM pr_prev p
    WHERE p.month_bucket = ANY (v_months)
    GROUP BY 1
  ),

  -- ── Check-ins del mes por created_at (R5). reviewed_at / reviewed_by NO viajan. ─────────────
  ci_rows AS (
    SELECT
      date_trunc('month', timezone('America/Santiago', c.created_at))::date AS month,
      c.id, c.created_at, c.weight, c.energy_level, c.notes, c.front_photo_url
    FROM public.check_ins c
    WHERE c.client_id = p_client_id
      AND c.created_at >= v_from
      AND c.created_at <  v_to
  ),
  ci_agg AS (
    SELECT r.month,
           jsonb_agg(
             jsonb_build_object(
               'id',              r.id,
               'created_at',      r.created_at,
               'weight',          r.weight,
               'energy_level',    r.energy_level,
               'notes',           r.notes,
               'front_photo_url', r.front_photo_url
             )
             ORDER BY r.created_at DESC
           ) AS check_ins
    FROM ci_rows r
    GROUP BY r.month
  ),

  -- ── Peso: ultimo check-in CON peso hasta el fin del periodo (puede caer FUERA del mes: el
  --    modelo lo detecta con last_at y escribe "ultimo check-in dd mmm", R15) + el peso
  --    inmediatamente anterior a ese. ───────────────────────────────────────────────────────
  weight_pick AS (
    SELECT
      m.month,
      lw.weight     AS last_kg,
      lw.created_at AS last_at,
      (
        SELECT c2.weight
        FROM public.check_ins c2
        WHERE c2.client_id = p_client_id
          AND c2.weight IS NOT NULL
          AND c2.created_at < lw.created_at
        ORDER BY c2.created_at DESC
        LIMIT 1
      ) AS prev_kg
    FROM months m
    LEFT JOIN LATERAL (
      SELECT c.weight, c.created_at
      FROM public.check_ins c
      WHERE c.client_id = p_client_id
        AND c.weight IS NOT NULL
        AND c.created_at < ((m.month + interval '1 month')::timestamp AT TIME ZONE 'America/Santiago')
      ORDER BY c.created_at DESC
      LIMIT 1
    ) lw ON true
  ),

  -- ── Programa del mes por FECHA (R7): solape con el periodo; desempate start_date desc,
  --    is_active, created_at desc. start_date NULL => no hay programa (fallback a los logs). ──
  prog AS (
    SELECT
      m.month, m.period_from, m.period_to,
      p.id            AS program_id,
      p.name          AS program_name,
      p.start_date,
      p.end_date,
      COALESCE(p.ab_mode, false)                    AS ab_mode,
      GREATEST(1, COALESCE(p.weeks_to_repeat, 1))   AS weeks_total
    FROM months m
    LEFT JOIN LATERAL (
      SELECT wp.id, wp.name, wp.start_date, wp.end_date, wp.ab_mode, wp.weeks_to_repeat
      FROM public.workout_programs wp
      WHERE wp.client_id = p_client_id
        AND wp.start_date IS NOT NULL
        AND wp.start_date <= m.period_to
        AND (wp.end_date IS NULL OR wp.end_date >= m.period_from)
      ORDER BY wp.start_date DESC, wp.is_active DESC, wp.created_at DESC, wp.id DESC
      LIMIT 1
    ) p ON true
  ),
  -- Dias del programa con AL MENOS un bloque (el JOIN con workout_blocks es el filtro).
  prog_days AS (
    SELECT
      pr.month,
      wp.id                            AS plan_id,
      wp.title,
      wp.day_of_week,
      COALESCE(wp.week_variant, 'A')   AS week_variant,
      count(wb.id)::int                AS block_count
    FROM prog pr
    JOIN public.workout_plans  wp ON wp.program_id = pr.program_id
    JOIN public.workout_blocks wb ON wb.plan_id    = wp.id
    GROUP BY pr.month, wp.id, wp.title, wp.day_of_week, wp.week_variant
  ),
  prog_days_agg AS (
    SELECT d.month,
           jsonb_agg(
             jsonb_build_object('title', d.title, 'day_of_week', d.day_of_week, 'block_count', d.block_count)
             ORDER BY d.day_of_week ASC NULLS LAST, d.week_variant ASC, d.title ASC
           ) AS days
    FROM prog_days d
    GROUP BY d.month
  ),
  -- Dias planificados por semana: count(distinct day_of_week); con ab_mode, promedio A/B redondeado.
  pw_by_variant AS (
    SELECT d.month, d.week_variant, count(DISTINCT d.day_of_week)::int AS days_cnt
    FROM prog_days d
    WHERE d.day_of_week IS NOT NULL
    GROUP BY 1, 2
  ),
  planned AS (
    SELECT
      pr.month,
      CASE
        WHEN pr.program_id IS NULL THEN NULL::int
        WHEN pr.ab_mode THEN
          COALESCE((SELECT round(avg(v.days_cnt))::int FROM pw_by_variant v WHERE v.month = pr.month), 0)
        ELSE
          COALESCE((SELECT count(DISTINCT d.day_of_week)::int
                      FROM prog_days d
                     WHERE d.month = pr.month AND d.day_of_week IS NOT NULL), 0)
      END AS planned_per_week,
      -- Dias del periodo efectivamente cubiertos por el programa (solape).
      CASE
        WHEN pr.program_id IS NULL THEN NULL::int
        ELSE GREATEST(
               0,
               (LEAST(pr.period_to, COALESCE(pr.end_date, pr.period_to))
                - GREATEST(pr.period_from, pr.start_date)) + 1
             )
      END AS covered_days
    FROM prog pr
  ),
  prog_json AS (
    SELECT
      pr.month,
      CASE WHEN pr.program_id IS NULL THEN NULL::jsonb ELSE
        jsonb_build_object(
          'id',          pr.program_id,
          'name',        pr.program_name,
          'start_date',  pr.start_date,
          'end_date',    pr.end_date,
          'weeks_total', pr.weeks_total,
          -- Semana del programa en la que cae cada extremo del periodo. Misma formula que la ficha
          -- (client-detail.service.ts:352-363): ceil(dias_transcurridos / 7), acotada a [1, total].
          'week_from',   GREATEST(1, LEAST(pr.weeks_total,
                           ceil(GREATEST(0, pr.period_from - pr.start_date)::numeric / 7)::int)),
          'week_to',     GREATEST(1, LEAST(pr.weeks_total,
                           ceil(GREATEST(0, pr.period_to   - pr.start_date)::numeric / 7)::int)),
          'days',        COALESCE(pda.days, '[]'::jsonb)
        )
      END AS program
    FROM prog pr
    LEFT JOIN prog_days_agg pda ON pda.month = pr.month
  ),

  -- ── Nutricion V2, SOLO LECTURA (R9). Version publicada vigente en el periodo, con el mismo
  --    desempate que get_nutrition_plan_read_v2 (20260728120500). ──────────────────────────────
  nutri_ver AS (
    SELECT m.month, v.plan_name
    FROM months m
    LEFT JOIN LATERAL (
      SELECT np.name AS plan_name
      FROM public.nutrition_plan_versions_v2 nv
      JOIN public.nutrition_plans_v2 np ON np.id = nv.plan_id
      WHERE np.client_id = p_client_id
        AND np.lifecycle_status = 'active'
        AND nv.status IN ('published', 'superseded')
        AND nv.effective_from <= m.period_to
        AND (nv.effective_to IS NULL OR nv.effective_to >= m.period_from)
      ORDER BY nv.effective_from DESC, nv.published_at DESC NULLS LAST,
               nv.version_number DESC, nv.id DESC
      LIMIT 1
    ) v ON true
  ),
  -- tracked_days = snapshots existentes (son lazy, R9). "En rango" = mismo criterio que la ficha:
  -- consumo/meta de energia entre 90 % y 110 % (resolveCoachDayAdherence tone='success'), con el
  -- consumo leido por private.nutrition_v2_intake_totals, igual que get_nutrition_history_page_v2.
  nutri_days AS (
    SELECT
      m.month,
      count(*)::int AS tracked_days,
      count(*) FILTER (
        WHERE s.target_calories IS NOT NULL
          AND s.target_calories > 0
          AND (t.consumed_calories / s.target_calories) >= 0.9
          AND (t.consumed_calories / s.target_calories) <= 1.1
      )::int AS in_range_days
    FROM months m
    JOIN public.nutrition_day_snapshots_v2 s
      ON s.client_id  = p_client_id
     AND s.local_date >= m.period_from
     AND s.local_date <= m.period_to
    CROSS JOIN LATERAL (
      SELECT COALESCE(
               (private.nutrition_v2_intake_totals(p_client_id, s.local_date) ->> 'calories')::numeric,
               0
             ) AS consumed_calories
    ) t
    GROUP BY m.month
  ),

  -- ── Ensamblado por mes ─────────────────────────────────────────────────────────────────────
  month_json AS (
    SELECT
      m.month,
      jsonb_build_object(
        'month',  m.month,
        'period', jsonb_build_object('from', m.period_from, 'to', m.period_to),
        'training_days',        COALESCE(da.training_days, '[]'::jsonb),
        'sessions',             COALESCE(sa.sessions, 0),
        'planned_days',         CASE
                                  WHEN pl.planned_per_week IS NULL THEN NULL
                                  ELSE round(pl.planned_per_week::numeric * pl.covered_days::numeric / 7)::int
                                END,
        'planned_per_week',     pl.planned_per_week,
        'volume_total',         COALESCE(va.volume_total, 0),
        'volume_by_group',      COALESCE(va.volume_by_group, '[]'::jsonb),
        'prs',                  COALESCE(pa.prs, '[]'::jsonb),
        'program',              pj.program,
        'plan_names_from_logs', COALESCE(pn.plan_names, '[]'::jsonb),
        'check_ins',            COALESCE(ca.check_ins, '[]'::jsonb),
        'weight',               CASE
                                  WHEN wk.last_at IS NULL THEN NULL::jsonb
                                  ELSE jsonb_build_object(
                                         'last_kg', wk.last_kg,
                                         'last_at', wk.last_at,
                                         'prev_kg', wk.prev_kg
                                       )
                                END,
        'nutrition',            CASE
                                  WHEN nv.plan_name IS NULL THEN NULL::jsonb
                                  ELSE jsonb_build_object(
                                         'plan_name',     nv.plan_name,
                                         'in_range_days', COALESCE(nd.in_range_days, 0),
                                         'tracked_days',  COALESCE(nd.tracked_days, 0)
                                       )
                                END
      ) AS payload
    FROM months m
    LEFT JOIN day_agg        da ON da.month = m.month
    LEFT JOIN sess_agg       sa ON sa.month = m.month
    LEFT JOIN plan_names_agg pn ON pn.month = m.month
    LEFT JOIN vol_agg        va ON va.month = m.month
    LEFT JOIN pr_agg         pa ON pa.month = m.month
    LEFT JOIN ci_agg         ca ON ca.month = m.month
    LEFT JOIN weight_pick    wk ON wk.month = m.month
    LEFT JOIN prog_json      pj ON pj.month = m.month
    LEFT JOIN planned        pl ON pl.month = m.month
    LEFT JOIN nutri_ver      nv ON nv.month = m.month
    LEFT JOIN nutri_days     nd ON nd.month = m.month
  )
  SELECT jsonb_build_object(
           'months',
           COALESCE(jsonb_agg(mj.payload ORDER BY mr.ord), '[]'::jsonb)
         )
    INTO v_result
    FROM months_req mr
    JOIN month_json mj ON mj.month = mr.month;

  RETURN COALESCE(v_result, jsonb_build_object('months', '[]'::jsonb));
END;
$function$;

-- Patron unico de grants (R4/R16 del tren de volumen): service_role EXPLICITO en el REVOKE (el
-- baseline lo grantea por default privileges) y repuesto en el GRANT.
REVOKE ALL ON FUNCTION public.get_client_month_reports(uuid, date[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_month_reports(uuid, date[]) TO authenticated, service_role;

-- Verificacion INMEDIATA de la ACL en la misma sesion.
-- Esperado: anon false, authenticated true, service_role true.
DO $verify$
DECLARE
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.get_client_month_reports(uuid, date[])', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_client_month_reports(uuid, date[])', 'EXECUTE'),
         has_function_privilege('service_role',  'public.get_client_month_reports(uuid, date[])', 'EXECUTE')
    INTO v_anon, v_auth, v_service;

  IF v_anon OR NOT v_auth OR NOT v_service THEN
    RAISE EXCEPTION
      'ACL inesperada en get_client_month_reports(uuid, date[]): anon=% (esperado false), authenticated=% (esperado true), service_role=% (esperado true)',
      v_anon, v_auth, v_service;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.get_client_month_reports(uuid, date[]) IS
  'Informe mensual del alumno para el export a PDF (specs/dossier-por-meses, R2/R10). Recibe hasta 24 primeros-de-mes y devuelve {"months":[...]} en el orden pedido: dias entrenados, sesiones, volumen por grupo (reps_eff por lado, mismo criterio que get_client_muscle_volume), records con prev_max_kg por window function sobre TODO el historial previo, programa del mes por fecha con fallback a plan_name_at_log, check-ins por created_at, peso ultimo/anterior y nutricion V2 de solo lectura. Zona America/Santiago hardcodeada; el mes en curso corta en hoy. Guard IDOR: propio, coach o pool; denegacion 42501. Array invalido o >24 meses: 22023.';

-- ============================================================================
-- 2) public.get_client_report_bounds(p_client_id uuid) -> jsonb  (R11)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_client_report_bounds(
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today         date;
  v_current_month date;
  v_first_day     date;
  v_first_month   date;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_report_bounds_invalid_client' USING errcode = '22023';
  END IF;

  -- Mismo guard de 3 vias que get_client_month_reports (R3/R11).
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RAISE EXCEPTION 'client_report_bounds_denied' USING errcode = '42501';
  END IF;

  v_today         := (timezone('America/Santiago', now()))::date;
  v_current_month := date_trunc('month', v_today)::date;

  -- least() ignora los NULL: basta con que exista una de las cuatro señales.
  -- subscription_start_date ya es date (sin hora) y no se reasigna de zona.
  SELECT LEAST(
           (timezone('America/Santiago', c.created_at))::date,
           c.subscription_start_date,
           (SELECT (timezone('America/Santiago', min(wl.logged_at)))::date
              FROM public.workout_logs wl WHERE wl.client_id = p_client_id),
           (SELECT (timezone('America/Santiago', min(ci.created_at)))::date
              FROM public.check_ins ci WHERE ci.client_id = p_client_id)
         )
    INTO v_first_day
    FROM public.clients c
   WHERE c.id = p_client_id;

  -- Sin fila de clients (alumno borrado) o sin ninguna señal: el selector arranca en el mes actual.
  v_first_month := COALESCE(date_trunc('month', COALESCE(v_first_day, v_today))::date, v_current_month);
  -- Una subscription_start_date futura no puede dejar el rango al reves.
  v_first_month := LEAST(v_first_month, v_current_month);

  RETURN jsonb_build_object(
    'first_month',   v_first_month,
    'current_month', v_current_month
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_client_report_bounds(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_report_bounds(uuid) TO authenticated, service_role;

DO $verify$
DECLARE
  v_anon boolean;
  v_auth boolean;
  v_service boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.get_client_report_bounds(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_client_report_bounds(uuid)', 'EXECUTE'),
         has_function_privilege('service_role',  'public.get_client_report_bounds(uuid)', 'EXECUTE')
    INTO v_anon, v_auth, v_service;

  IF v_anon OR NOT v_auth OR NOT v_service THEN
    RAISE EXCEPTION
      'ACL inesperada en get_client_report_bounds(uuid): anon=% (esperado false), authenticated=% (esperado true), service_role=% (esperado true)',
      v_anon, v_auth, v_service;
  END IF;
END
$verify$;

COMMENT ON FUNCTION public.get_client_report_bounds(uuid) IS
  'Rango de meses exportables del alumno (specs/dossier-por-meses, R11): {"first_month","current_month"} en America/Santiago. first_month = mes del menor entre clients.created_at, clients.subscription_start_date, el primer workout_log y el primer check-in, acotado al mes en curso. Guard IDOR: propio, coach o pool; denegacion 42501.';
