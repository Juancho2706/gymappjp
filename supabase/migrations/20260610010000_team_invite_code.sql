-- A.bis2: código de invitación del TEAM — los alumnos se unen al POOL por /join/[code]
-- (espejo de coaches.invite_code y organization_members.invite_code). Aditivo/idempotente.
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS invite_code text;
CREATE UNIQUE INDEX IF NOT EXISTS teams_invite_code_uidx
  ON public.teams (invite_code) WHERE invite_code IS NOT NULL AND deleted_at IS NULL;

-- El generador global ahora garantiza unicidad sobre los TRES espacios de códigos.
-- (Misma forma que 20260608160000: sin SECURITY DEFINER, search_path vacío, refs calificadas.)
CREATE OR REPLACE FUNCTION public.generate_unique_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  text;
  i     int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE invite_code = code)
       AND NOT EXISTS (SELECT 1 FROM public.organization_members WHERE invite_code = code)
       AND NOT EXISTS (SELECT 1 FROM public.teams WHERE invite_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

-- Backfill: todo team vivo sin código recibe uno (idempotente, por fila).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.teams WHERE invite_code IS NULL AND deleted_at IS NULL LOOP
    UPDATE public.teams SET invite_code = public.generate_unique_invite_code() WHERE id = r.id;
  END LOOP;
END $$;
