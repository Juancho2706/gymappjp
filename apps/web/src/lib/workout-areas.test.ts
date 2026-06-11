import { describe, it, expect } from 'vitest'
import {
    LEGACY_SECTION_AREA_ID,
    effectiveAreaId,
    effectiveAreaKey,
    executionAreaGroupsFor,
    legacyBucketFor,
    nextCustomSortOrder,
    orderedAreaIds,
    slugifyAreaName,
} from './workout-areas'
import type { WorkoutArea } from '@/domain/workout/types'

describe('slugifyAreaName', () => {
    it('quita diacríticos y kebab-casea', () => {
        expect(slugifyAreaName('Activación pilar central')).toBe('activacion-pilar-central')
        expect(slugifyAreaName('  Movilidad  ')).toBe('movilidad')
        expect(slugifyAreaName('HYROX!! 2026')).toBe('hyrox-2026')
    })

    it('nombres sin caracteres latinos llevan sufijo determinístico (no colisionan entre sí)', () => {
        const a = slugifyAreaName('ЖИМ')
        const b = slugifyAreaName('ПРЕСС')
        expect(a).toMatch(/^area-[0-9a-z]+$/)
        expect(b).toMatch(/^area-[0-9a-z]+$/)
        expect(a).not.toBe(b)
        expect(slugifyAreaName('ЖИМ')).toBe(a) // determinístico
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

describe('executionAreaGroupsFor (ejecución del alumno, AC3)', () => {
    const mobility: WorkoutArea = {
        id: '0000a5ec-0000-0000-0000-000000000005', name: 'Movilidad', slug: 'mobility',
        sort_order: 5, is_system: true, coach_id: null, team_id: null,
    }
    const hyrox: WorkoutArea = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'HYROX', slug: 'hyrox',
        sort_order: 100, is_system: false, coach_id: 'coach-1', team_id: null,
    }

    it('plan viejo (solo section legacy) produce exactamente warmup→main→cooldown→other', () => {
        const blocks = [
            { section: 'cooldown', section_template_id: null },
            { section: 'main', section_template_id: null },
            { section: 'warmup', section_template_id: null },
            { section: 'algo-raro', section_template_id: null },
            { section: null, section_template_id: null },
        ]
        const groups = executionAreaGroupsFor(blocks, [])
        expect(groups.map(g => g.legacySection)).toEqual(['warmup', 'main', 'cooldown', 'other'])
        expect(groups.every(g => g.name === null)).toBe(true)
        // null/'' caen a main (paridad con effectiveWorkoutSection)
        expect(groups[1].blocks).toHaveLength(2)
    })

    it('section_template_id de los 3 clásicos va por la vía legacy (títulos actuales)', () => {
        const blocks = [
            { section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main },
            { section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup },
        ]
        const groups = executionAreaGroupsFor(blocks, [mobility, hyrox])
        expect(groups.map(g => g.legacySection)).toEqual(['warmup', 'main'])
        expect(groups.every(g => g.name === null)).toBe(true)
    })

    it('área resuelta agrupa por nombre con su sort_order intercalado', () => {
        const blocks = [
            { section: 'warmup', section_template_id: LEGACY_SECTION_AREA_ID.warmup },
            { section: 'main', section_template_id: mobility.id },
            { section: 'main', section_template_id: LEGACY_SECTION_AREA_ID.main },
            { section: 'main', section_template_id: hyrox.id },
        ]
        const groups = executionAreaGroupsFor(blocks, [mobility, hyrox])
        // warmup(0) → Movilidad(5) → main(10) → HYROX(100)
        expect(groups.map(g => g.name ?? g.legacySection)).toEqual(['warmup', 'Movilidad', 'main', 'HYROX'])
        expect(groups[1].slug).toBe('mobility')
    })

    it('id no resuelto (área borrada / no visible para el alumno) cae a la sección legacy', () => {
        const blocks = [
            { section: 'main', section_template_id: 'deadbeef-0000-0000-0000-000000000000' },
            { section: 'cooldown', section_template_id: null },
        ]
        const groups = executionAreaGroupsFor(blocks, [mobility])
        expect(groups.map(g => g.legacySection)).toEqual(['main', 'cooldown'])
    })

    it('preserva el orden relativo de bloques dentro de cada grupo', () => {
        const blocks = [
            { section: 'main', section_template_id: hyrox.id, id: 'b1' },
            { section: 'main', section_template_id: hyrox.id, id: 'b2' },
        ]
        const groups = executionAreaGroupsFor(blocks, [hyrox])
        expect(groups[0].blocks.map(b => (b as { id: string }).id)).toEqual(['b1', 'b2'])
    })
})
