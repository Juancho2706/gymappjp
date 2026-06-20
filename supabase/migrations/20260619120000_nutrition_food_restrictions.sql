-- A2/A3 · Modelo de restricciones alimentarias (alergia / intolerancia) sobre client_food_preferences.
-- ADITIVO + idempotente + forward-only. NO agrega columnas (no cambia database.types): extiende la
-- taxonomia de `preference_type` y habilita al coach-dueno a ESCRIBIR las preferencias/restricciones
-- de SUS alumnos (hoy solo SELECTea). El PlanBuilder usa estas filas para advertir/bloquear alergenos
-- al armar el plan (exclusion dura con override deliberado). El alumno sigue auto-reportando.

-- 1) Extender la taxonomia: favorite/dislike (legacy) + allergy/intolerance (nuevo). Las filas
--    existentes son favorite/dislike => pasan el CHECK nuevo (superset). Drop-if-exists => idempotente.
ALTER TABLE public.client_food_preferences
  DROP CONSTRAINT IF EXISTS client_food_preferences_preference_type_check;
ALTER TABLE public.client_food_preferences
  ADD CONSTRAINT client_food_preferences_preference_type_check
  CHECK (preference_type = ANY (ARRAY['favorite'::text, 'dislike'::text, 'allergy'::text, 'intolerance'::text]));

-- 2) Coach-dueno: read + write de las preferencias de SUS alumnos. Reemplaza la policy de SOLO
--    lectura "coach read client prefs" por una FOR ALL (consolida -> no agrega un permissive SELECT
--    duplicado). Usa (SELECT auth.uid()) para el initplan-optimizado. El alumno ("client own prefs")
--    y el team ("team_client_food_prefs_member_all") conservan sus policies FOR ALL intactas.
DROP POLICY IF EXISTS "coach read client prefs" ON public.client_food_preferences;
DROP POLICY IF EXISTS "coach manage client prefs" ON public.client_food_preferences;
CREATE POLICY "coach manage client prefs" ON public.client_food_preferences
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_food_preferences.client_id
      AND c.coach_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id = client_food_preferences.client_id
      AND c.coach_id = (SELECT auth.uid())
  ));
