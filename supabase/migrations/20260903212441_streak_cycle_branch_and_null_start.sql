-- Rama `cycle` de la racha (R1) + guard de `start_date IS NULL` (R2).
-- Tren "Ciclo real y por lado" (docs/specs/ciclo-real-y-por-lado/, DATA-SECURITY.md §1).
-- Antecesor directo: 20260723110000_streak_assigned_days_semantics.sql (reglas 1-7 en su cabecera).
--
-- QUE CAMBIA
--   a) `cycle`: en un programa con program_structure_type='cycle' NO existe "dia asignado".
--      workout_plans.day_of_week es el indice del ciclo 1..cycle_length, no ISODOW (ver
--      packages/schemas/workout.ts:184-256 y el CHECK de 20260826010459). Reglas para cycle:
--        - dia con >=1 log de un plan del programa cycle (ya empezado) = +1
--        - ningun dia individual corta
--        - corta SOLO una semana calendario Lun-Dom (America/Santiago) YA CERRADA con cero logs
--          de cualquier tipo, dentro del regimen de ciclo
--      El cursor "que dia del ciclo toca hoy" NO se calcula aca: vive en TS
--      (packages/workout-engine/cycle-cursor.ts, alimentado por buildCycleCompletions de
--      packages/workout-engine/cycle-completions.ts, R9). Postgres nunca reimplementa
--      deriveDayCompletion.
--   b) `start_date IS NULL` (programa flexible que el alumno todavia no empezo): deja de crear
--      regimen de asignacion y deja de asignar dias => cae en la regla 7 (todo dia entrenado suma,
--      ningun dia corta). Verificado en LIVE 2026-09-03: 0 de 120 programas activos de cliente
--      tienen start_date NULL, asi que este guard es 0-diff al aplicar y se vuelve el caso normal
--      recien con el deploy de "Inicio flexible" (D3 / R2). R13: solo los programas CREADOS O
--      ASIGNADOS DESPUES del deploy con start_date_flexible = true nacen con start_date NULL; los
--      50 activos que hoy tienen el flag conservan su fecha y nunca entran por este camino.
--
-- QUE NO CAMBIA: firma (uuid)->integer, flags, IDOR guard con bypass service-role, cap 730d, poda
-- de v_from, CTEs days/logdays/anylog/phase1/leftover_logs/missed_occurrences/phase2 y el loop. Los
-- grants se RE-DECLARAN al pie con el patron unico del tren (R16: REVOKE ... FROM PUBLIC, anon,
-- service_role antes del GRANT, y has_function_privilege inmediatamente despues del CREATE); aca el
-- GRANT repone service_role, del que depende el bypass de la ruta mobile de pulse (W6.9b). Los
-- batch get_clients_streaks_by_ids (20260612054000:9) y get_coach_clients_streaks
-- (00000000000001_baseline.sql:281) delegan en esta funcion y heredan la semantica sin tocarse.
--
-- CRITERIO DE SALIDA VERIFICADO EN LIVE ANTES DE APLICAR (2026-09-03, espejo public._streak_next en
-- tx-rollback, supabase/tests/streak_cycle_equivalence.sql): 109 clientes con logs en 730 d,
-- difs_weekly = 0 (91 clientes), difs_sin_programa = 0 (5), mixtos = 0, clientes_cycle = 13 con
-- cycle_con_cambio = 11 (la prueba no es vacua). Detalle en DATA-SECURITY.md §1.3.
--
-- Aditiva, forward-only, idempotente (CREATE OR REPLACE, sin DROP).
-- Rollback: re-aplicar verbatim el bloque CREATE OR REPLACE + COMMENT de
-- 20260723110000_streak_assigned_days_semantics.sql en un archivo nuevo <ts>_revert_*.sql.

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

-- Patron unico de grants del tren (R16). CREATE OR REPLACE ya conserva la ACL, pero se re-declara
-- para que el archivo sea autocontenido y para que el REVOKE liste EXPLICITAMENTE service_role: el
-- baseline hace ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO service_role
-- (00000000000001_baseline.sql:3815). Aca service_role se RE-GRANTEA a proposito: esta RPC es de
-- LECTURA y hoy se llama con service_role desde el servidor (ruta mobile de pulse), apoyada en el
-- bypass IDOR de auth.uid() IS NULL (W6.9b: service_role CON execute en get_client_current_streak).
REVOKE ALL ON FUNCTION public.get_client_current_streak(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_current_streak(uuid) TO authenticated, service_role;

-- Verificacion INMEDIATA de la ACL, en la MISMA transaccion que el CREATE. Si el estado no es el
-- esperado (anon false, authenticated true, service_role true) la migracion ABORTA y no se aplica.
DO $acl$
DECLARE
  v_anon boolean;
  v_auth boolean;
  v_srv  boolean;
BEGIN
  SELECT has_function_privilege('anon',          'public.get_client_current_streak(uuid)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.get_client_current_streak(uuid)', 'EXECUTE'),
         has_function_privilege('service_role',  'public.get_client_current_streak(uuid)', 'EXECUTE')
    INTO v_anon, v_auth, v_srv;

  IF v_anon IS DISTINCT FROM false
     OR v_auth IS DISTINCT FROM true
     OR v_srv  IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'get_client_current_streak: ACL inesperada (anon=%, authenticated=%, service_role=%); esperado (false, true, true)',
      v_anon, v_auth, v_srv;
  END IF;
END
$acl$;

COMMENT ON FUNCTION public.get_client_current_streak(uuid) IS
  'Racha diaria del alumno. WEEKLY (regla CEO 2026-07-22, sin cambios): asignado hecho = +1; asignado sin entrenar nada = corta (hoy no corta; recuperar no repara); dia libre recuperando un perdido de la misma semana Lun-Dom Santiago = +1; repeticion/sesion libre = neutro; asignado entrenando otra cosa = neutro. CYCLE (2026-09, R1): no hay dia asignado (day_of_week es indice de ciclo, no ISODOW); cada dia con log del programa suma +1; ningun dia individual corta; corta solo una semana Lun-Dom ya cerrada con cero logs. start_date NULL (programa flexible sin empezar) = no crea regimen: aplica la regla 7 (todo dia entrenado suma, nada corta). Nutricion FUERA. Dia = eva_santiago_day. Cap 730d. Guard IDOR con bypass service-role.';
