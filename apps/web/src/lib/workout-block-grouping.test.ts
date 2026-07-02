import { describe, expect, it } from 'vitest'
import {
    WORKOUT_SECTION_ORDER,
    effectiveWorkoutSection,
    groupContiguousSupersetRuns,
    sanitizeSupersets,
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
        const rows = groupContiguousSupersetRuns([
            block('a', 0, 'A'), block('b', 1, 'A'),
            block('c', 2, 'B'), block('d', 3, 'B'),
        ])
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ type: 'superset', supersetLetter: 'A' })
        expect(rows[0].blocks.map(b => b.id)).toEqual(['a', 'b'])
        expect(rows[1]).toMatchObject({ type: 'superset', supersetLetter: 'B' })
        expect(rows[1].blocks.map(b => b.id)).toEqual(['c', 'd'])
    })

    it('superset_group con espacios se trata como su trim (vacío y letra suelta = single)', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, '  '), block('b', 1, 'A ')])
        expect(rows[0].type).toBe('single')
        // 'A ' en un solo bloque = singleton → single (nuevo contrato, ver F5)
        expect(rows[1].type).toBe('single')
    })

    it('run de ≥2 con espacios alrededor de la letra sí agrupa (trim)', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A '), block('b', 1, ' A')])
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ type: 'superset', supersetLetter: 'A' })
    })

    it('singleton con letra (run de 1) se degrada a single sin supersetLetter (F5)', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A'), block('b', 1)])
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ type: 'single', key: 'single-a' })
        expect(rows[0].supersetLetter).toBeUndefined()
        expect(rows[1].type).toBe('single')
    })

    it('mismo grupo NO contiguo degrada AMBOS tramos a single', () => {
        const rows = groupContiguousSupersetRuns([block('a', 0, 'A'), block('x', 1), block('b', 2, 'A')])
        expect(rows.map(r => r.type)).toEqual(['single', 'single', 'single'])
        expect(rows.every(r => r.supersetLetter === undefined)).toBe(true)
    })
})

/**
 * sanitizeSupersets — normalizador puro pre-persistencia (fuente única).
 * Bloque mínimo: `superset_group` + resolución de área (section / section_template_id).
 */
describe('sanitizeSupersets', () => {
    const sb = (
        superset_group: string | null,
        section: string | null = 'main',
        section_template_id: string | null = null,
    ) => ({ superset_group, section, section_template_id })

    it('estado limpio: no-op, misma referencia', () => {
        const blocks = [sb('A'), sb('A'), sb(null), sb('B'), sb('B')]
        expect(sanitizeSupersets(blocks)).toBe(blocks)
    })

    it('día sin letras: no-op, misma referencia', () => {
        const blocks = [sb(null), sb(null), sb(null)]
        expect(sanitizeSupersets(blocks)).toBe(blocks)
    })

    it('array vacío: misma referencia', () => {
        const blocks: ReturnType<typeof sb>[] = []
        expect(sanitizeSupersets(blocks)).toBe(blocks)
    })

    it('(b) letra en un solo bloque → null', () => {
        const out = sanitizeSupersets([sb('A'), sb(null)])
        expect(out.map(b => b.superset_group)).toEqual([null, null])
    })

    it('idempotente: aplicar dos veces = aplicar una', () => {
        const dirty = [sb('A'), sb(null), sb('A')] // 'A' partida en dos singletons
        const once = sanitizeSupersets(dirty)
        expect(once.map(b => b.superset_group)).toEqual([null, null, null])
        const twice = sanitizeSupersets(once)
        expect(twice).toBe(once) // segunda pasada no cambia nada → misma ref
    })

    it('(c) letra partida: el fragmento MÁS LARGO conserva la letra, el otro re-letra', () => {
        const blocks = [
            sb('A'), sb('A'),          // frag1 len2
            sb(null),
            sb('A'), sb('A'), sb('A'), // frag2 len3 (más largo → gana 'A')
        ]
        const out = sanitizeSupersets(blocks)
        expect(out.map(b => b.superset_group)).toEqual(['B', 'B', null, 'A', 'A', 'A'])
    })

    it('(c) empate de longitud: el PRIMER fragmento conserva la letra', () => {
        const blocks = [sb('A'), sb('A'), sb(null), sb('A'), sb('A')]
        const out = sanitizeSupersets(blocks)
        expect(out.map(b => b.superset_group)).toEqual(['A', 'A', null, 'B', 'B'])
    })

    it('(c) fragmentos mixtos: ≥2 conserva/re-letra, el de 1 → null', () => {
        const blocks = [sb('A'), sb('A'), sb(null), sb('A')]
        const out = sanitizeSupersets(blocks)
        expect(out.map(b => b.superset_group)).toEqual(['A', 'A', null, null])
    })

    it('(d) estabilidad: bloques válidos/sueltos conservan su referencia', () => {
        const blocks = [sb('A'), sb('A'), sb(null), sb('A')] // solo el último cambia (→ null)
        const out = sanitizeSupersets(blocks)
        expect(out).not.toBe(blocks) // hubo cambio
        expect(out[0]).toBe(blocks[0]) // válido intacto: misma ref
        expect(out[1]).toBe(blocks[1])
        expect(out[2]).toBe(blocks[2]) // loose intacto
        expect(out[3]).not.toBe(blocks[3]) // singleton → null: objeto nuevo
        expect(out[3].superset_group).toBeNull()
    })

    it('re-letra saltando letras ya ocupadas por grupos válidos', () => {
        const blocks = [
            sb('A'), sb('A'),
            sb('B'), sb('B'),
            sb('C'), sb('C'),
            sb(null),
            sb('C'), sb('C'), // 'C' partida → segundo fragmento salta a 'D'
        ]
        const out = sanitizeSupersets(blocks)
        expect(out.map(b => b.superset_group)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', null, 'D', 'D'])
    })

    it('boundary: una superserie no cruza áreas (adyacentes en áreas distintas → null)', () => {
        const out = sanitizeSupersets([sb('A', 'warmup'), sb('A', 'main')])
        expect(out.map(b => b.superset_group)).toEqual([null, null])
    })

    it('boundary: tramos ≥2 en áreas distintas → el segundo re-letra', () => {
        const out = sanitizeSupersets([
            sb('A', 'warmup'), sb('A', 'warmup'),
            sb('A', 'main'), sb('A', 'main'),
        ])
        expect(out.map(b => b.superset_group)).toEqual(['A', 'A', 'B', 'B'])
    })

    it('letras legacy no-A-Z: run válido se conserva; suelto → null', () => {
        const out = sanitizeSupersets([sb('x'), sb('x'), sb('foo')])
        expect(out.map(b => b.superset_group)).toEqual(['x', 'x', null])
    })

    it('letras legacy partidas re-letran con A-Z aunque la original sea rara', () => {
        const out = sanitizeSupersets([sb('foo'), sb('foo'), sb(null), sb('foo'), sb('foo')])
        expect(out.map(b => b.superset_group)).toEqual(['foo', 'foo', null, 'A', 'A'])
    })

    it('areaKeyOf custom: fuerza misma área ignorando el default (paridad reducer)', () => {
        // section distintos → el default los separaría; el resolver constante los une.
        const blocks = [sb('A', 'warmup'), sb('A', 'main')]
        const out = sanitizeSupersets(blocks, () => 'same')
        expect(out.map(b => b.superset_group)).toEqual(['A', 'A'])
        expect(out).toBe(blocks) // run válido sin cambios → misma ref
    })
})
