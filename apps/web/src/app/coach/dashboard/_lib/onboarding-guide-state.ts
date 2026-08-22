import type { Json } from '@/lib/database.types'
import { ONBOARDING_STEP_KEYS, type OnboardingStepKey } from '@eva/onboarding'

/**
 * Estado PERSISTIDO de la guía de inicio v2 — `coaches.onboarding_guide` (jsonb).
 *
 * Módulo PURO (sin React, sin Supabase): lo comparten el RSC del dashboard (para decidir si vale
 * la pena consultar las señales del día 1), el server action que persiste y el checklist cliente.
 * Antes cada uno tenía su propio parser y por eso el `dismissed` del servidor y el del navegador
 * se contradecían.
 *
 * El jsonb es COMPARTIDO con otras keys (`brand_tour_seen`, `invite_code_confirmed`, `demo`…): acá
 * solo se leen/escriben las de la guía y el action mergea, nunca reemplaza.
 */

export interface OnboardingGuideState {
    /** Pasos ya tildados alguna vez. Sticky: una señal que se apaga no destilda el paso. */
    completed: Partial<Record<OnboardingStepKey, boolean>>
    /** El coach mandó la guía al pie («Ocultar») o llegó a 5/5. */
    dismissed: boolean
    /** El coach también cerró la tira del pie: la guía no se pinta más. */
    hidden: boolean
    /** Pasos cuyo `step_completed` YA se emitió. Evita el re-emit por render (2.293 filas). */
    emitted: OnboardingStepKey[]
    /** El confeti del aha ya se lanzó (una sola vez por coach). */
    ahaMomentSent: boolean
}

export const EMPTY_GUIDE_STATE: OnboardingGuideState = {
    completed: {},
    dismissed: false,
    hidden: false,
    emitted: [],
    ahaMomentSent: false,
}

/** Claves legacy del checklist v1. Se leen (para no perder historia) y no se vuelven a escribir. */
const LEGACY_STEP_KEYS = ['first_plan', 'first_checkin'] as const

/** Todas las claves aceptadas por el jsonb `completed` (v2 + legacy v1). */
export const ACCEPTED_COMPLETED_KEYS: readonly string[] = [...ONBOARDING_STEP_KEYS, ...LEGACY_STEP_KEYS]

function isRecord(raw: unknown): raw is Record<string, unknown> {
    return raw != null && typeof raw === 'object' && !Array.isArray(raw)
}

/** Normaliza el jsonb crudo de `coaches.onboarding_guide` al estado de la guía. Nunca lanza. */
export function parseOnboardingGuide(raw: Json | unknown): OnboardingGuideState {
    if (!isRecord(raw)) return { ...EMPTY_GUIDE_STATE, completed: {} }

    const completed: Partial<Record<OnboardingStepKey, boolean>> = {}
    const rawCompleted = raw.completed
    if (isRecord(rawCompleted)) {
        for (const key of ONBOARDING_STEP_KEYS) {
            const v = rawCompleted[key]
            if (typeof v === 'boolean') completed[key] = v
        }
    }

    const emitted: OnboardingStepKey[] = []
    if (Array.isArray(raw.emitted)) {
        for (const key of ONBOARDING_STEP_KEYS) {
            if (raw.emitted.includes(key)) emitted.push(key)
        }
    }

    return {
        completed,
        dismissed: raw.dismissed === true,
        hidden: raw.hidden === true,
        emitted,
        ahaMomentSent: raw.ahaMomentSent === true,
    }
}

/** ¿El coach apagó la guía del todo? Corta las consultas del día 1 en el RSC. */
export function isOnboardingGuideHidden(raw: Json | unknown): boolean {
    return isRecord(raw) && raw.hidden === true
}

/** ¿Hay algo persistido en el servidor? Si no, manda lo que haya en el navegador. */
export function guideStateHasActivity(state: OnboardingGuideState): boolean {
    if (state.dismissed || state.hidden || state.ahaMomentSent) return true
    if (state.emitted.length > 0) return true
    return Object.keys(state.completed).length > 0
}
