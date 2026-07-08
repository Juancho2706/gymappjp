-- Seguridad check_ins (hallazgo auditoría 2026-07-07, colateral del fix del check-in gate):
-- la baseline dejó CUATRO policies abiertas para `authenticated` con USING (true) /
-- WITH CHECK (true) sobre public.check_ins — cualquier usuario logueado (alumno o coach de
-- cualquier cuenta) podía LEER, INSERTAR, MODIFICAR y BORRAR check-ins AJENOS (peso, energía,
-- notas y URLs de fotos = dato personal sensible). Como las policies permisivas se combinan
-- con OR, estas cuatro anulaban de facto el RLS de la tabla.
--
-- FIX: dropearlas. El acceso legítimo queda 100% cubierto por las policies scoped que ya
-- conviven en la tabla:
--   - alumno (ALL sobre lo propio): "Client can manage their own check-ins",
--     check_ins_client, client_manage_checkins  → client_id = auth.uid()
--   - coach directo (ALL sobre sus alumnos): check_ins_coach → clients.coach_id = auth.uid()
--   - coach lectura: "Coach can view their clients' check-ins", coaches_read_checkins
--   - service-role: bypassa RLS (inserta el check-in del form, borra en purgas, y desde este
--     cambio también el toggle reviewed_at/reviewed_by de coaches team/pool — ver
--     markCheckInReviewed/unmarkCheckInReviewed en client-detail.service.ts, que validan
--     scope en capa de app con assertCoachClientReadAccess ANTES del write).
--
-- Verificado en código (2026-07-07): ningún flujo `authenticated` dependía de las policies
-- abiertas — inserts del alumno van con client_id = auth.uid() (dashboard.actions.ts) o por
-- service-role (check-in.actions.ts); deletes por service-role (settings.actions.ts); el
-- único UPDATE authenticated (toggle reviewed) se migró a service-role en el mismo cambio.
--
-- Idempotente / forward-only: DROP POLICY IF EXISTS re-ejecuta sin error en cada replay del
-- historial. No toca grants (GRANT ALL a anon/authenticated queda neutralizado por RLS real;
-- limpieza de grants = tarea aparte).

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.check_ins;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON public.check_ins;
