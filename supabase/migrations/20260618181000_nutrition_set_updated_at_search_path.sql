-- F1 · Hardening: fija search_path inmutable en el trigger fn (advisor function_search_path_mutable).
-- Idempotente; corre despues de las migraciones que crearon la funcion sin search_path.
CREATE OR REPLACE FUNCTION public.nutrition_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;