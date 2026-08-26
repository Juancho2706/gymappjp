-- FCN W3.0: la señal de correo verificado. Con W3.1 (email_confirm: true en el alta free),
-- auth.users.email_confirmed_at nace seteada para todos y deja de distinguir a nadie: la
-- prueba real de la casilla pasa a vivir acá, escrita SOLO por service_role.
-- Aplicada en LIVE el 2026-08-26 vía MCP (dry-run BEGIN/ROLLBACK previo: backfill 65/65
-- esperados sobre 68 filas; los 3 sin llenar son los pending_email sin confirmar).
ALTER TABLE public.coaches ADD COLUMN email_verified_at timestamptz;

COMMENT ON COLUMN public.coaches.email_verified_at IS
  'Prueba de que la CASILLA de correo funciona (verifyOtp OK o alta via Google), no de identidad. Sin GRANT UPDATE a authenticated/anon A PROPOSITO: coaches es default-deny por columna (20260612140000) y esta columna solo la escribe service_role. NULL = nadie probo nunca esa casilla (el banner de verificacion blanda y la higiene del drip leen esto, jamas auth.users.email_confirmed_at).';

-- Backfill: las filas existentes que confirmaron por link si probaron la casilla.
UPDATE public.coaches c SET email_verified_at = u.email_confirmed_at
FROM auth.users u WHERE u.id = c.id AND u.email_confirmed_at IS NOT NULL;
