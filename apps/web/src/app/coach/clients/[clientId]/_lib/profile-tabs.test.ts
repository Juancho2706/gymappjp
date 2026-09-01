import { describe, expect, it } from 'vitest'
import type { FeatureDomain } from '@eva/feature-prefs'
import {
    PROFILE_TABS,
    resolveActiveProfileTab,
    visibleProfileTabs,
    type DomainsEnabled,
} from './profile-tabs'

/**
 * Contrato W1.8 (4A): los dominios apagados esconden SU pestaña de la ficha; Resumen y Progreso
 * nunca se ocultan; fail-OPEN (solo el `false` explícito oculta).
 */

const ALL_ON: Record<FeatureDomain, boolean> = {
    nutrition: true,
    training: true,
    cardio: true,
    movement: true,
    bodycomp: true,
}

const ids = (domains: DomainsEnabled) => visibleProfileTabs(domains).map((tab) => tab.id)

describe('visibleProfileTabs', () => {
    it('con los 5 dominios prendidos muestra las 5 pestañas en orden', () => {
        expect(ids(ALL_ON)).toEqual(['overview', 'progress', 'workout', 'program', 'nutrition'])
        expect(visibleProfileTabs(ALL_ON)).toHaveLength(PROFILE_TABS.length)
    })

    it('training apagado esconde Entreno y Programa (quedan 3)', () => {
        const tabs = ids({ ...ALL_ON, training: false })
        expect(tabs).toEqual(['overview', 'progress', 'nutrition'])
        expect(tabs).not.toContain('workout')
        expect(tabs).not.toContain('program')
    })

    it('nutrition apagado esconde solo Nutrición', () => {
        expect(ids({ ...ALL_ON, nutrition: false })).toEqual([
            'overview',
            'progress',
            'workout',
            'program',
        ])
    })

    it('cardio / movimiento / composición apagados no cambian las pestañas', () => {
        expect(
            ids({ ...ALL_ON, cardio: false, movement: false, bodycomp: false })
        ).toEqual(['overview', 'progress', 'workout', 'program', 'nutrition'])
    })

    it('fail-OPEN: un objeto sin keys deja las 5 pestañas', () => {
        expect(ids({})).toHaveLength(5)
    })

    it('fail-OPEN: `undefined` explícito en un dominio no oculta su pestaña', () => {
        expect(ids({ training: undefined, nutrition: undefined })).toHaveLength(5)
    })
})

describe('resolveActiveProfileTab', () => {
    it('cae a Resumen si el dominio de la pestaña activa está apagado', () => {
        expect(resolveActiveProfileTab('nutrition', { ...ALL_ON, nutrition: false })).toBe('overview')
        expect(resolveActiveProfileTab('program', { ...ALL_ON, training: false })).toBe('overview')
        expect(resolveActiveProfileTab('workout', { ...ALL_ON, training: false })).toBe('overview')
    })

    it('Progreso sobrevive aunque estén los 5 dominios apagados', () => {
        const allOff: Record<FeatureDomain, boolean> = {
            nutrition: false,
            training: false,
            cardio: false,
            movement: false,
            bodycomp: false,
        }
        expect(resolveActiveProfileTab('progress', allOff)).toBe('progress')
        expect(resolveActiveProfileTab('overview', allOff)).toBe('overview')
    })

    it('deja la pestaña activa si su dominio sigue prendido', () => {
        expect(resolveActiveProfileTab('nutrition', ALL_ON)).toBe('nutrition')
        expect(resolveActiveProfileTab('workout', { ...ALL_ON, nutrition: false })).toBe('workout')
    })
})
