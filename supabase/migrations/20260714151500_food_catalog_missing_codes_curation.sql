-- Permite a coaches/equipos resolver códigos faltantes de alumnos bajo su scope.
-- Aplicada en Supabase project `constant` (jikjeokundmaafuytdcx) el 2026-07-14.
-- Políticas aditivas; el alumno conserva su policy existente.

DROP POLICY IF EXISTS food_catalog_missing_codes_coach_update
  ON public.food_catalog_missing_codes;
CREATE POLICY food_catalog_missing_codes_coach_update
  ON public.food_catalog_missing_codes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = food_catalog_missing_codes.client_id
        AND c.coach_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = food_catalog_missing_codes.client_id
        AND c.coach_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS food_catalog_missing_codes_team_update
  ON public.food_catalog_missing_codes;
CREATE POLICY food_catalog_missing_codes_team_update
  ON public.food_catalog_missing_codes
  FOR UPDATE TO authenticated
  USING (client_id IN (SELECT current_user_pool_client_ids()))
  WITH CHECK (client_id IN (SELECT current_user_pool_client_ids()));

CREATE INDEX IF NOT EXISTS food_catalog_missing_codes_unresolved_idx
  ON public.food_catalog_missing_codes (last_seen_at DESC)
  WHERE resolved_at IS NULL;
