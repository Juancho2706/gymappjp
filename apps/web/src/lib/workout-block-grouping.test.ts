import { describe, expect, it } from 'vitest'
import {
    WORKOUT_SECTION_ORDER,
    effectiveWorkoutSection,
    groupContiguousSupersetRuns,
} from './workout-block-grouping'

/**
 * F0 (áreas custom) — BASELINE ANTI-REGRESIÓN del comportamiento legacy.
 * Estos asserts fijan byte-identical la semántica actual de los 3 sections clásicos
 * ANTES del refactor a áreas dinámicas (specs/movida-areas). Si un cambio del
 * refactor rompe cualquiera de estos, es regresión: el fallback legacy es contrato.
 */

describe('F0 baseline — effectiveWorkoutSection (legacy, contrato de fallback)', () => {
    it('los 3 clásicos pasan tal cual', () => {
        expect(effectiveWorkoutSection('warmup')).toBe('warmup')
        expect(effectiveWorkoutSection('main')).toBe('main')
        expect(effectiveWorkoutSection('cooldown')).toBe('cooldown')
    })

    it('NULL/undefined/vacío caen a main (planes viejos sin sección)', () => {
        expect(effectiveWorkoutSection(null)).toBe('main')
        expect(effectiveWorkoutSection(undefined)).toBe('main')
        expect(effectiveWorkoutSection('')).toBe('main')
    })

    it('cualquier otro string cae a other', () => {
        expect(effectiveWorkoutSection('mobility')).toBe('other')
        expect(effectiveWorkoutSection('xyz')).toBe('other')
    })

    it('el orden de render es warmup → main → cooldown → other', () => {
        expect(WORKOUT_SECTION_ORDER).toEqual(['warmup', 'main', 'cooldown', 'other'])
    })
})

describe('F0 baseline — groupContiguousSupersetRuns (contrato de agrupación)', () => {
    const block = (id: string, order_index: number, superset_group: string | null = null) =>
        ({ id, order_index, superset_group })

    it('bloques sin superset = singles en orden', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0), block('b', 1)])
        expect(rows.map(r => r.type)).toEqual(['single', 'single'])
        expect(rows.map(r => r.key)).toEqual(['single-a', 'single-b'])
    })

    it('superset contiguo (mismo grupo + order_index consecutivo) se agrupa', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A'), block('b', 1, 'A'), block('c', 2)])
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ type: 'superset', supersetLetter: 'A' })
        expect(rows[0].blocks.map(b => b.id)).toEqual(['a', 'b'])
        expect(rows[1].type).toBe('single')
    })

    it('mismo grupo NO contiguo (hueco en order_index) NO se fusiona', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A'), block('x', 1), block('b', 2, 'A')])
        expect(rows).toHaveLength(3)
        expect(rows[0].blocks.map(b => b.id)).toEqual(['a'])
        expect(rows[2].blocks.map(b => b.id)).toEqual(['b'])
    })

    it('grupos distintos consecutivos cortan el run', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A'), block('b', 1, 'B')])
        expect(rows).toHaveLength(2)
        expect(rows[0].supersetLetter).toBe('A')
        expect(rows[1].supersetLetter).toBe('B')
    })

    it('superset_group con espacios se trata como su trim (y vacío = single)', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, '  '), block('b', 1, 'A ')])
        expect(rows[0].type).toBe('single')
        expect(rows[1].type).toBe('superset')
    })
})
