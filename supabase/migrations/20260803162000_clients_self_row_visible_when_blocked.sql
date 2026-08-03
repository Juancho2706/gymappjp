-- Alumno archivado/pausado: la pantalla "cuenta suspendida" de la web quedo inalcanzable.
--
-- El gate de archivado (20260801023414) esconde tambien la PROPIA fila `clients` del alumno
-- bloqueado. La web la lee user-scoped en dos puntos y depende de ella para explicar el estado:
--   - `proxy.ts` (verificacion de alumno del coach): fila null => rebota a /login y jamas llega
--     al redirect a /c/[coach]/suspended?reason=archived|paused.
--   - `login.actions.ts`: fila null => "No tienes acceso a esta plataforma." en vez de los
--     mensajes de cuenta pausada/archivada.
--
-- Fix: el SELECT restrictivo deja pasar la fila propia. El alumno bloqueado vuelve a ver SOLO su
-- registro `clients` (nombre, email, flags de estado) — dato suyo que la app ya le expone en RN
-- via /api/mobile/auth/account-status. Todo lo demas queda igual: sus datos de entrenamiento,
-- nutricion y check-ins siguen cerrados por el mismo gate en sus tablas, y UPDATE/DELETE sobre
-- `clients` siguen exigiendo el gate completo (un bloqueado no puede editarse la ficha).

DROP POLICY IF EXISTS archive_gate_clients_select ON public.clients;

CREATE POLICY archive_gate_clients_select ON public.clients
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    private.student_data_read_gate(id)
    OR id = (SELECT auth.uid())
  );
