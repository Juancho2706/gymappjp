-- Seguridad check_ins (hallazgo auditoría 2026-07-07, colateral del fix del check-in gate):
-- la BASELINE crea cuatro policies abiertas para `authenticated` con USING (true) /
-- WITH CHECK (true) sobre public.check_ins — con ellas cualquier usuario logueado (alumno o
-- coach de cualquier cuenta) puede LEER, INSERTAR, MODIFICAR y BORRAR check-ins AJENOS
-- (peso, energía, notas y URLs de fotos = dato personal sensible). Las policies permisivas
-- se combinan con OR, así que estas cuatro anulan de facto el RLS de la tabla.
--
-- VERIFICADO EN PROD (pg_policies, 2026-07-07): las cuatro ya habían sido removidas en el
-- hardening previo — hoy prod sólo tiene check_ins_client (alumno, client_id = uid),
-- check_ins_coach (coach directo) y team_check_ins_member_all (coach de pool vía
-- current_user_pool_client_ids()). Este DROP IF EXISTS es NO-OP en prod, pero GARANTIZA el
-- drop en cualquier entorno que re-ejecute el historial desde la baseline (branches de
-- preview de Supabase, stacks locales, clones futuros), donde el agujero SÍ renacería.
--
-- Cambio de código acompañante (mismo PR): markCheckInReviewed/unmarkCheckInReviewed pasan
-- su UPDATE a service-role TRAS assertCoachClientReadAccess — check_ins_coach no cubre a un
-- coach team/pool para clientes con coach_id NULL (team_check_ins_member_all lo cubría en
-- prod, pero el write por service-role tras authz de app es más robusto e independiente del
-- sprawl de policies). El write sigue scoped por client_id.
--
-- Idempotente / forward-only: DROP POLICY IF EXISTS re-ejecuta sin error en cada replay.
-- No toca grants (limpieza de GRANT ALL a anon/authenticated = tarea aparte).

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.check_ins;
