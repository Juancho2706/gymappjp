-- P0 2026-08-03: crear alumnos estaba roto para TODOS los coaches (web y movil) desde el
-- 2026-08-01 (migracion 20260801023414). La policy RESTRICTIVE `archive_gate_clients` se creo
-- FOR ALL, asi que su WITH CHECK tambien corria en INSERT: `private.student_data_read_gate(id)`
-- busca la fila en public.clients, que en el INSERT todavia no es visible en el mismo comando
-- => siempre false => 42501 "new row violates row-level security policy".
--
-- Fix: el gate de archivado se mantiene igual en SELECT/UPDATE/DELETE y se retira de INSERT,
-- donde no aporta (un alumno recien creado no puede estar archivado ni suspendido). Los techos
-- reales del INSERT siguen siendo las policies permisivas de scope
-- (clients_standalone_coach_manage / clients_org_coach_insert / team_clients_member_all).

DROP POLICY IF EXISTS archive_gate_clients ON public.clients;

CREATE POLICY archive_gate_clients_select ON public.clients
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.student_data_read_gate(id));

CREATE POLICY archive_gate_clients_update ON public.clients
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.student_data_read_gate(id))
  WITH CHECK (private.student_data_read_gate(id));

CREATE POLICY archive_gate_clients_delete ON public.clients
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.student_data_read_gate(id));
