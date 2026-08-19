'use client'

import { useCallback } from 'react'
import { useDeferredCapture } from '@/lib/posthog/deferred-capture'
import { useCaptureRegistration } from '@/lib/posthog/events'
import type { SubscriptionTier } from '@/lib/constants'

const DEDUPE_PREFIX = 'eva_coach_registered:'

/**
 * coach_registered — el alta termino DE VERDAD (la fila `coaches` ya existe).
 *
 * No puede vivir en /register: los dos Server Actions del wizard (email y Google) terminan en
 * `redirect()`, asi que el cliente nunca ve el «exito» — la pagina se desmonta. Este tracker se
 * monta en los aterrizajes que SOLO se alcanzan con la cuenta ya creada, exactamente los mismos
 * donde ya vive el espejo del pixel de Meta (`MetaTrackEvent` con el `eid` del action):
 *
 *   /verify-email                 → alta free por email (cuenta `pending_email`)
 *   /coach/dashboard?welcome=free → alta free por Google (cuenta `active`)
 *
 * El camino PAGO no lo necesita: `/coach/subscription/processing?from=register` ya emite
 * `checkout_started({ source: 'register' })` en el mismo aterrizaje.
 *
 * `dedupeKey`: recargar «Revisa tu email» esperando el correo es un gesto normal y volveria a
 * emitir el alta. sessionStorage (no localStorage) alcanza: dura lo que la pestaña.
 */
export function CoachRegisteredTracker({
    tier,
    billingCycle,
    dedupeKey,
}: {
    tier: SubscriptionTier
    billingCycle?: string | null
    dedupeKey: string
}) {
    const captureRegistration = useCaptureRegistration()

    const fire = useCallback(() => {
        const storageKey = `${DEDUPE_PREFIX}${dedupeKey}`
        try {
            if (sessionStorage.getItem(storageKey)) return true // ya contado en esta pestaña
        } catch {
            /* storage bloqueado (Safari privado): mejor emitir de mas que perder el alta */
        }
        const result = captureRegistration(tier, billingCycle ?? undefined)
        // Solo se marca si el evento SALIO: con el banner sin responder y opt-out, `capture` es
        // no-op y hay que dejar la puerta abierta al reintento.
        if (result) {
            try {
                sessionStorage.setItem(storageKey, '1')
            } catch {
                /* noop */
            }
        }
        return result
    }, [captureRegistration, tier, billingCycle, dedupeKey])

    useDeferredCapture(fire)

    return null
}
