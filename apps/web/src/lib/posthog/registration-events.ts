import 'server-only'

import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'
import {
    PRICING_VERSION,
    type RegistrationMethod,
    type RegistrationPlatform,
} from '@/lib/posthog/registration'
import type { SubscriptionTier } from '@/lib/constants'

/**
 * `coach_registered` emitido desde el SERVIDOR (W7.1 del embudo Free→Pro).
 *
 * POR QUÉ existe: hasta hoy el evento vivía solo en el navegador (`CoachRegisteredTracker`), y hay
 * dos altas enteras que ningún navegador puede contar:
 *
 *   - las que entran por la app (`api/mobile/auth/register-coach-free` y
 *     `api/mobile/auth/complete-coach-onboarding`): no hay pestaña ni aterrizaje web;
 *   - las que entran por Google en la web: el evento del navegador está detrás del banner de
 *     cookies, así que un alta sin consentimiento no dejaba ninguna huella (hallazgo 21-08: ~29 %
 *     de las altas nuevas sin `register_submitted`/`coach_registered`).
 *
 * Consentimiento (Ley 21.719): mismo criterio ya escrito en `server-capture.ts` — es un hecho de
 * NEGOCIO del coach sobre su propia cuenta (`distinct_id` = su id), sin PII en las propiedades y
 * sin datos del alumno. No reemplaza el banner del visitante ni habilita perfilado publicitario.
 *
 * Doble conteo: en los caminos web que ADEMÁS tienen aterrizaje, el `redirect()` del action lleva
 * `SERVER_EMITTED_QUERY` y `CoachRegisteredTracker` se apaga al verlo. La propiedad `source`
 * (`server` / `client`) deja auditable en PostHog si alguna vez se cuela un duplicado.
 */
export async function captureCoachRegisteredServer(input: {
    coachId: string
    tier: SubscriptionTier
    method: RegistrationMethod
    platform: RegistrationPlatform
    billingCycle?: string | null
    /**
     * Atribución del alta (W3.9 de `docs/specs/flujo-coach-nuevo`), ya saneada por
     * `lib/auth/registration-utm.ts`. Van al evento SOLO cuando existen: así el alta sin campaña
     * no ensucia el esquema con dos propiedades nulas, y el contrato de los callers que no miden
     * atribución no cambia en absoluto. No es PII: es de dónde vino el clic, no quién lo hizo.
     */
    utmSource?: string | null
    utmCampaign?: string | null
}): Promise<void> {
    // `capturePostHogServerEvent` nunca lanza y corta a 1,5 s: se puede esperar en el camino
    // crítico de un alta sin arriesgar la respuesta. El `await` es obligatorio igual que con los
    // correos — Vercel congela la invocación al responder o redirigir y se lleva puesto el POST.
    await capturePostHogServerEvent({
        event: 'coach_registered',
        distinctId: input.coachId,
        properties: {
            tier: input.tier,
            billing_cycle: input.billingCycle ?? null,
            method: input.method,
            platform: input.platform,
            pricing_version: PRICING_VERSION,
            source: 'server',
            ...(input.utmSource ? { utm_source: input.utmSource } : {}),
            ...(input.utmCampaign ? { utm_campaign: input.utmCampaign } : {}),
        },
    })
}
