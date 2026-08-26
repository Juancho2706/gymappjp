import { describe, expect, it } from 'vitest'

import {
    buildSkipMetadata,
    countLoggedSetsByBlock,
    deriveDayCompletion,
    expectedSetsForBlock,
    isSkippedSetRow,
    skippedBlockIdsFromLogs,
} from './day-completion'

describe('expectedSetsForBlock — denominador por bloque', () => {
    it('sets numérico > 0 manda', () => {
        expect(expectedSetsForBlock({ id: 'b1', sets: 4 })).toBe(4)
    })

    it('sets null / 0 / ausente = 1 unidad (cardio, movilidad)', () => {
        expect(expectedSetsForBlock({ id: 'c1', sets: null })).toBe(1)
        expect(expectedSetsForBlock({ id: 'c2', sets: 0 })).toBe(1)
        expect(expectedSetsForBlock({ id: 'c3' })).toBe(1)
    })

    it('basura (negativo, NaN) cae a 1 unidad; decimal se trunca', () => {
        expect(expectedSetsForBlock({ id: 'b1', sets: -3 })).toBe(1)
        expect(expectedSetsForBlock({ id: 'b2', sets: Number.NaN })).toBe(1)
        expect(expectedSetsForBlock({ id: 'b3', sets: 3.7 })).toBe(3)
    })
})

describe('deriveDayCompletion — sets normales', () => {
    const blocks = [
        { id: 'b1', sets: 3 },
        { id: 'b2', sets: 4 },
        { id: 'b3', sets: 3 },
    ]

    it('cero logs => none con el denominador ya calculado', () => {
        expect(deriveDayCompletion({ blocks, loggedSetsByBlock: {} })).toEqual({
            state: 'none',
            pct: 0,
            expected: 10,
            logged: 0,
        })
    })

    it('una sola serie => in_progress (regresión del P0: antes esto era done)', () => {
        expect(deriveDayCompletion({ blocks, loggedSetsByBlock: { b1: 1 } })).toEqual({
            state: 'in_progress',
            pct: 0.1,
            expected: 10,
            logged: 1,
        })
    })

    it('un bloque entero hecho pero no el día => in_progress', () => {
        expect(deriveDayCompletion({ blocks, loggedSetsByBlock: { b1: 3, b2: 2 } })).toEqual({
            state: 'in_progress',
            pct: 0.5,
            expected: 10,
            logged: 5,
        })
    })

    it('falta UNA serie => in_progress, nunca done', () => {
        const res = deriveDayCompletion({ blocks, loggedSetsByBlock: { b1: 3, b2: 4, b3: 2 } })
        expect(res.state).toBe('in_progress')
        expect(res.logged).toBe(9)
        expect(res.pct).toBe(0.9)
    })

    it('100% exacto => done con pct 1', () => {
        expect(deriveDayCompletion({ blocks, loggedSetsByBlock: { b1: 3, b2: 4, b3: 3 } })).toEqual({
            state: 'done',
            pct: 1,
            expected: 10,
            logged: 10,
        })
    })

    it('pct es fracción [0,1], no porcentaje (1 de 3 series de un bloque único)', () => {
        const res = deriveDayCompletion({ blocks: [{ id: 'b1', sets: 3 }], loggedSetsByBlock: { b1: 1 } })
        expect(res.pct).toBeCloseTo(1 / 3, 12)
        expect(res.state).toBe('in_progress')
    })
})

describe('deriveDayCompletion — cardio / movilidad (sets null o 0 = 1 unidad)', () => {
    it('cardio a medias => in_progress', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'c1', sets: null }, { id: 'c2' }],
                loggedSetsByBlock: { c1: 1 },
            })
        ).toEqual({ state: 'in_progress', pct: 0.5, expected: 2, logged: 1 })
    })

    it('plan solo-cardio completo => done (nunca queda colgado en 99%)', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'c1', sets: null }, { id: 'c2', sets: 0 }],
                loggedSetsByBlock: { c1: 1, c2: 1 },
            })
        ).toEqual({ state: 'done', pct: 1, expected: 2, logged: 2 })
    })

    it('cardio con varias series registradas se capa a su única unidad', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'c1', sets: null }],
                loggedSetsByBlock: { c1: 6 },
            })
        ).toEqual({ state: 'done', pct: 1, expected: 1, logged: 1 })
    })

    it('mixto fuerza + cardio: el cardio pesa 1 en el denominador', () => {
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 's1', sets: 4 },
                    { id: 'c1', sets: null },
                ],
                loggedSetsByBlock: { s1: 4 },
            })
        ).toEqual({ state: 'in_progress', pct: 0.8, expected: 5, logged: 4 })
    })
})

describe('deriveDayCompletion — cap por bloque', () => {
    it('bloque editado a la baja post-sesión: el exceso no infla el total', () => {
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 'b1', sets: 2 },
                    { id: 'b2', sets: 2 },
                ],
                loggedSetsByBlock: { b1: 5, b2: 1 },
            })
        ).toEqual({ state: 'in_progress', pct: 0.75, expected: 4, logged: 3 })
    })

    it('el exceso de un bloque JAMÁS compensa lo que falta en otro', () => {
        const res = deriveDayCompletion({
            blocks: [
                { id: 'b1', sets: 3 },
                { id: 'b2', sets: 3 },
            ],
            loggedSetsByBlock: { b1: 99 },
        })
        expect(res).toEqual({ state: 'in_progress', pct: 0.5, expected: 6, logged: 3 })
    })

    it('conteos basura (negativo, NaN, decimal) se sanean antes de sumar', () => {
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 'b1', sets: 3 },
                    { id: 'b2', sets: 3 },
                ],
                loggedSetsByBlock: { b1: -2, b2: 2.9 },
            })
        ).toEqual({ state: 'in_progress', pct: 1 / 3, expected: 6, logged: 2 })
    })

    it('ids repetidos en blocks cuentan una vez (pct nunca supera 1)', () => {
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 'b1', sets: 2 },
                    { id: 'b1', sets: 2 },
                ],
                loggedSetsByBlock: { b1: 2 },
            })
        ).toEqual({ state: 'done', pct: 1, expected: 2, logged: 2 })
    })
})

describe('deriveDayCompletion — bloques huérfanos y planes vacíos', () => {
    it('log de bloque borrado se ignora (no suma al numerador)', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'b1', sets: 2 }],
                loggedSetsByBlock: { b1: 1, 'bloque-borrado': 4 },
            })
        ).toEqual({ state: 'in_progress', pct: 0.5, expected: 2, logged: 1 })
    })

    it('sólo logs huérfanos => none (el día se mide contra el plan vigente)', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'b1', sets: 2 }],
                loggedSetsByBlock: { 'bloque-borrado': 3 },
            })
        ).toEqual({ state: 'none', pct: 0, expected: 2, logged: 0 })
    })

    it('plan sin bloques => none aunque haya logs (no hay 100% de nada)', () => {
        expect(deriveDayCompletion({ blocks: [], loggedSetsByBlock: { b1: 3 } })).toEqual({
            state: 'none',
            pct: 0,
            expected: 0,
            logged: 0,
        })
    })

    it('plan sin bloques y sin logs => none', () => {
        expect(deriveDayCompletion({ blocks: [], loggedSetsByBlock: {} })).toEqual({
            state: 'none',
            pct: 0,
            expected: 0,
            logged: 0,
        })
    })

    it('claves heredadas del prototipo no cuentan como series', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'constructor', sets: 2 }],
                loggedSetsByBlock: {},
            })
        ).toEqual({ state: 'none', pct: 0, expected: 2, logged: 0 })
    })
})

describe('countLoggedSetsByBlock — filas de log => loggedSetsByBlock', () => {
    it('cuenta una serie por (bloque, set_number)', () => {
        expect(
            countLoggedSetsByBlock([
                { block_id: 'b1', set_number: 1 },
                { block_id: 'b1', set_number: 2 },
                { block_id: 'b2', set_number: 1 },
            ])
        ).toEqual({ b1: 2, b2: 1 })
    })

    it('deduplica la misma serie repetida (cola offline sin reconciliar)', () => {
        expect(
            countLoggedSetsByBlock([
                { block_id: 'b1', set_number: 1 },
                { block_id: 'b1', set_number: 1 },
            ])
        ).toEqual({ b1: 1 })
    })

    it('ignora filas sin block_id', () => {
        expect(
            countLoggedSetsByBlock([
                { block_id: null, set_number: 1 },
                { block_id: '', set_number: 2 },
                { block_id: 'b1', set_number: 1 },
            ])
        ).toEqual({ b1: 1 })
    })

    it('set_number nulo/ausente cuenta una serie y colapsa entre sí', () => {
        expect(
            countLoggedSetsByBlock([
                { block_id: 'c1', set_number: null },
                { block_id: 'c1' },
                { block_id: 'c2', set_number: null },
            ])
        ).toEqual({ c1: 1, c2: 1 })
    })

    it('sin filas => objeto vacío', () => {
        expect(countLoggedSetsByBlock([])).toEqual({})
    })

    it('encadena con deriveDayCompletion: 2 de 3 series => in_progress', () => {
        const counts = countLoggedSetsByBlock([
            { block_id: 'b1', set_number: 1 },
            { block_id: 'b1', set_number: 2 },
        ])
        expect(
            deriveDayCompletion({ blocks: [{ id: 'b1', sets: 3 }], loggedSetsByBlock: counts })
        ).toMatchObject({ state: 'in_progress', logged: 2, expected: 3 })
    })
})

describe('ejercicios OMITIDOS — un skip resuelve el bloque sin sumar series', () => {
    const skip = (blockId: string, setNumber = 1) => ({
        block_id: blockId,
        set_number: setNumber,
        metadata: buildSkipMetadata('no_space'),
    })

    it('buildSkipMetadata: con motivo lo lleva; sin motivo sólo marca skipped', () => {
        expect(buildSkipMetadata('machine_busy')).toEqual({ skipped: true, skip_reason: 'machine_busy' })
        expect(buildSkipMetadata(null)).toEqual({ skipped: true })
    })

    it('isSkippedSetRow reconoce la fila de omisión y sólo esa', () => {
        expect(isSkippedSetRow(skip('b1'))).toBe(true)
        expect(isSkippedSetRow({ metadata: { left_sec: 20, right_sec: 20 } as never })).toBe(false)
        expect(isSkippedSetRow({ metadata: null })).toBe(false)
        expect(isSkippedSetRow({})).toBe(false)
        expect(isSkippedSetRow(null)).toBe(false)
    })

    it('countLoggedSetsByBlock NO cuenta la fila de omisión (no es una serie entrenada)', () => {
        expect(
            countLoggedSetsByBlock([
                { block_id: 'b1', set_number: 1 },
                skip('b1', 2),
                skip('b2'),
            ])
        ).toEqual({ b1: 1 })
    })

    it('skippedBlockIdsFromLogs devuelve los bloques declarados omitidos, deduplicados', () => {
        expect(skippedBlockIdsFromLogs([{ block_id: 'b1', set_number: 1 }])).toEqual([])
        expect(skippedBlockIdsFromLogs([skip('b2'), skip('b2', 2), { block_id: null }])).toEqual(['b2'])
    })

    it('un bloque omitido cuenta por su esperado COMPLETO y cierra el día', () => {
        const rows = [
            { block_id: 'b1', set_number: 1 },
            { block_id: 'b1', set_number: 2 },
            { block_id: 'b1', set_number: 3 },
            skip('b2'),
        ]
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 'b1', sets: 3 },
                    { id: 'b2', sets: 4 },
                ],
                loggedSetsByBlock: countLoggedSetsByBlock(rows),
                skippedBlockIds: skippedBlockIdsFromLogs(rows),
            })
        ).toEqual({ state: 'done', pct: 1, expected: 7, logged: 7 })
    })

    it('omitir a mitad de un bloque también lo resuelve entero (sin duplicar el numerador)', () => {
        const rows = [{ block_id: 'b1', set_number: 1 }, skip('b1', 2)]
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'b1', sets: 3 }],
                loggedSetsByBlock: countLoggedSetsByBlock(rows),
                skippedBlockIds: skippedBlockIdsFromLogs(rows),
            })
        ).toEqual({ state: 'done', pct: 1, expected: 3, logged: 3 })
    })

    it('un bloque omitido de un plan con otro pendiente deja el día in_progress', () => {
        expect(
            deriveDayCompletion({
                blocks: [
                    { id: 'b1', sets: 2 },
                    { id: 'b2', sets: 2 },
                ],
                loggedSetsByBlock: {},
                skippedBlockIds: ['b1'],
            })
        ).toEqual({ state: 'in_progress', pct: 0.5, expected: 4, logged: 2 })
    })

    it('skippedBlockIds de un bloque que ya no existe en el plan se ignora', () => {
        expect(
            deriveDayCompletion({
                blocks: [{ id: 'b1', sets: 2 }],
                loggedSetsByBlock: { b1: 2 },
                skippedBlockIds: ['huerfano'],
            })
        ).toEqual({ state: 'done', pct: 1, expected: 2, logged: 2 })
    })
})
