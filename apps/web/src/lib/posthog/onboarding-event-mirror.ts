import 'server-only'

import { capturePostHogServerEvent, type PostHogServerEventProps } from '@/lib/posthog/server-capture'

/**
 * Espejo a PostHog de las filas de `coach_onboarding_events` que se insertan DIRECTO, sin pasar por
 * `recordOnboardingEvent` (W8.5.2 de coach-onboarding-v2 = W0.5 de flujo-coach-nuevo).
 *
 * POR QUÉ existe aparte del espejo que ya vive en el servicio: los dos endpoints que escriben la
 * tabla a mano —`POST /api/coach/onboarding-events` (por ahí entra TODO `step_completed` de la web)
 * y `POST /api/mobile/coach/dashboard` con `action: 'onboarding_event'`— NO pueden delegar el
 * insert en `recordOnboardingEvent`: su contrato HTTP depende de leer el `error` del insert
 * (`23503` ⇒ 404 «Coach not found», `23505` ⇒ `{ ok: true, deduped: true }`, el resto ⇒ 500) y el
 * helper del servicio se lo traga con un `console.warn`. Entonces conservan su insert y llaman a
 * este espejo aparte, únicamente cuando la fila quedó escrita.
 *
 * `services/coach/persona.service.ts` mantiene su copia inline del mismo contrato porque a ese
 * módulo lo importa `proxy.ts` (por los resolvers puros del gate de persona) y `server-capture` es
 * `server-only`: ahí la captura entra por `import()` DINÁMICO para no arrastrar el módulo al bundle
 * del middleware. Acá, dentro de dos route handlers, el import estático es el correcto (mismo
 * patrón que `lib/posthog/registration-events.ts`). Las dos implementaciones tienen que decir lo
 * mismo: mismo nombre de evento, `distinct_id` = coach, `step_key` en las propiedades y
 * `$set { persona }` cuando el evento la trae. Si una cambia, la otra también.
 *
 * Consentimiento (Ley 21.719): mismo criterio ya escrito en `server-capture.ts` — son hechos de
 * NEGOCIO del coach sobre su propia cuenta, sin PII y sin datos del alumno.
 */

/**
 * Eventos que NO se espejan porque su call site ya los captura con payload propio (`also_other` en
 * snake_case). MISMA lista que `POSTHOG_MIRROR_SKIP` en `persona.service`.
 *
 * Hoy ningún cliente emite `persona_selected` por estos endpoints (la web manda 4 tipos desde
 * `onboarding-telemetry.client.ts` y la app 4 desde `apps/mobile/lib/coach-dashboard.ts`), pero los
 * dos lo ACEPTAN porque su lista es el espejo del CHECK de la tabla. Sin este cerrojo, un POST a
 * mano duplicaría el único evento del funnel que ya está en uso.
 */
const POSTHOG_MIRROR_SKIP: ReadonlySet<string> = new Set(['persona_selected'])

export interface OnboardingEventMirrorInput {
    /** `distinct_id` del evento. Siempre resuelto desde la sesión/token, nunca del body. */
    coachId: string
    eventType: string
    /** El `step_key` que quedó en la fila. Viaja como PROPIEDAD, no como nombre de evento. */
    stepKey: string
    metadata?: PostHogServerEventProps | null
}

/**
 * La `persona` que trae el evento, si la trae. Es lo único que este punto sabe de la especialidad
 * del coach: no se consulta la base para completarla (sería una query extra en el camino crítico de
 * un endpoint que existe para ser barato y best-effort).
 */
function personaFromMetadata(metadata: PostHogServerEventProps | null | undefined): string | null {
    const value = metadata?.persona
    return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Manda el evento a PostHog. Best-effort de punta a punta: NUNCA lanza y nunca puede cambiar la
 * respuesta del endpoint que lo llama.
 */
export async function mirrorOnboardingEventToPostHog(input: OnboardingEventMirrorInput): Promise<void> {
    if (POSTHOG_MIRROR_SKIP.has(input.eventType)) return

    const persona = personaFromMetadata(input.metadata)
    try {
        // `capturePostHogServerEvent` nunca lanza y corta a 1,5 s: se puede esperar sin arriesgar la
        // respuesta. El `await` es OBLIGATORIO — Vercel congela la invocación al responder y un
        // fire-and-forget se lleva puesto el POST a PostHog.
        await capturePostHogServerEvent({
            event: input.eventType,
            distinctId: input.coachId,
            // `step_key` DESPUÉS del metadata: la propiedad tiene que ser la que quedó en la fila.
            properties: { ...(input.metadata ?? {}), step_key: input.stepKey },
            set: persona ? { persona } : undefined,
        })
    } catch (error) {
        // Cinturón: hoy la captura se traga lo suyo, pero la telemetría no puede tumbar un endpoint.
        console.warn('[onboarding-events] no se pudo espejar el evento a PostHog', input.eventType, error)
    }
}
