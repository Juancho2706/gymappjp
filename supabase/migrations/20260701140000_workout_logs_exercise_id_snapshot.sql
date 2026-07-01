-- P1-3 — Hardening: snapshot inmutable de exercise_id en workout_logs para que el historial
-- SOBREVIVA VISIBLE al hard-delete de un ejercicio/bloque.
--
-- Contexto: la FK workout_logs.block_id pasó de ON DELETE CASCADE a ON DELETE SET NULL
-- (migración 20260630190000). Ahora borrar un bloque conserva el log con block_id=NULL, PERO
-- todo read que hace INNER JOIN a workout_blocks para resolver el ejercicio DESCARTA ese log
-- (deja de aparecer en ficha del coach, PRs, series, volumen, widgets del alumno).
--
-- Fix aditivo (sin pérdida, forward-only, idempotente):
--   1. Columna snapshot workout_logs.exercise_id (uuid, nullable).
--   2. TRIGGER BEFORE INSERT (SECURITY DEFINER) que la setea desde el bloque en CADA insert
--      (cubre web + mobile online + sync offline + cualquier cliente futuro, un solo lugar,
--      sin necesidad de GRANT de columna: el cliente nunca la escribe, la pone el trigger).
--   3. Backfill de las filas existentes desde workout_blocks (las que aún tienen block_id).
--   4. Índice parcial para los reads de fallback por exercise_id.
--   5. Reads-RPC que resuelven el ejercicio con COALESCE(wb.exercise_id, wl.exercise_id) y
--      LEFT JOIN en vez de INNER → los huérfanos vuelven a aparecer. Con 0 huérfanos HOY el
--      resultado es idéntico (behavior-preserving); solo cambia el comportamiento a futuro.
--
-- NOTA grants: workout_logs tiene GRANT de tabla a authenticated (no column-level). exercise_id
-- es set-once por el trigger (server-side), inmutable de facto; no requiere GRANT UPDATE(col).

-- 1. Columna snapshot -----------------------------------------------------------------------
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS exercise_id uuid;

-- 2. Trigger que la puebla en cada INSERT (si viene NULL y hay bloque) -----------------------
CREATE OR REPLACE FUNCTION public.set_workout_log_exercise_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.exercise_id IS NULL AND NEW.block_id IS NOT NULL THEN
    SELECT wb.exercise_id INTO NEW.exercise_id
    FROM public.workout_blocks wb
    WHERE wb.id = NEW.block_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workout_logs_set_exercise_id ON public.workout_logs;
CREATE TRIGGER trg_workout_logs_set_exercise_id
  BEFORE INSERT ON public.workout_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workout_log_exercise_id();

-- Es SOLO trigger: sacar el EXECUTE a PUBLIC/anon/authenticated para que PostgREST no la exponga
-- como RPC (/rest/v1/rpc/...). El trigger dispara igual (no depende del EXECUTE del invocador).
REVOKE ALL ON FUNCTION public.set_workout_log_exercise_id() FROM PUBLIC, anon, authenticated;

-- 3. Backfill de filas existentes (solo las que aún tienen bloque y no fueron backfilleadas) --
UPDATE public.workout_logs wl
SET exercise_id = wb.exercise_id
FROM public.workout_blocks wb
WHERE wl.block_id = wb.id
  AND wl.exercise_id IS NULL;

-- 4. Índice parcial para el fallback por exercise_id ----------------------------------------
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise_id_logged_at
  ON public.workout_logs (exercise_id, logged_at DESC)
  WHERE exercise_id IS NOT NULL;

-- 5. RPCs de progreso: resolver ejercicio con fallback al snapshot ---------------------------
--    Solo cambian las 3 que hacían INNER JOIN por block_id (exercise_prs, strength_series,
--    weekly_prs) + 1 línea en muscle_volume. activity_dates y daily_tonnage no tocan bloques.

-- ===== get_client_muscle_volume — COALESCE al snapshot en el join de exercises =====
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
    IF auth.uid() IS NULL OR NOT (
        p_client_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
        OR p_client_id IN (SELECT public.current_user_pool_client_ids())
    ) THEN RETURN; END IF;

    RETURN QUERY
    SELECT
        COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro') AS muscle_group,
        SUM(wl.weight_kg * wl.reps_done)::numeric           AS volume
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
    -- P1-3: si el bloque fue borrado (block_id NULL), resolver el músculo por el snapshot del log.
    LEFT JOIN public.exercises e       ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
    WHERE wl.client_id = p_client_id
      AND wl.logged_at >= now() - make_interval(days => p_days_back)
      AND (COALESCE(wl.weight_kg, 0) * COALESCE(wl.reps_done, 0)) > 0
    GROUP BY COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')
    ORDER BY volume DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_muscle_volume(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_muscle_volume(uuid, integer) TO authenticated, service_role;

-- ===== get_client_exercise_prs — LEFT JOIN + COALESCE al snapshot =====
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
  SELECT DISTINCT ON (COALESCE(wb.exercise_id, wl.exercise_id))
    COALESCE(wb.exercise_id, wl.exercise_id) AS exercise_id,
    COALESCE(e.name, 'Ejercicio')            AS name,
    COALESCE(e.muscle_group, '—')            AS muscle_group,
    wl.weight_kg                             AS max_weight_kg,
    COALESCE(wl.reps_done, 0)                AS reps_at_max
  FROM public.workout_logs wl
  LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
  LEFT JOIN public.exercises  e  ON e.id  = COALESCE(wb.exercise_id, wl.exercise_id)
  WHERE wl.client_id = p_client_id
    AND wl.weight_kg IS NOT NULL
    AND wl.weight_kg > 0
    AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
  ORDER BY COALESCE(wb.exercise_id, wl.exercise_id), wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_exercise_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_exercise_prs(uuid) TO authenticated, service_role;

-- ===== get_client_strength_series — sets CTE log-céntrica + COALESCE =====
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
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sets AS (
    -- P1-3: log-céntrica (antes: plans->blocks->logs con INNER JOIN). Ahora parte de workout_logs
    -- del cliente y resuelve el ejercicio por COALESCE(bloque, snapshot) → los huérfanos (bloque
    -- borrado, block_id NULL) siguen apareciendo. Con 0 huérfanos == resultado anterior.
    SELECT
      COALESCE(wb.exercise_id, wl.exercise_id)                  AS ex_id,
      COALESCE(NULLIF(e.name, ''), 'Ejercicio')                 AS ex_name,
      COALESCE(NULLIF(btrim(e.muscle_group), ''), '—')          AS ex_muscle,
      (timezone('America/Santiago', wl.logged_at))::date        AS dia,
      wl.weight_kg::numeric                                     AS w,
      wl.reps_done                                              AS r,
      round((wl.weight_kg::numeric * (1 + wl.reps_done::numeric / 30)) * 10) / 10 AS one_rm_r
    FROM public.workout_logs wl
    LEFT JOIN public.workout_blocks wb ON wb.id = wl.block_id
    LEFT JOIN public.exercises e  ON e.id = COALESCE(wb.exercise_id, wl.exercise_id)
    WHERE wl.client_id = p_client_id
      AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
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

-- ===== get_client_weekly_prs — strength_data CTE log-céntrica + COALESCE =====
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
  IF auth.uid() IS NULL OR NOT (
    p_client_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.coach_id = (SELECT auth.uid()))
    OR p_client_id IN (SELECT public.current_user_pool_client_ids())
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH wk AS (
    SELECT (date_trunc('week', (now() AT TIME ZONE 'America/Santiago')) AT TIME ZONE 'America/Santiago') AS week_start
  ),
  strength_data AS (
    -- P1-3: log-céntrica (antes: blocks->plans->logs con INNER JOIN). Resuelve el ejercicio por
    -- COALESCE(bloque, snapshot) → huérfanos visibles. Con 0 huérfanos == resultado anterior.
    SELECT
      COALESCE(b.exercise_id, l.exercise_id) AS ex_id,
      COALESCE(ex.name, 'Ejercicio') AS ex_name,
      COALESCE(NULLIF(btrim(ex.muscle_group), ''), '—') AS ex_muscle,
      l.weight_kg::float8 AS w,
      l.reps_done AS r,
      (l.weight_kg::float8 * (1.0 + l.reps_done::float8 / 30.0)) AS one_rm,
      CASE WHEN l.logged_at >= (SELECT week_start FROM wk) THEN 'in_week' ELSE 'before' END AS period
    FROM public.workout_logs l
    LEFT JOIN public.workout_blocks b ON b.id = l.block_id
    LEFT JOIN public.exercises ex ON ex.id = COALESCE(b.exercise_id, l.exercise_id)
    WHERE l.client_id = p_client_id
      AND COALESCE(b.exercise_id, l.exercise_id) IS NOT NULL
      AND l.weight_kg IS NOT NULL AND l.weight_kg > 0
      AND l.reps_done IS NOT NULL AND l.reps_done > 0 AND l.reps_done <= 30
  ),
  period_max AS (
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
    round(((pv.week_1rm - pv.before_1rm) / pv.before_1rm * 100.0)::numeric, 1)
  FROM pivot pv
  WHERE pv.week_1rm IS NOT NULL AND pv.before_1rm IS NOT NULL
    AND pv.week_1rm > 0 AND pv.before_1rm > 0
    AND pv.week_1rm > pv.before_1rm
  ORDER BY round(pv.week_1rm::numeric, 1) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_weekly_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_weekly_prs(uuid) TO authenticated, service_role;
