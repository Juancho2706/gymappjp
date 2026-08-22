import { describe, expect, it } from 'vitest'
import { isGuideActive, ONBOARDING_STEP_KEYS, type OnboardingStepKey } from './index'

/** Guía persistida en n/5 (los primeros `n` pasos del orden canónico). */
function completedUpTo(n: number): Partial<Record<OnboardingStepKey, boolean>> {
    const out: Partial<Record<OnboardingStepKey, boolean>> = {}
    for (const key of ONBOARDING_STEP_KEYS.slice(0, n)) out[key] = true
    return out
}

const BASE = { dismissed: false, hidden: false, managed: false }

describe('isGuideActive — un solo onboarding por área (owner 22-08)', () => {
    it('coach standalone recién llegado (0/5): ACTIVA', () => {
        expect(isGuideActive({ ...BASE, completed: {} })).toBe(true)
    })

    it('a mitad de camino (4/5): sigue ACTIVA', () => {
        expect(isGuideActive({ ...BASE, completed: completedUpTo(4) })).toBe(true)
    })

    it('5/5 persistido: se apaga', () => {
        expect(isGuideActive({ ...BASE, completed: completedUpTo(5) })).toBe(false)
    })

    it('descartada u oculta: se apaga aunque falten pasos', () => {
        expect(isGuideActive({ ...BASE, dismissed: true, completed: {} })).toBe(false)
        expect(isGuideActive({ ...BASE, hidden: true, completed: {} })).toBe(false)
    })

    it('coach managed (org/team): nunca activa', () => {
        expect(isGuideActive({ ...BASE, managed: true, completed: {} })).toBe(false)
    })

    it('los pasos tildados fuera de orden cuentan igual (no exige secuencia)', () => {
        expect(isGuideActive({ ...BASE, completed: { aha: true } })).toBe(true)
    })

    it('un `false` explícito no tilda', () => {
        const completed = { ...completedUpTo(5), aha: false }
        expect(isGuideActive({ ...BASE, completed })).toBe(true)
    })
})
