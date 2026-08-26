-- «Vive tu app» directo (docs/specs/vive-tu-app-directo/, W1 V1.11): el paso 2 de la guía deja de
-- tildarse cuando el coach PIDE el link y pasa a tildarse cuando ENTRÓ.
--
-- Por qué hace falta tocar el CHECK: `coach_onboarding_events.event_type` es un CHECK cerrado con
-- 12 valores (migración 20260822002122:113-132). El evento nuevo `vive_tu_app_entered` —el único
-- que dice la verdad sobre el paso 2— sería rechazado por la base, y `recordOnboardingEvent`
-- TRAGA el error con `console.warn`: no habría 500, no habría alerta, el paso simplemente no se
-- tildaría nunca y nadie se enteraría. Por eso esta migración se aplica en LIVE ANTES del deploy
-- web y se verifica DESPUÉS con `select count(*) ... where event_type = 'vive_tu_app_entered'`.
--
-- Evidencia (auditoría del 23-08, caso Job Palacios): 6 de 6 coaches con el paso 2 tildado, 2
-- habían entrado de verdad. El funnel reportaba 100 % de un paso que convierte 33 %.
--
-- Aditiva y sin DDL destructiva: la lista nueva es un SUPERSET de la vigente (12 + 1), así que
-- ninguna fila existente la viola y no hay backfill de datos.
--
-- V1.12 EJECUTADA (jefe, 2026-08-26): aplicada en LIVE como versión 20260826044211 vía
-- `apply_migration`; este archivo quedó renombrado a esa versión real.
--
-- Patrón: `drop constraint if exists` + `add constraint` (el mismo par de 20260822002122:113-132),
-- NO el guard por catálogo de :28-42. Ese guard existe para constraints que todavía no existen y
-- acá daría un NO-OP silencioso: `coach_onboarding_events_event_type_check` YA existe, el `if not
-- exists` cortaría, el CHECK viejo seguiría vivo y el evento nuevo seguiría rechazado sin ruido.
--
-- Validada con BEGIN ... ROLLBACK contra LIVE el 2026-08-26 (8302 filas existentes OK, la lista
-- nueva es superset de la vigente verificada por pg_get_constraintdef) y APLICADA el mismo día.

alter table public.coach_onboarding_events
  drop constraint if exists coach_onboarding_events_event_type_check;

alter table public.coach_onboarding_events
  add constraint coach_onboarding_events_event_type_check
  check (event_type in (
    'step_completed',
    'step_reopened',
    'aha_moment',
    'guide_engagement',
    'persona_selected',
    'demo_seeded',
    'demo_deleted',
    'vive_tu_app_opened',
    'invite_link_copied',
    'invite_whatsapp_opened',
    'onboarding_dismissed',
    'first_module_opened',
    'vive_tu_app_entered'
  ));

comment on constraint coach_onboarding_events_event_type_check on public.coach_onboarding_events is
  'Espejo EXACTO del z.enum de api/coach/onboarding-events. `vive_tu_app_entered` lo escribe SOLO el servidor (GET /vive-tu-app, tras verificar el magic link y el cinturón is_demo): los dos endpoints de cliente lo rechazan con 400, porque abrirlo dejaría auto-tildarse el paso 2 con un bearer. `vive_tu_app_opened` conserva su significado viejo («pidió el link»).';
