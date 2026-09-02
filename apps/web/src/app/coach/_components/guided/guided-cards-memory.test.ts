// @vitest-environment jsdom
// Opt-in por archivo: desde el reparto por projects (vitest.config.ts, 2026-09-02) los
// `*.test.ts` corren en `node`, y este ejercita DOM real (window/document/localStorage).
import { beforeEach, describe, expect, it } from 'vitest'
import {
    dismissGuidedSurface,
    EMPTY_GUIDED_CARDS_MEMORY,
    guidedCardsStorageKey,
    isGuidedSurfaceDismissed,
    parseGuidedCardsMemory,
    readGuidedCardsMemory,
    withGuidedSurfaceDismissed,
} from './guided-cards-memory'

describe('guidedCardsStorageKey — la memoria es POR COACH', () => {
    it('dos coaches en el mismo navegador no comparten clave', () => {
        expect(guidedCardsStorageKey('coach-1')).not.toBe(guidedCardsStorageKey('coach-2'))
        expect(guidedCardsStorageKey('coach-1')).toContain('coach-1')
    })
})

describe('parseGuidedCardsMemory — fail-soft ante cualquier basura', () => {
    it('null, arrays, strings y formas viejas caen en «sin memoria»', () => {
        expect(parseGuidedCardsMemory(null)).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
        expect(parseGuidedCardsMemory([])).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
        expect(parseGuidedCardsMemory('nutrition_plan')).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
        expect(parseGuidedCardsMemory({ seen: true })).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
    })

    it('descarta superficies desconocidas y conserva las válidas', () => {
        expect(parseGuidedCardsMemory({ dismissed: ['cardio_zones', 'inventada', 42] })).toEqual({
            dismissed: ['cardio_zones'],
        })
    })
})

describe('withGuidedSurfaceDismissed', () => {
    it('agrega la superficie sin mutar el original', () => {
        const base = EMPTY_GUIDED_CARDS_MEMORY
        const next = withGuidedSurfaceDismissed(base, 'nutrition_plan')
        expect(base.dismissed).toEqual([])
        expect(next.dismissed).toEqual(['nutrition_plan'])
    })

    it('es idempotente: cerrar dos veces no duplica', () => {
        const once = withGuidedSurfaceDismissed(EMPTY_GUIDED_CARDS_MEMORY, 'cardio_zones')
        expect(withGuidedSurfaceDismissed(once, 'cardio_zones')).toBe(once)
    })

    it('cada superficie se cierra por separado', () => {
        const memory = withGuidedSurfaceDismissed(EMPTY_GUIDED_CARDS_MEMORY, 'movement_screening')
        expect(isGuidedSurfaceDismissed(memory, 'movement_screening')).toBe(true)
        expect(isGuidedSurfaceDismissed(memory, 'nutrition_plan')).toBe(false)
    })
})

describe('read/dismiss contra localStorage', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('sin nada guardado la ayuda se muestra', () => {
        expect(readGuidedCardsMemory('coach-1')).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
    })

    it('cerrar persiste y no vuelve a aparecer para ESE coach', () => {
        dismissGuidedSurface('coach-1', 'nutrition_plan')
        expect(isGuidedSurfaceDismissed(readGuidedCardsMemory('coach-1'), 'nutrition_plan')).toBe(true)
        expect(isGuidedSurfaceDismissed(readGuidedCardsMemory('coach-2'), 'nutrition_plan')).toBe(false)
    })

    it('JSON corrupto no rompe la pantalla: se degrada a «sin memoria»', () => {
        localStorage.setItem(guidedCardsStorageKey('coach-1'), '{no-json')
        expect(readGuidedCardsMemory('coach-1')).toEqual(EMPTY_GUIDED_CARDS_MEMORY)
    })
})
