-- Cierre de la deuda del gate de archivado + guardas de asignacion ruidosas.
--
-- (1) `insert ... returning` sobre `clients`
-- El gate restrictivo de SELECT se evalua tambien sobre la fila recien insertada cuando el write
-- lleva RETURNING (`.insert().select()` de supabase-js). `student_data_read_gate(id)` resuelve
-- consultando `public.clients`, y esa fila todavia no es visible dentro del mismo comando, asi que
-- el RETURNING fallaba con 42501 aunque el INSERT fuera legitimo. La rama nueva `coach_id =
-- auth.uid()` se evalua contra las columnas de la fila (sin lookup), asi que funciona en RETURNING.
-- No amplia el acceso real: leer los alumnos propios ya lo permiten las policies permisivas de
-- scope (clients_standalone_coach_manage / clients_org_coach_*) y, para archivados, la rama
-- `nutrition_v2_can_manage_client` de este mismo gate.
--
-- (2) Guardas de asignacion
-- `prevent_archived_client_*` forzaban en SILENCIO `is_active := false` / `lifecycle_status :=
-- 'archived'`: asignar trabajo a un alumno archivado "funcionaba" y devolvia una fila inactiva que
-- nadie veia. Ahora falla fuerte (42501) SOLO cuando se intenta dejar la asignacion ACTIVA. Apagar
-- sigue permitido, que es lo que hace el trigger de archivado y su backfill.

DROP POLICY IF EXISTS archive_gate_clients_select ON public.clients;

CREATE POLICY archive_gate_clients_select ON public.clients
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    private.student_data_read_gate(id)
    -- El alumno bloqueado conserva la lectura de SU ficha para poder ver la pantalla de cuenta
    -- suspendida (proxy y login la necesitan); sus datos siguen cerrados en las demas tablas.
    OR id = (SELECT auth.uid())
    -- Coach dueño de la fila: habilita el RETURNING del alta de alumno.
    OR coach_id = (SELECT auth.uid())
  );

CREATE OR REPLACE FUNCTION public.prevent_archived_client_workout_program()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND NEW.is_active IS TRUE
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    RAISE EXCEPTION 'client_archived_cannot_assign_workout_program'
      USING errcode = '42501',
            hint = 'Desarchiva al alumno antes de asignarle un programa.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND NEW.is_active IS TRUE
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    RAISE EXCEPTION 'client_archived_cannot_assign_nutrition_plan'
      USING errcode = '42501',
            hint = 'Desarchiva al alumno antes de asignarle un plan de nutricion.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND NEW.is_active IS TRUE
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived is true) THEN
    RAISE EXCEPTION 'client_archived_cannot_assign_nutrition_cycle'
      USING errcode = '42501',
            hint = 'Desarchiva al alumno antes de activarle un ciclo de nutricion.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_archived_client_nutrition_plan_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND NEW.lifecycle_status = 'active'
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_archived = true) THEN
    RAISE EXCEPTION 'client_archived_cannot_activate_nutrition_plan_v2'
      USING errcode = '42501',
            hint = 'Desarchiva al alumno antes de publicarle un plan de nutricion.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_archived_client_workout_program() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan_cycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_archived_client_nutrition_plan_v2() FROM PUBLIC, anon, authenticated;
