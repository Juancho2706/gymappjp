-- F1 · Micronutrientes basicos + medida casera en foods (ADITIVO, nullable, forward-only).
-- foods tiene GRANT UPDATE a nivel de TABLA (no allowlist de columna): las columnas nuevas
-- heredan el permiso de UPDATE -> NO requieren GRANT UPDATE(col). La RLS existente
-- (foods_update_own: coach_id = auth.uid()) ya restringe quien las edita.
-- Sin defaults => filas existentes quedan en NULL; el codigo actual las ignora.

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS fiber_g numeric,
  ADD COLUMN IF NOT EXISTS sodium_mg numeric,
  ADD COLUMN IF NOT EXISTS sugar_g numeric,
  ADD COLUMN IF NOT EXISTS saturated_fat_g numeric,
  ADD COLUMN IF NOT EXISTS unsaturated_fat_g numeric,
  ADD COLUMN IF NOT EXISTS household_grams numeric,
  ADD COLUMN IF NOT EXISTS household_label text;

COMMENT ON COLUMN public.foods.fiber_g IS 'F1 micros: fibra (g), misma base que las macros del alimento (nullable)';
COMMENT ON COLUMN public.foods.sodium_mg IS 'F1 micros: sodio (mg) (nullable)';
COMMENT ON COLUMN public.foods.sugar_g IS 'F1 micros: azucar (g) (nullable)';
COMMENT ON COLUMN public.foods.saturated_fat_g IS 'F1 micros: grasa saturada (g) (nullable)';
COMMENT ON COLUMN public.foods.unsaturated_fat_g IS 'F1 micros: grasa insaturada (g) (nullable)';
COMMENT ON COLUMN public.foods.household_grams IS 'F1 medida casera: gramos equivalentes de la medida casera (nullable)';
COMMENT ON COLUMN public.foods.household_label IS 'F1 medida casera: etiqueta ej "1 taza", "1 palma" (display sobre gramos, nullable, aprox)';
