-- Aditiva, forward-only, idempotente. Aplicada a PROD 2026-07-01 via MCP apply_migration
-- (protocolo aditivo-en-LIVE: columna nullable, cero riesgo a filas existentes → todas sex=NULL).
-- Desbloquea IMC/TDEE (Mifflin-St Jeor) en la ficha del coach (write-path "Editar biometría").
ALTER TABLE public.client_intake
  ADD COLUMN IF NOT EXISTS sex text
  CHECK (sex IS NULL OR sex IN ('male', 'female', 'other'));

-- Grant de columna explícito (belt-and-suspenders sobre el grant de tabla existente, por el
-- gotcha compra-only: toda columna nueva editable user-scoped exige GRANT en la MISMA migración).
GRANT SELECT (sex), INSERT (sex), UPDATE (sex) ON public.client_intake TO authenticated;

COMMENT ON COLUMN public.client_intake.sex IS 'Sexo biologico para BMR/TDEE (Mifflin-St Jeor). male|female|other|NULL. Editable por el coach (policy client_intake_coach) y el alumno (client_intake_client).';
