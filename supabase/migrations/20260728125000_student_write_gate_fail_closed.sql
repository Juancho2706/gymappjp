-- ============================================================================
-- EVA — NUT-033: `private.student_write_allowed` deja de fallar ABIERTO
-- ----------------------------------------------------------------------------
-- ############################################################################
-- ## AUDITORIA OBLIGATORIA EN LIVE ANTES DE APLICAR ESTA MIGRACION          ##
-- ## (read-only, con OK explicito del owner; NO va DDL a ciegas)            ##
-- ##                                                                        ##
-- ##   -- 1) Coaches que hoy pasan por fail-open y con este fix CIERRAN:     ##
-- ##   select c.id, c.subscription_status, c.current_period_end,            ##
-- ##          c.paid_access_ended_at,                                       ##
-- ##          (select count(*) from public.clients cl                       ##
-- ##            where cl.coach_id = c.id and cl.is_archived is not true) as alumnos
-- ##   from public.coaches c                                                ##
-- ##   where c.current_period_end is null                                   ##
-- ##     and c.paid_access_ended_at is null                                 ##
-- ##     and c.subscription_status in                                       ##
-- ##         ('canceled','trialing','paused','past_due','pending_payment'); ##
-- ##                                                                        ##
-- ##   -- 2) Alumnos org-managed (coach_id null) hoy invisibles al gate:    ##
-- ##   select count(*) from public.clients                                  ##
-- ##   where coach_id is null and (is_archived is true or is_active is false);
-- ##                                                                        ##
-- ## POLITICA DE SANEO: si (1) devuelve filas, hacer PRIMERO el backfill de  ##
-- ## `paid_access_ended_at` (= current_period_end, o la fecha real de corte) ##
-- ## para esos coaches; recien despues aplicar la migracion. Si no, sus      ##
-- ## alumnos pasan a solo-lectura de golpe. Los coaches free con             ##
-- ## subscription_status = 'active' (default de baseline:900) NO se ven      ##
-- ## afectados: caen en el `else true` de coach_has_effective_access         ##
-- ## (20260718120000:91-92).                                                 ##
-- ############################################################################
--
-- Problema (auditoria 2026-07-28, verificacion G4B), sobre la definicion viva
-- 20260719190000:9-27:
--   Caso 2: `join public.coaches co on co.id = cl.coach_id` es INNER. `clients.coach_id`
--     es nullable desde 20260526103000:4 (enterprise), asi que un alumno org-managed
--     evapora la fila ENTERA y con ella el candado `is_archived / is_active` que
--     20260719190000 acababa de agregar. Un alumno org-managed ARCHIVADO conserva
--     permiso de escritura a nivel DB.
--   Caso 4: con `coalesce(paid_access_ended_at, current_period_end)` NULL, la expresion
--     de billing vale NULL y el `coalesce(<subselect>, true)` externo la convierte en
--     PERMITIR. El espejo TypeScript de la MISMA politica falla CERRADO
--     (`apps/web/src/lib/student-access.ts:101-114` — "post-gracia, o sin ancla conocida
--     -> bloqueo total", fijado por `student-access.test.ts:101-107`). Misma politica,
--     dos respuestas opuestas: la app manda a /suspended y la DB deja escribir por
--     PostgREST directo (workout_logs, check_ins) y por las RPC de ingesta.
--   Camino vivo que produce el caso 4: `suspendCoachAction`
--     (`apps/web/src/app/admin/(panel)/coaches/_actions/coach-actions.ts`) escribia
--     `subscription_status: 'paused'` SIN ancla. Se corrige en el mismo PR.
--
-- Fix:
--   1. `join` -> `left join`: el candado de archivado/pausado deja de depender de que
--      exista coach. La rama `co.id is null` mantiene habilitados a los alumnos
--      org-managed legitimos (no hay gate de billing de coach que aplicarles).
--   2. `coalesce(<expr billing>, false)`: sin ancla conocida CIERRA, alineando la DB con
--      `student-access.ts:109`.
--   3. El `coalesce((select ...), true)` EXTERNO se conserva: fila de cliente inexistente
--      sigue fail-open (intencional; una RLS que ya exige client_id = auth.uid() no puede
--      llegar ahi con un id inexistente). Cambiarlo es un movimiento aparte y se mide solo.
--
-- CONTRATO (para que el proximo create-or-replace no lo revierta en silencio):
--   *** SIN ANCLA DE BILLING CONOCIDA, ESTA FUNCION CIERRA. ***
--
-- ADITIVA: `create or replace` con la MISMA firma. Las policies RESTRICTIVAS de
-- workout_logs / check_ins / daily_nutrition_logs / nutrition_meal_logs
-- (20260718120000:140-244) y los guards de record_/correct_nutrition_intake_v2 la invocan
-- sin cambios.
--
-- RENDIMIENTO: el `left join` cambia el plan y la funcion se evalua por fila en policies
-- RESTRICTIVAS de escritura. Medir con EXPLAIN (ANALYZE) sobre un insert masivo.
--
-- ROLLBACK (una pasada): re-aplicar 20260719190000:9-27.
-- ============================================================================

create or replace function private.student_write_allowed(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce((
    select
      (cl.is_archived is not true and cl.is_active is not false)
      and coalesce(
        -- Coach ausente (alumno org-managed, coach_id null): no hay gate de billing de
        -- coach que aplicar. El candado de archivado/pausado de arriba SI aplica.
        (co.id is null)
        or private.coach_has_effective_access(co.subscription_status, co.current_period_end)
        or (
          coalesce(co.paid_access_ended_at, co.current_period_end) is not null
          and now() < coalesce(co.paid_access_ended_at, co.current_period_end) + interval '7 days'
        ),
        false   -- sin ancla conocida => CIERRA (espejo de student-access.ts:109)
      )
    from public.clients cl
    left join public.coaches co on co.id = cl.coach_id
    where cl.id = p_client_id
  ), true);
$fn$;

comment on function private.student_write_allowed(uuid) is
  'Gate de escritura del alumno. Cierra si la ficha esta archivada/pausada, y cierra '
  'tambien cuando el coach no tiene acceso efectivo NI ancla de billing conocida '
  '(fail-closed, espejo de apps/web/src/lib/student-access.ts). Alumno sin coach '
  '(org-managed) solo pasa el candado de ficha. NUT-033 — no revertir a fail-open.';
