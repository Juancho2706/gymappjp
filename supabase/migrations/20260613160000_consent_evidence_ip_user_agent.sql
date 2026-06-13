-- Ley 21.719: evidencia del consentimiento (IP + User-Agent del titular al otorgar/revocar).
-- Aditiva, columnas nullable text (histórico previo queda NULL). Sin cambio de RLS ni grants:
-- el INSERT/UPDATE de client_consents ya está gobernado por sus policies; agregar columnas
-- nullable no revoca nada. La captura se cablea en consent.actions (grant).
ALTER TABLE public.client_consents
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

COMMENT ON COLUMN public.client_consents.ip_address IS 'IP del titular al otorgar/revocar (evidencia Ley 21.719). Nullable: registros previos sin captura.';
COMMENT ON COLUMN public.client_consents.user_agent IS 'User-Agent del titular al otorgar/revocar (evidencia Ley 21.719). Nullable.';
