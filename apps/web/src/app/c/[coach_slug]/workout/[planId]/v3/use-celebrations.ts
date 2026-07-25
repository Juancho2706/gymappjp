'use client'

import { useCallback } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
    celebrationTierFor,
    type WorkoutCelebrationEvent,
    type CelebrationContext,
    type CelebrationTier,
} from '@eva/workout-engine'
import { triggerHaptic } from '@/lib/client/haptics'
import { readExecCelebrations, readExecVibration } from './exec-settings'

/**
 * Ejecutor V3 (E4.1) — ORQUESTADOR único de celebraciones. Traduce un evento semántico del motor
 * (`WorkoutCelebrationEvent`) a su presentación, consolidando la dosificación PURA del engine
 * (`celebrationTierFor` → micro/media/épica; la épica se GANA: sólo fin de sesión o PR real) con las
 * prefs device-scoped de la tuerca:
 *   - VISUAL: siempre presente; en reduced-motion degrada a `fade` (contrato `motion-tokens`).
 *   - HÁPTICO: sólo si `execVibration` (default ON) — patrón por tier.
 *   - SONIDO: sólo si `execCelebrations` (default OFF · decisión CEO 3) — viaja como flag en el evento
 *     (no hay asset de audio aún; la pref queda honrada para cuando exista una superficie que lo toque).
 *
 * NO duplica lo que ya montan otras superficies: el interstitial (+1 serie = micro, ronda lista = media)
 * y la fila de PR CONSUMEN este hook — `plan()` para decidir su visual, `celebrate()` para disparar el
 * háptico/sonido y PUBLICAR `exec-celebration` en `window`, de modo que superficies desacopladas (la
 * pantalla final de Wave 2, que consume `sesion_completada`) reaccionen sin acoplarse al call-site.
 */

/** Evento de `window` con cada celebración resuelta (lo consume la pantalla final de Wave 2). */
export const EXEC_CELEBRATION_EVENT = 'exec-celebration'

export type CelebrationVisual = 'confetti' | 'fade' | 'none'

export interface CelebrationPlan {
    /** Nivel dosificado por el engine, o `null` si el evento es un cue que no celebra. */
    tier: CelebrationTier | null
    /** `confetti` con movimiento; `fade` en reduced-motion; `none` si `tier` es null. */
    visual: CelebrationVisual
    reducedMotion: boolean
}

/** Detalle del CustomEvent `exec-celebration`. */
export interface ExecCelebrationDetail {
    event: WorkoutCelebrationEvent
    tier: CelebrationTier
    /** ¿Reproducir sonido? (pref `execCelebrations`, default OFF). */
    sound: boolean
}

/** Patrón háptico por tier (ms · Vibration API). micro = tap; media = doble; épica = crescendo doble. */
const HAPTIC_BY_TIER: Record<CelebrationTier, number[]> = {
    micro: [12],
    media: [16, 40, 16],
    epica: [20, 55, 32],
}

export function useCelebrations() {
    const reducedMotion = !!useReducedMotion()

    /** Resolución PURA de presentación visual (sin efectos): tier + confetti/fade. Para el render. */
    const plan = useCallback(
        (event: WorkoutCelebrationEvent, ctx: CelebrationContext = {}): CelebrationPlan => {
            const tier = celebrationTierFor(event, ctx)
            if (tier == null) return { tier: null, visual: 'none', reducedMotion }
            return { tier, visual: reducedMotion ? 'fade' : 'confetti', reducedMotion }
        },
        [reducedMotion],
    )

    /**
     * Dispara los efectos de una celebración (háptico gateado por pref + publica `exec-celebration`) y
     * devuelve el `plan` para que el call-site pinte lo visual. Llamar dentro de un gesto de usuario para
     * que el háptico funcione en iOS. Un evento-cue (`tier` null) no hace nada.
     */
    const celebrate = useCallback(
        (event: WorkoutCelebrationEvent, ctx: CelebrationContext = {}): CelebrationPlan => {
            const p = plan(event, ctx)
            if (p.tier == null) return p
            if (readExecVibration()) triggerHaptic(HAPTIC_BY_TIER[p.tier])
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent<ExecCelebrationDetail>(EXEC_CELEBRATION_EVENT, {
                        detail: { event, tier: p.tier, sound: readExecCelebrations() },
                    }),
                )
            }
            return p
        },
        [plan],
    )

    return { plan, celebrate, reducedMotion }
}
