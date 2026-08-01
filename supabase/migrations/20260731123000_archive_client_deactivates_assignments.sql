-- Archived clients keep their history, but must not retain live assignments.
-- Forward-only and idempotent: the backfill repairs existing rows, while the trigger
-- protects future archive/assignment paths regardless of whether they come from web or RN.

UPDATE public.workout_programs AS wp
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE wp.client_id = c.id
  AND c.is_archived = true
  AND wp.is_active = true;

UPDATE public.nutrition_plans AS np
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE np.client_id = c.id
  AND c.is_archived = true
  AND np.is_active = true;

UPDATE public.nutrition_plan_cycles AS npc
SET is_active = false,
    updated_at = now()
FROM public.clients AS c
WHERE npc.client_id = c.id
  AND c.is_archived = true
  AND npc.is_active = true;

UPDATE public.nutrition_plans_v2 AS np2
SET lifecycle_status = 'archived',
    archived_at = COALESCE(np2.archived_at, now()),
    updated_at = now()
FROM public.clients AS c
WHERE np2.client_id = c.id
  AND c.is_archived = true
  AND np2.lifecycle_status = 'active';

CREATE OR REPLACE FUNCTION public.deactivate_archived_client_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_archived = true
     AND (TG_OP = 'INSERT' OR OLD.is_archived IS DISTINCT FROM NEW.is_archived) THEN
    UPDATE public.workout_programs
    SET is_active = false, updated_at = now()
    WHERE client_id = NEW.id AND is_active = true;

    UPDATE public.nutrition_plans
    SET is_active = false, updated_at = now()
    WHERE client_id = NEW.id AND is_active = true;

    UPDATE public.nutrition_plan_cycles
    SET is_active = false, updated_at = now()
    WHERE client_id = NEW.id AND is_active = true;

    UPDATE public.nutrition_plans_v2
    SET lifecycle_status = 'archived',
        archived_at = COALESCE(archived_at, now()),
        updated_at = now()
    WHERE client_id = NEW.id AND lifecycle_status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deactivate_archived_client_assignments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clients_deactivate_archived_assignments ON public.clients;
CREATE TRIGGER clients_deactivate_archived_assignments
AFTER INSERT OR UPDATE OF is_archived ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.deactivate_archived_client_assignments();

CREATE OR REPLACE FUNCTION public.prevent_archived_client_workout_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_archived_client_workout_program() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    NEW.lifecycle_status := 'archived';
    NEW.archived_at := COALESCE(NEW.archived_at, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan_v2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workout_programs_archived_client_guard ON public.workout_programs;
CREATE TRIGGER workout_programs_archived_client_guard
BEFORE INSERT OR UPDATE OF client_id, is_active ON public.workout_programs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_archived_client_workout_program();

DROP TRIGGER IF EXISTS nutrition_plans_archived_client_guard ON public.nutrition_plans;
CREATE TRIGGER nutrition_plans_archived_client_guard
BEFORE INSERT OR UPDATE OF client_id, is_active ON public.nutrition_plans
FOR EACH ROW
EXECUTE FUNCTION public.prevent_archived_client_nutrition_plan();

DROP TRIGGER IF EXISTS nutrition_plans_v2_archived_client_guard ON public.nutrition_plans_v2;
CREATE TRIGGER nutrition_plans_v2_archived_client_guard
BEFORE INSERT OR UPDATE OF client_id, lifecycle_status ON public.nutrition_plans_v2
FOR EACH ROW
EXECUTE FUNCTION public.prevent_archived_client_nutrition_plan_v2();

COMMENT ON FUNCTION public.deactivate_archived_client_assignments() IS
  'Preserves archived-client history while deactivating live workout and nutrition assignments.';
