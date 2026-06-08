-- F5: prevent the orphan coach state where subscription_status='org_managed' but
-- active_org_id is NULL (workspace resolution + auth-hook claims break for such a coach).
-- Audited before applying: 0 existing offenders. The membership-existence invariant is
-- intentionally NOT enforced here (insert ordering makes it order-dependent); this guards
-- the main orphan case.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS coaches_org_managed_guard ON public.coaches;
--   DROP FUNCTION IF EXISTS public.coaches_org_managed_guard();

CREATE OR REPLACE FUNCTION public.coaches_org_managed_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.subscription_status = 'org_managed' AND NEW.active_org_id IS NULL THEN
    RAISE EXCEPTION 'invalid coach state: org_managed coach must have active_org_id set';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coaches_org_managed_guard ON public.coaches;
CREATE TRIGGER coaches_org_managed_guard
  BEFORE INSERT OR UPDATE ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.coaches_org_managed_guard();
