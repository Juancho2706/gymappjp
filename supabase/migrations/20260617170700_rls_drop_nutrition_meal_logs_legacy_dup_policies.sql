-- Audit DB 2026-06-17: 2 policies legacy redundantes en nutrition_meal_logs (cmd ALL OR-evaluado por fila).
-- "Client can manage their own meal logs" (public, client self) -> cubierta por nutrition_meal_logs_client_all
--   y por nutrition_meal_logs_access (rama d.client_id=auth.uid()).
-- "Coach can view their clients' meal logs" (public SELECT, coach vía clients.coach_id) -> cubierta por
--   nutrition_meal_logs_access (rama EXISTS clients c WHERE c.coach_id=auth.uid(), cmd ALL incluye SELECT).
-- Se MANTIENE nutrition_meal_logs_coach_select (coach vía nutrition_plans.coach_id = OTRO join path, NO duplicado).
-- Validado con harness de visibilidad (alumno self / coach dueño / otro coach / pool coach): conteo de filas
-- visibles idéntico antes y después de los 2 DROP -> 0 cambios de acceso. Idempotente (IF EXISTS), forward-only.
DO $g$
DECLARE
  v_users text[] := ARRAY[
    'bb2dd8bd-142d-48e1-9bfa-b0f351d0ff3b',
    '503412d0-77cc-4c7e-b1c2-dec81fb00ce6',
    'eb64b0cf-c4bc-4dd7-8e1a-605ecdd6f4c5',
    '405f1a98-dcdc-4c27-bc2d-f4dbaacb77aa'
  ];
  v_uid text; v_cnt bigint; v_mism text := '';
BEGIN
  CREATE TEMP TABLE _vmh(phase text, uid text, n bigint) ON COMMIT DROP;
  FOREACH v_uid IN ARRAY v_users LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.nutrition_meal_logs' INTO v_cnt;
    EXECUTE 'RESET ROLE';
    INSERT INTO _vmh VALUES('before', v_uid, v_cnt);
  END LOOP;

  DROP POLICY IF EXISTS "Client can manage their own meal logs" ON public.nutrition_meal_logs;
  DROP POLICY IF EXISTS "Coach can view their clients' meal logs" ON public.nutrition_meal_logs;

  FOREACH v_uid IN ARRAY v_users LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_uid,'role','authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'SELECT count(*) FROM public.nutrition_meal_logs' INTO v_cnt;
    EXECUTE 'RESET ROLE';
    INSERT INTO _vmh VALUES('after', v_uid, v_cnt);
  END LOOP;

  SELECT string_agg(format('%s %s->%s', left(b.uid,8), b.n, a.n), ' | ')
    INTO v_mism
  FROM _vmh b JOIN _vmh a ON a.uid=b.uid AND a.phase='after'
  WHERE b.phase='before' AND b.n IS DISTINCT FROM a.n;
  IF v_mism IS NOT NULL AND v_mism <> '' THEN
    RAISE EXCEPTION 'ABORT visibilidad cambió: %', v_mism;
  END IF;
END $g$;
