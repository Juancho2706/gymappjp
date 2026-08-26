-- FCN W3.13: 14o valor del CHECK de coach_onboarding_events — el rastro de auditoria de la
-- rotacion anti-takeover (google_link_rotated_password). Sin esto el insert rebota con 23514
-- y solo queda la senal de PostHog (el codigo lo tolera con warn a proposito).
-- Aplicada en LIVE el 2026-08-26 via MCP. Dry-run BEGIN/ROLLBACK previo: 8334 filas existentes
-- validan contra el CHECK nuevo.
ALTER TABLE public.coach_onboarding_events DROP CONSTRAINT coach_onboarding_events_event_type_check;
ALTER TABLE public.coach_onboarding_events ADD CONSTRAINT coach_onboarding_events_event_type_check
CHECK (event_type = ANY (ARRAY['step_completed','step_reopened','aha_moment','guide_engagement','persona_selected','demo_seeded','demo_deleted','vive_tu_app_opened','invite_link_copied','invite_whatsapp_opened','onboarding_dismissed','first_module_opened','vive_tu_app_entered','google_link_rotated_password']));
