import { describe, expect, it } from 'vitest'
import type { OnboardingStepKey } from '@eva/onboarding'
import {
    GUIDE_ROUTE,
    isGuidePersistedComplete,
    persistedDone,
    shouldRedirectToGuide,
    shouldShowGuidePill,
    type GuideProgressState,
} from './guide-first-entry'

/**
 * Las dos reglas del cambio del 22-08 (owner): la guía es una pantalla propia, todo coach la ve
 * en su PRIMERA entrada, y en el panel queda la píldora.
 */

const ALL_STEPS: OnboardingStepKey[] = [
    'profile_branding',
    'vive_tu_app',
    'first_artifact',
    'first_client',
    'aha',
]

function guide(over: Partial<GuideProgressState> = {}): GuideProgressState {
    return { completed: {}, dismissed: false, hidden: false, guideSeenAt: null, ...over }
}

const COMPLETE = Object.fromEntries(ALL_STEPS.map((key) => [key, true])) as Record<
    OnboardingStepKey,
    boolean
>

describe('progreso persistido', () => {
    it('cuenta solo los pasos en true y detecta el 5/5', () => {
        expect(persistedDone({})).toBe(0)
        expect(persistedDone({ profile_branding: true, aha: false })).toBe(1)
        expect(persistedDone(COMPLETE)).toBe(5)
        expect(isGuidePersistedComplete({ profile_branding: true })).toBe(false)
        expect(isGuidePersistedComplete(COMPLETE)).toBe(true)
    })
})

describe('shouldRedirectToGuide', () => {
    it('coach nuevo con persona y sin `guide_seen_at` ⇒ SÍ va a la guía', () => {
        expect(
            shouldRedirectToGuide({ persona: 'strength', guide: guide(), managed: false }),
        ).toBe(true)
    })

    it('vale para cualquier plan: el resolver ni siquiera mira el tier', () => {
        // Regla dura del owner: Free, Pro, Elite o lo que sea, todos ven la guía la primera vez.
        expect(shouldRedirectToGuide({ persona: 'nutrition', guide: guide(), managed: false })).toBe(true)
        expect(shouldRedirectToGuide({ persona: 'endurance', guide: guide(), managed: false })).toBe(true)
    })

    it('con `guide_seen_at` ya estampado ⇒ NO (pasa una sola vez)', () => {
        expect(
            shouldRedirectToGuide({
                persona: 'strength',
                guide: guide({ guideSeenAt: '2026-08-22T10:00:00.000Z' }),
                managed: false,
            }),
        ).toBe(false)
    })

    it('guía completa ⇒ NO, aunque nunca haya abierto la pantalla', () => {
        expect(
            shouldRedirectToGuide({ persona: 'strength', guide: guide({ completed: COMPLETE }), managed: false }),
        ).toBe(false)
    })

    it('descartada u oculta ⇒ NO', () => {
        expect(
            shouldRedirectToGuide({ persona: 'strength', guide: guide({ dismissed: true }), managed: false }),
        ).toBe(false)
        expect(
            shouldRedirectToGuide({ persona: 'strength', guide: guide({ hidden: true }), managed: false }),
        ).toBe(false)
    })

    it('persona `null` (coach viejo con alumnos) ⇒ NO se lo secuestra: lo invita la píldora', () => {
        expect(shouldRedirectToGuide({ persona: null, guide: guide(), managed: false })).toBe(false)
        expect(shouldRedirectToGuide({ persona: '', guide: guide(), managed: false })).toBe(false)
    })

    it('managed (org/team) ⇒ NUNCA', () => {
        expect(shouldRedirectToGuide({ persona: 'rehab', guide: guide(), managed: true })).toBe(false)
    })
})

describe('shouldShowGuidePill', () => {
    const base = { persona: 'strength' as string | null, guide: guide(), managed: false }

    it('se pinta en el panel', () => {
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/dashboard' })).toBe(true)
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/clients' })).toBe(true)
    })

    it('no se pinta sobre la guía ni en el primer ingreso ni en los builders', () => {
        expect(shouldShowGuidePill({ ...base, pathname: GUIDE_ROUTE })).toBe(false)
        expect(shouldShowGuidePill({ ...base, pathname: `${GUIDE_ROUTE}/lo-que-venga` })).toBe(false)
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/onboarding/persona' })).toBe(false)
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/builder/abc' })).toBe(false)
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/workout-programs/builder' })).toBe(false)
        // El hub de programas SÍ la muestra: el prefijo del builder no se come la ruta padre.
        expect(shouldShowGuidePill({ ...base, pathname: '/coach/workout-programs' })).toBe(true)
    })

    it('guía completa, descartada, oculta o managed ⇒ no se pinta', () => {
        expect(
            shouldShowGuidePill({ ...base, guide: guide({ completed: COMPLETE }), pathname: '/coach/dashboard' }),
        ).toBe(false)
        expect(
            shouldShowGuidePill({ ...base, guide: guide({ dismissed: true }), pathname: '/coach/dashboard' }),
        ).toBe(false)
        expect(
            shouldShowGuidePill({ ...base, guide: guide({ hidden: true }), pathname: '/coach/dashboard' }),
        ).toBe(false)
        expect(shouldShowGuidePill({ ...base, managed: true, pathname: '/coach/dashboard' })).toBe(false)
    })

    it('persona `null` SÍ la muestra: es a quien hay que invitar a elegir especialidad', () => {
        expect(shouldShowGuidePill({ ...base, persona: null, pathname: '/coach/dashboard' })).toBe(true)
    })
})
