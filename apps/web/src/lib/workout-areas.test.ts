import { describe, it, expect } from 'vitest'
import {
    LEGACY_SECTION_AREA_ID,
    effectiveAreaId,
    effectiveAreaKey,
    legacyBucketFor,
    nextCustomSortOrder,
    orderedAreaIds,
    slugifyAreaName,
} from './workout-areas'

describe('slugifyAreaName', () => {
    it('quita diacríticos y kebab-casea', () => {
        expect(slugifyAreaName('Activación pilar central')).toBe('activacion-pilar-central')
        expect(slugifyAreaName('  Movilidad  ')).toBe('movilidad')
        expect(slugifyAreaName('HYROX!! 2026')).toBe('hyrox-2026')
    })

    it('nunca devuelve vacío', () => {
        expect(slugifyAreaName('···')).toBe('area')
        expect(slugifyAreaName('')).toBe('area')
    })
})

describe('nextCustomSortOrder', () => {
    it('piso 100 con solo areas system (max seed = 30)', () => {
        expect(nextCustomSortOrder([{ sort_order: 0 }, { sort_order: 10 }, { sort_order: 30 }])).toBe(100)
        expect(nextCustomSortOrder([])).toBe(100)
    })

    it('después de la última custom existente', () => {
        expect(nextCustomSortOrder([{ sort_order: 30 }, { sort_order: 110 }])).toBe(120)
    })
})

describe('helpers de área efectiva (contratos usados por reducer y UI)', () => {
    it('effectiveAreaId prefiere section_template_id y cae al legacy', () => {
        expect(effectiveAreaId({ section: 'warmup', section_template_id: 'x' })).toBe('x')
        expect(effectiveAreaId({ section: 'warmup', section_template_id: null })).toBe(LEGACY_SECTION_AREA_ID.warmup)
        expect(effectiveAreaId({ section: undefined })).toBe(LEGACY_SECTION_AREA_ID.main)
    })

    it('effectiveAreaKey degrada ids desconocidos al bucket legacy', () => {
        const known = new Set([LEGACY_SECTION_AREA_ID.main])
        expect(effectiveAreaKey({ section: 'main', section_template_id: 'borrada' }, known)).toBe(LEGACY_SECTION_AREA_ID.main)
    })

    it('legacyBucketFor: solo system warmup/main/cooldown conservan su slug', () => {
        expect(legacyBucketFor({ slug: 'cooldown', is_system: true })).toBe('cooldown')
        expect(legacyBucketFor({ slug: 'mobility', is_system: true })).toBe('main')
        expect(legacyBucketFor({ slug: 'warmup', is_system: false })).toBe('main')
        expect(legacyBucketFor(null)).toBe('main')
    })

    it('orderedAreaIds sin areas devuelve el orden clásico', () => {
        expect(orderedAreaIds([])).toEqual([
            LEGACY_SECTION_AREA_ID.warmup,
            LEGACY_SECTION_AREA_ID.main,
            LEGACY_SECTION_AREA_ID.cooldown,
        ])
    })
})
