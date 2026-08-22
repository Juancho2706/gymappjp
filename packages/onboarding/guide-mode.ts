/**
 * @eva/onboarding/guide-mode — «¿la guía del coach está ACTIVA?», como DATO puro.
 *
 * Decisión del owner (2026-08-22): **no podemos tener varios onboardings en una sola área**.
 * Mientras la guía v2 está activa, la guía ES la bienvenida y ningún tour/modal de módulo se
 * dispara solo — todos quedan disponibles a pedido (el «?»).
 *
 * Este archivo es el ÚNICO lugar donde vive esa condición, para que web y RN no la deriven cada
 * una por su lado. Es la misma semántica de `shouldShowGuidePill`
 * (`apps/web/src/app/coach/guia/_lib/guide-first-entry.ts`) SIN la parte de rutas: la píldora
 * además se calla en ciertas pantallas, y eso es cosa de la píldora, no del modo.
 *
 * Puro y total: sin React, sin Next, sin Supabase, sin React Native.
 */

import { ONBOARDING_STEP_KEYS, ONBOARDING_TOTAL_STEPS, type OnboardingStepKey } from './index'

export interface GuideModeInput {
    /** Pasos tildados y PERSISTIDOS (`coaches.onboarding_guide.completed`). */
    completed: Partial<Record<OnboardingStepKey, boolean>>
    /** El coach mandó la guía al pie / la descartó. */
    dismissed: boolean
    /** El coach la apagó del todo. */
    hidden: boolean
    /** Coach de org/team: su panel lo define el tenant, no tiene guía propia. */
    managed: boolean
}

/**
 * ¿La guía v2 está ACTIVA para este coach?
 *
 * Activa = coach standalone + guía ni completa (5/5 persistido), ni descartada, ni oculta.
 * Nótese que la persona NO entra: al coach viejo sin persona la guía también lo está esperando
 * (la píldora lo invita a elegir especialidad), así que su área tampoco debe llenarse de tours.
 */
export function isGuideActive(input: GuideModeInput): boolean {
    if (input.managed === true) return false
    if (input.dismissed === true || input.hidden === true) return false
    let done = 0
    for (const key of ONBOARDING_STEP_KEYS) {
        if (input.completed[key] === true) done += 1
    }
    return done < ONBOARDING_TOTAL_STEPS
}
