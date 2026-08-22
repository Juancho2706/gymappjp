'use client'

import { useCallback } from 'react'
import { useDeferredCapture } from '@/lib/posthog/deferred-capture'
import { useCaptureRegistration } from '@/lib/posthog/events'
import {
    SERVER_EMITTED_PARAM,
    SERVER_EMITTED_VALUE,
    type RegistrationMethod,
} from '@/lib/posthog/registration'
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
 *
 * `?ph=srv` en la URL (W7.1): el aterrizaje viene de un Server Action que YA emitio el evento
 * server-side (con `platform` y `method`, y sin depender del banner de cookies). Este tracker se
 * apaga ahi mismo — si disparan los dos, el ultimo paso del embudo queda inflado justo en la
 * metrica que W7 existe para arreglar. Se lee de `window.location` y no con `useSearchParams` a
 * proposito: el hook obliga a un Suspense boundary en cada pagina que monte el tracker.
 *
 * `method`: hoy el UNICO aterrizaje que sigue emitiendo desde el navegador es `/verify-email` (alta
 * free por email en la web) — el de Google llega con `ph=srv`. Por eso el default es `'email'`; el
 * prop existe para que un mount nuevo pueda decir la verdad sin tocar este archivo.
 */
export function CoachRegisteredTracker({
    tier,
    billingCycle,
    dedupeKey,
    method = 'email',
}: {
    tier: SubscriptionTier
    billingCycle?: string | null
    dedupeKey: string
    method?: RegistrationMethod
}) {
    const captureRegistration = useCaptureRegistration()

    const fire = useCallback(() => {
        const params = new URLSearchParams(window.location.search)
        // `true` = «dado por disparado»: corta el reintento de useDeferredCapture, no lo deja girando.
        if (params.get(SERVER_EMITTED_PARAM) === SERVER_EMITTED_VALUE) return true

        const storageKey = `${DEDUPE_PREFIX}${dedupeKey}`
        try {
            if (sessionStorage.getItem(storageKey)) return true // ya contado en esta pestaña
        } catch {
            /* storage bloqueado (Safari privado): mejor emitir de mas que perder el alta */
        }
        const result = captureRegistration(tier, method, billingCycle ?? undefined)
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
    }, [captureRegistration, tier, method, billingCycle, dedupeKey])

    useDeferredCapture(fire)

    return null
}
