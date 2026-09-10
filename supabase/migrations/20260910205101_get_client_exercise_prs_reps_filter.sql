-- Cuenta atras en pantalla (specs/cuenta-atras-en-pantalla, R4 / A4): get_client_exercise_prs deja de
-- tratar una serie SIN repeticiones como record del ejercicio. Cuerpo copiado VERBATIM de LIVE con
-- pg_get_functiondef(oid) el 2026-09-10; el UNICO cambio es la linea marcada CAMBIO 1.
-- Motivo: con FUERZA POR TIEMPO (reps_unit='sec') el log lleva reps_done NULL y actual_hold_sec, y sin
-- este filtro un wall sit de 20 kg aparece como "20 kg x 0 reps". Ademas corrige un caso PREEXISTENTE:
-- 617 filas (25 alumnos) con peso y sin reps; 72 pares (alumno, ejercicio) encabezados hoy por una de
-- ellas (48 de esos pares no tienen ninguna serie valida del ejercicio y dejan de listarse).
-- Alinea la funcion con sus tres hermanas: get_client_strength_series, get_client_weekly_prs y
-- get_client_daily_tonnage ya exigen reps > 0.
-- Rollback documentado: re-aplicar en un archivo NUEVO el cuerpo previo (sin la linea CAMBIO 1),
-- disponible en DATA-TESTING.md 2.2 de esta spec. No toca filas ni ACL.

CREATE OR REPLACE FUNCTION public.get_client_exercise_prs(p_client_id uuid)
 RETURNS TABLE(exercise_id uuid, name text, muscle_group text, max_weight_kg numeric, reps_at_max integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- CAMBIO 1: una serie sin repeticiones no es un record (fuerza por tiempo escribe reps_done NULL).
    AND wl.reps_done IS NOT NULL
    AND wl.reps_done > 0
    AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL
  ORDER BY COALESCE(wb.exercise_id, wl.exercise_id), wl.weight_kg DESC, wl.logged_at DESC, wl.id DESC;
END;
$function$;

-- ACL: CREATE OR REPLACE la preserva; se re-afirma para dejarla explicita en el archivo.
REVOKE ALL ON FUNCTION public.get_client_exercise_prs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_exercise_prs(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_exercise_prs(uuid) IS
  'Record de peso por ejercicio del alumno. Solo considera series con reps_done > 0: las series por TIEMPO (reps_unit=sec, actual_hold_sec) no son record de peso (A4 de specs/cuenta-atras-en-pantalla).';
