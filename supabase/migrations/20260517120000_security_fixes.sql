-- Security fixes for pre-existing advisor warnings
-- Applied to prod via: npx supabase db push

-- ─── 1. RLS on tables without it ───────────────────────────────────────────

-- Backup table: block all API access (no policies = deny all)
ALTER TABLE public.exercises_backup_20260405 ENABLE ROW LEVEL SECURITY;

-- Personal table unrelated to app: block all API access
ALTER TABLE public.personal_gastos ENABLE ROW LEVEL SECURITY;

-- ─── 2. check_ins: drop permissive catch-all policies ──────────────────────
-- Proper scoped policies already exist:
--   check_ins_client  → client_id = auth.uid()
--   check_ins_coach   → clients.coach_id = auth.uid()
-- The "Enable *" policies below make them redundant AND insecure.

DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.check_ins;

-- ─── 3. workout_sessions: drop permissive policies + add scoped ones ───────

DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.workout_sessions;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.workout_sessions;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.workout_sessions;

-- Client manages own sessions
CREATE POLICY "workout_sessions_client" ON public.workout_sessions
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Coach manages sessions of their clients
CREATE POLICY "workout_sessions_coach" ON public.workout_sessions
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = workout_sessions.client_id
        AND c.coach_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = workout_sessions.client_id
        AND c.coach_id = auth.uid()
    )
  );

-- ─── 4. Functions: fix mutable search_path ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE STRICT PARALLEL SAFE
  SET search_path = 'public'
AS $_$
  SELECT public.unaccent('public.unaccent', $1)
$_$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_foods(search_term text)
  RETURNS SETOF public.foods
  LANGUAGE plpgsql
  SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT *
    FROM public.foods
    WHERE name ILIKE '%' || search_term || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_current_streak(p_client_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  v_streak INTEGER := 0;
  v_last_date DATE;
  v_current_date DATE;
  v_activity_dates DATE[];
  v_date DATE;
BEGIN
  SELECT ARRAY_AGG(activity_date ORDER BY activity_date DESC)
  INTO v_activity_dates
  FROM (
    SELECT DATE(logged_at) AS activity_date
    FROM public.workout_logs
    WHERE client_id = p_client_id
    UNION
    SELECT dnl.log_date AS activity_date
    FROM public.nutrition_meal_logs nml
    JOIN public.daily_nutrition_logs dnl ON nml.daily_log_id = dnl.id
    WHERE dnl.client_id = p_client_id
      AND nml.is_completed = true
  ) sub;

  IF v_activity_dates IS NULL OR array_length(v_activity_dates, 1) = 0 THEN
    RETURN 0;
  END IF;

  v_current_date := CURRENT_DATE;

  IF v_activity_dates[1] < v_current_date - INTERVAL '1 day' THEN
    RETURN 0;
  END IF;

  v_last_date := v_activity_dates[1];
  v_streak := 1;

  FOR i IN 2..array_length(v_activity_dates, 1) LOOP
    v_date := v_activity_dates[i];
    IF v_date = v_last_date - INTERVAL '1 day' THEN
      v_streak := v_streak + 1;
      v_last_date := v_date;
    ELSIF v_date < v_last_date - INTERVAL '1 day' THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN v_streak;
END;
$$;
