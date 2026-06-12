-- RPCs de agregacion de progreso del alumno (Fase 2 #2-7). Plan optimizacion Supabase.
-- Reemplazan queries que bajaban miles de filas de workout_logs (limit 3000/4000 + getClientProfileData sin limit).
-- Guard 3-vias (cliente legacy/coach/pool). Paridad validada en BEGIN..ROLLBACK sobre datos reales.
-- strength_series/daily_tonnage agrupan dia en America/Santiago (corrige bug UTC, decision del dueno).
-- exercise_prs: peso del PR bit-perfect; reps_at_max determinista (la fuente JS era no-determinista).

-- ===== get_client_activity_dates [tz-esperada] =====
CREATE OR REPLACE FUNCTION public.get_client_activity_dates(p_client_id uuid, p_days_back integer)
RETURNS TABLE(day date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3-way SELECT guard replicating workout_logs SELECT policies: legacy client / coach owner / pool.
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT timezone('America/Santiago', wl.logged_at)::date AS day
  FROM public.workout_logs wl
  WHERE wl.client_id = p_client_id
    AND timezone('America/Santiago', wl.logged_at)::date
        >= (timezone('America/Santiago', now())::date - p_days_back)
  ORDER BY day;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_activity_dates(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_activity_dates(uuid, integer) TO authenticated, service_role;

-- ===== get_client_muscle_volume [exacta] =====
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
    -- (cliente legacy / coach dueño / pool de coaches).
    IF auth.uid() IS NULL OR NOT (
        p_client_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
        OR p_client_id IN (SELECT public.current_user_pool_client_ids())
    ) THEN RETURN; END IF;

    -- Paridad bit-a-bit con buildMuscleVolumeFromLogs (profileDataHelpers.ts:49-72)
    -- alimentado por volRes (client-detail.service.ts:264-268):
    --   mg  = workout_blocks?.exercises?.muscle_group?.trim() || 'Otro'
    --   w   = weight_kg ?? 0 ;  r = reps_done ?? 0 ;  add = w*r ; if (add <= 0) continue
    --   ventana = logged_at >= now() - 30d (instante, NO truncado a fecha) -> sin reasignacion TZ
    RETURN QUERY
    SELECT
        COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro') AS muscle_group,
        SUM(wl.weight_kg * wl.reps_done)::numeric           AS volume
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
    LEFT JOIN public.exercises e       ON e.id  = wb.exercise_id
    WHERE wl.client_id = p_client_id
      AND wl.logged_at >= now() - make_interval(days => p_days_back)
      AND (COALESCE(wl.weight_kg, 0) * COALESCE(wl.reps_done, 0)) > 0
    GROUP BY COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')
    ORDER BY volume DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_muscle_volume(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_muscle_volume(uuid, integer) TO authenticated, service_role;

-- ===== get_client_exercise_prs [fragil-revisar] =====
CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(p_client_id uuid)
RETURNS TABLE(
  exercise_id   uuid,
  name          text,
  muscle_group  text,
  max_weight_kg numeric,
  reps_at_max   integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (wb.exercise_id)
    wb.exercise_id                AS exercise_id,
    COALESCE(e.name, 'Ejercicio') AS name,
    COALESCE(e.muscle_group, '—') AS muscle_group,
    wl.weight_kg                  AS max_weight_kg,
    COALESCE(wl.reps_done, 0)     AS reps_at_max
  FROM public.workout_logs wl
  JOIN public.workout_blocks wb ON wb.id = wl.block_id
  LEFT JOIN public.exercises  e  ON e.id  = wb.exercise_id
  WHERE wl.client_id = p_client_id
    AND wl.weight_kg IS NOT NULL
    AND wl.weight_kg > 0
    AND wb.exercise_id IS NOT NULL
  ORDER BY wb.exercise_id, wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_exercise_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_exercise_prs(uuid) TO authenticated, service_role;

-- ===== get_client_strength_series [tz-esperada] =====
CREATE OR REPLACE FUNCTION public.get_client_strength_series(p_client_id uuid)
RETURNS TABLE(
  exercise_id   uuid,
  name          text,
  muscle_group  text,
  day           date,
  one_rm        numeric,
  weight_kg     numeric,
  reps_done     integer,
  total_volume  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3-way SELECT guard (mirrors workout_logs SELECT policies: legacy client / coach / pool)
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sets AS (
    SELECT
      wb.exercise_id                                            AS ex_id,
      COALESCE(NULLIF(e.name, ''), 'Ejercicio')                 AS ex_name,
      COALESCE(NULLIF(btrim(e.muscle_group), ''), '—')          AS ex_muscle,
      (timezone('America/Santiago', wl.logged_at))::date        AS dia,
      wl.weight_kg::numeric                                     AS w,
      wl.reps_done                                              AS r,
      round((wl.weight_kg::numeric * (1 + wl.reps_done::numeric / 30)) * 10) / 10 AS one_rm_r
    FROM public.workout_plans wp
    JOIN public.workout_blocks wb ON wb.plan_id = wp.id
    JOIN public.workout_logs   wl ON wl.block_id = wb.id
    LEFT JOIN public.exercises e  ON e.id = wb.exercise_id
    WHERE wp.client_id = p_client_id
      AND wl.weight_kg IS NOT NULL
      AND wl.weight_kg > 0
      AND wl.reps_done IS NOT NULL
      AND wl.reps_done > 0
  ),
  vol AS (
    SELECT ex_id, SUM(w * r) AS total_volume
    FROM sets
    GROUP BY ex_id
  ),
  day_best AS (
    SELECT DISTINCT ON (ex_id, dia)
      ex_id, ex_name, ex_muscle, dia, one_rm_r, w, r
    FROM sets
    ORDER BY ex_id, dia, one_rm_r DESC, w DESC
  )
  SELECT
    db.ex_id,
    db.ex_name,
    db.ex_muscle,
    db.dia,
    db.one_rm_r,
    db.w,
    db.r::integer,
    v.total_volume
  FROM day_best db
  JOIN vol v ON v.ex_id = db.ex_id
  ORDER BY db.ex_id, db.dia;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_strength_series(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_strength_series(uuid) TO authenticated, service_role;

-- ===== get_client_daily_tonnage [tz-esperada] =====
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
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN RETURN; END IF;

  RETURN QUERY
  WITH daily AS (
    SELECT
      (wl.logged_at AT TIME ZONE 'America/Santiago')::date AS d,
      round(sum(wl.weight_kg * wl.reps_done)) AS t
    FROM public.workout_logs wl
    WHERE wl.client_id = p_client_id
      AND wl.weight_kg > 0
      AND wl.reps_done > 0
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

REVOKE ALL ON FUNCTION public.get_client_daily_tonnage(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_daily_tonnage(uuid, integer) TO authenticated, service_role;

-- ===== get_client_weekly_prs [tz-esperada] =====
CREATE OR REPLACE FUNCTION public.get_client_weekly_prs(p_client_id uuid)
RETURNS TABLE(
  exercise_id   uuid,
  name          text,
  muscle_group  text,
  week_weight   numeric,
  week_reps     integer,
  week_1rm      numeric,
  before_weight numeric,
  before_reps   integer,
  before_1rm    numeric,
  pct_change    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 3-way SELECT guard: replica de las policies SELECT de workout_logs
  -- (cliente legacy = dueno / coach asignado / pool plano "team").
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH wk AS (
    -- "lunes" en zona America/Santiago, como instante UTC (timestamptz).
    -- Cambio TZ intencional vs el helper JS (que corre startOfWeek en UTC del server).
    SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Santiago')) AT TIME ZONE 'America/Santiago') AS week_start
  ),
  plans AS (
    SELECT wp.id FROM public.workout_plans wp WHERE wp.client_id = p_client_id
  ),
  strength_data AS (
    -- Replica del embed JS: plans -> workout_blocks(plan_id) -> exercises(exercise_id)
    --                              + workout_logs(block_id, SIN filtro por client_id).
    -- Filtro fuerza: weight_kg>0, reps_done en [1,30]. 1RM Epley en float8 (IEEE-754, == JS float64).
    SELECT
      b.exercise_id AS ex_id,
      COALESCE(ex.name, 'Ejercicio') AS ex_name,
      COALESCE(NULLIF(btrim(ex.muscle_group), ''), '—') AS ex_muscle,
      l.weight_kg::float8 AS w,
      l.reps_done AS r,
      (l.weight_kg::float8 * (1.0 + l.reps_done::float8 / 30.0)) AS one_rm,
      CASE WHEN l.logged_at >= (SELECT week_start FROM wk) THEN 'in_week' ELSE 'before' END AS period
    FROM public.workout_blocks b
    JOIN plans p ON b.plan_id = p.id
    JOIN public.workout_logs l ON l.block_id = b.id
    LEFT JOIN public.exercises ex ON ex.id = b.exercise_id
    WHERE b.exercise_id IS NOT NULL
      AND l.weight_kg IS NOT NULL AND l.weight_kg > 0
      AND l.reps_done IS NOT NULL AND l.reps_done > 0 AND l.reps_done <= 30
  ),
  period_max AS (
    -- Max 1RM por (ejercicio, periodo); tie-break: mayor 1RM, luego mayor peso (== JS).
    SELECT DISTINCT ON (s.ex_id, s.period)
      s.ex_id, s.ex_name, s.ex_muscle, s.period, s.one_rm, s.w, s.r
    FROM strength_data s
    WHERE s.one_rm > 0
    ORDER BY s.ex_id, s.period, s.one_rm DESC, s.w DESC
  ),
  pivot AS (
    SELECT
      pm.ex_id,
      max(pm.ex_name)   AS ex_name,
      max(pm.ex_muscle) AS ex_muscle,
      max(pm.one_rm) FILTER (WHERE pm.period = 'in_week') AS week_1rm,
      max(pm.w)      FILTER (WHERE pm.period = 'in_week') AS week_weight,
      max(pm.r)      FILTER (WHERE pm.period = 'in_week') AS week_reps,
      max(pm.one_rm) FILTER (WHERE pm.period = 'before')  AS before_1rm,
      max(pm.w)      FILTER (WHERE pm.period = 'before')  AS before_weight,
      max(pm.r)      FILTER (WHERE pm.period = 'before')  AS before_reps
    FROM period_max pm
    GROUP BY pm.ex_id
  )
  SELECT
    pv.ex_id,
    pv.ex_name,
    pv.ex_muscle,
    pv.week_weight::numeric,
    pv.week_reps::integer,
    round(pv.week_1rm::numeric, 1),
    pv.before_weight::numeric,
    pv.before_reps::integer,
    round(pv.before_1rm::numeric, 1),
    -- pct_change con 1RM crudo (sin redondear) == JS, 1 decimal.
    round(((pv.week_1rm - pv.before_1rm) / pv.before_1rm * 100.0)::numeric, 1)
  FROM pivot pv
  -- Solo si hubo mejora real y ambos periodos tienen 1RM>0 (== JS).
  WHERE pv.week_1rm IS NOT NULL AND pv.before_1rm IS NOT NULL
    AND pv.week_1rm > 0 AND pv.before_1rm > 0
    AND pv.week_1rm > pv.before_1rm
  -- Orden == JS: por newOneRm (el 1RM in-week redondeado) descendente.
  ORDER BY round(pv.week_1rm::numeric, 1) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_weekly_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_weekly_prs(uuid) TO authenticated, service_role;

