import { describe, it, expect } from 'vitest'
import {
    normalizeMuscle,
    muscleGroupToRegion,
    muscleGroupsToRegionIntensity,
    MUSCLE_REGIONS,
} from './muscle-map'
import { MUSCLE_GROUPS } from '@/lib/constants'

describe('normalizeMuscle', () => {
    it('lowercases and strips accents', () => {
        expect(normalizeMuscle('Cuádriceps')).toBe('cuadriceps')
        expect(normalizeMuscle('Glúteos')).toBe('gluteos')
        expect(normalizeMuscle('  Bíceps ')).toBe('biceps')
        expect(normalizeMuscle('Espalda Alta')).toBe('espalda alta')
    })
})

describe('muscleGroupToRegion', () => {
    it('maps every canonical MUSCLE_GROUP except cardio/movilidad', () => {
        const expected: Record<string, string | null> = {
            Hombros: 'hombros',
            Bíceps: 'brazos',
            Tríceps: 'brazos',
            Antebrazos: 'brazos',
            Cuádriceps: 'cuadriceps',
            Glúteos: 'gluteos',
            Abductores: 'gluteos',
            Aductores: 'gluteos',
            Pantorrillas: 'gemelos',
            Lumbar: 'espalda',
            Abdominales: 'core',
            Cardio: null,
            Dorsales: 'espalda',
            'Espalda Alta': 'espalda',
            Isquiotibiales: 'isquios',
            Pectorales: 'pecho',
            Trapecios: 'espalda',
            Movilidad: null,
        }
        for (const group of MUSCLE_GROUPS) {
            expect(muscleGroupToRegion(group)).toBe(expected[group] ?? null)
        }
    })

    it('handles English synonyms and null/empty', () => {
        expect(muscleGroupToRegion('hamstrings')).toBe('isquios')
        expect(muscleGroupToRegion('chest')).toBe('pecho')
        expect(muscleGroupToRegion('lats')).toBe('espalda')
        expect(muscleGroupToRegion(null)).toBeNull()
        expect(muscleGroupToRegion('')).toBeNull()
        expect(muscleGroupToRegion('desconocido')).toBeNull()
    })
})

describe('muscleGroupsToRegionIntensity', () => {
    it('normalizes intensity 0..1 against the most-worked region', () => {
        const out = muscleGroupsToRegionIntensity([
            { group: 'Cuádriceps', vol: 2000 },
            { group: 'Glúteos', vol: 1000 },
            { group: 'Abdominales', vol: 500 },
        ])
        expect(out.cuadriceps).toBe(1)
        expect(out.gluteos).toBeCloseTo(0.5, 5)
        expect(out.core).toBeCloseTo(0.25, 5)
        expect(out.pecho).toBe(0)
    })

    it('aggregates multiple groups that map to the same region', () => {
        // Abductores + Aductores + Glúteos → todos "gluteos"
        const out = muscleGroupsToRegionIntensity([
            { group: 'Glúteos', vol: 400 },
            { group: 'Abductores', vol: 300 },
            { group: 'Aductores', vol: 300 },
            { group: 'Pectorales', vol: 500 },
        ])
        // gluteos = 1000 (max), pecho = 500 → 0.5
        expect(out.gluteos).toBe(1)
        expect(out.pecho).toBeCloseTo(0.5, 5)
    })

    it('ignores non-positive volume and unmapped groups (cardio)', () => {
        const out = muscleGroupsToRegionIntensity([
            { group: 'Cardio', vol: 9999 },
            { group: 'Pectorales', vol: 0 },
            { group: 'Cuádriceps', vol: -10 },
        ])
        for (const r of MUSCLE_REGIONS) expect(out[r]).toBe(0)
    })

    it('returns all zeros for an empty breakdown', () => {
        const out = muscleGroupsToRegionIntensity([])
        for (const r of MUSCLE_REGIONS) expect(out[r]).toBe(0)
    })
})
