-- B-7: invite codes that ENCODE SCOPE.
-- coaches.invite_code stays the STANDALONE code. organization_members.invite_code is a
-- NEW per-(coach,org) ENTERPRISE code. A dual coach therefore has two distinct codes.
--
-- Global uniqueness: generate_unique_invite_code() retries until the code exists in
-- NEITHER coaches.invite_code NOR organization_members.invite_code, so a newly generated
-- enterprise code can never collide with any code that already exists anywhere.
--
-- Safe/additive: nullable column + new function + partial unique index + backfill of
-- existing active coach members. Does NOT touch the live coaches signup trigger.
-- New enterprise codes are set by the app (createEnterpriseCoachAction / inviteCoachAction).
--
-- Rollback:
--   DROP INDEX IF EXISTS public.org_members_invite_code_unique;
--   DROP FUNCTION IF EXISTS public.generate_unique_invite_code();
--   ALTER TABLE public.organization_members DROP COLUMN IF EXISTS invite_code;

ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS invite_code text;

CREATE OR REPLACE FUNCTION public.generate_unique_invite_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- same charset as generate_invite_code (no O/0/I/1)
  code  text;
  i     int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE invite_code = code)
       AND NOT EXISTS (SELECT 1 FROM public.organization_members WHERE invite_code = code) THEN
      RETURN code;
    END IF;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS org_members_invite_code_unique
  ON public.organization_members (invite_code)
  WHERE invite_code IS NOT NULL AND deleted_at IS NULL;

-- Backfill existing active coach members one row at a time (function checks committed
-- state, so per-row avoids intra-statement duplicates).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.organization_members
    WHERE role = 'coach' AND invite_code IS NULL AND deleted_at IS NULL
  LOOP
    UPDATE public.organization_members
    SET invite_code = public.generate_unique_invite_code()
    WHERE id = r.id;
  END LOOP;
END $$;
