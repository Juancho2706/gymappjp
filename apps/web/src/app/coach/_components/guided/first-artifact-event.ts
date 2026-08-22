import { postStepCompleted } from '@/app/coach/dashboard/_lib/onboarding-telemetry.client'
import type { GuidedSurface } from './guided-cards-memory'

/**
 * «El coach creó su primer artefacto» — paso 3 de la guía (SPEC §6, TASKS W4 F4.3).
 *
 * OJO con el nombre: la spec habla de `first_artifact_created`, pero ese `event_type` NO existe en
 * la base. El CHECK de `coach_onboarding_events` (migración `20260822002122`) admite 12 tipos y el
 * que corresponde es `step_completed` con `step_key = 'first_artifact'`; además tiene el índice
 * único parcial `coach_onboarding_events_step_completed_once (coach_id, step_key)`, que es
 * justamente el «una sola vez» que pide la tarea — el dedupe REAL lo pone la base, no el cliente.
 * Inventar un tipo nuevo habría muerto en 500 y habría necesitado una migración.
 *
 * Fire-and-forget y fail-soft: publicar una pauta, cerrar un screening o guardar un perfil no
 * pueden fallar porque la telemetría esté caída.
 */
export function postFirstArtifactCreated(surface: GuidedSurface): void {
    void postStepCompleted('first_artifact', { surface, guided: true })
}
