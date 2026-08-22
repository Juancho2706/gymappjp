import { describe, expect, it } from 'vitest'
import {
    guideStateHasActivity,
    isOnboardingGuideHidden,
    parseOnboardingGuide,
} from './onboarding-guide-state'

describe('parseOnboardingGuide', () => {
    it('un jsonb vacío o corrupto no explota', () => {
        expect(parseOnboardingGuide({})).toEqual({
            completed: {},
            dismissed: false,
            hidden: false,
            emitted: [],
            ahaMomentSent: false,
        })
        expect(parseOnboardingGuide(null).completed).toEqual({})
        expect(parseOnboardingGuide('nope').completed).toEqual({})
        expect(parseOnboardingGuide([1, 2]).completed).toEqual({})
    })

    it('lee los 5 pasos v2 y descarta claves que no son de la guía', () => {
        const state = parseOnboardingGuide({
            completed: { profile_branding: true, first_plan: true, basura: true },
            dismissed: true,
            hidden: false,
            ahaMomentSent: true,
        })
        expect(state.completed).toEqual({ profile_branding: true })
        expect(state.dismissed).toBe(true)
        expect(state.ahaMomentSent).toBe(true)
    })

    it('`emitted` solo conserva claves de paso válidas', () => {
        const state = parseOnboardingGuide({ emitted: ['aha', 'first_client', 'inventado'] })
        expect(state.emitted.sort()).toEqual(['aha', 'first_client'])
    })

    it('ignora tipos que no son booleanos (jsonb escrito a mano)', () => {
        const state = parseOnboardingGuide({ completed: { aha: 'sí' }, dismissed: 'true' })
        expect(state.completed).toEqual({})
        expect(state.dismissed).toBe(false)
    })
})

describe('isOnboardingGuideHidden — corta las consultas del día 1 en el RSC', () => {
    it('solo con `hidden: true`', () => {
        expect(isOnboardingGuideHidden({ hidden: true })).toBe(true)
        expect(isOnboardingGuideHidden({ dismissed: true })).toBe(false)
        expect(isOnboardingGuideHidden({})).toBe(false)
        expect(isOnboardingGuideHidden(null)).toBe(false)
    })
})

describe('guideStateHasActivity — decide si el servidor le gana a localStorage', () => {
    it('sin nada escrito, no hay actividad', () => {
        expect(
            guideStateHasActivity({
                completed: {},
                dismissed: false,
                hidden: false,
                emitted: [],
                ahaMomentSent: false,
            })
        ).toBe(false)
    })

    it('cualquier señal persistida cuenta como actividad', () => {
        const base = {
            completed: {},
            dismissed: false,
            hidden: false,
            emitted: [],
            ahaMomentSent: false,
        }
        expect(guideStateHasActivity({ ...base, dismissed: true })).toBe(true)
        expect(guideStateHasActivity({ ...base, hidden: true })).toBe(true)
        expect(guideStateHasActivity({ ...base, ahaMomentSent: true })).toBe(true)
        expect(guideStateHasActivity({ ...base, emitted: ['aha'] })).toBe(true)
        expect(guideStateHasActivity({ ...base, completed: { aha: true } })).toBe(true)
    })
})
