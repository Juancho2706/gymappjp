/**
 * Contrato de las RONDAS de superserie (specs/cuenta-atras-en-pantalla, W1.12).
 *
 * `superset-rounds.ts` no tenía test propio en el motor —la única cobertura viva era
 * `tests/mobile/executor-v3-superset.test.ts`— y V4 («dentro de una superserie SÍ se pasa solo al
 * siguiente miembro») y D2 («el último hold de la ronda espera el toque») se apoyan enteros en
 * `isRoundComplete` / `firstIncompleteInRounds`. Sin este archivo, un cambio en el intercalado
 * rompería el auto-avance del hold sin que ningún test del motor se pusiera rojo.
 *
 * Caso canónico «Dia B»: superserie B = «Plancha lateral con rodillas apoyadas» (movilidad,
 * 3 × 30 s/lado) + «Press pallof horizontal con banda» (fuerza, 3 × 8-12), descanso de grupo 90 s.
 */
import { describe, it, expect } from 'vitest'

import {
    buildRoundOrder,
    findNextIncompleteInRounds,
    firstIncompleteInRounds,
    isRoundComplete,
    type RoundLogLike,
    type RoundMemberBlock,
} from './superset-rounds'

/** Los dos miembros del grupo B de «Dia B», en el orden en que los ve el alumno. */
const DIA_B: RoundMemberBlock[] = [
    { id: 'blockA', sets: 3 }, // plancha lateral (movilidad, hold por lado)
    { id: 'blockB', sets: 3 }, // press pallof (fuerza)
]

const log = (blockId: string, setNumber: number): RoundLogLike => ({ block_id: blockId, set_number: setNumber })

describe('buildRoundOrder', () => {
    it('intercala A1 → B1 → A2 → B2 → A3 → B3 (salida estable)', () => {
        expect(buildRoundOrder(DIA_B)).toEqual([
            { blockId: 'blockA', set: 1 },
            { blockId: 'blockB', set: 1 },
            { blockId: 'blockA', set: 2 },
            { blockId: 'blockB', set: 2 },
            { blockId: 'blockA', set: 3 },
            { blockId: 'blockB', set: 3 },
        ])
    })

    it('salta al miembro que no tiene serie en esa ronda (series desparejas)', () => {
        expect(buildRoundOrder([{ id: 'a', sets: 3 }, { id: 'b', sets: 1 }])).toEqual([
            { blockId: 'a', set: 1 },
            { blockId: 'b', set: 1 },
            { blockId: 'a', set: 2 },
            { blockId: 'a', set: 3 },
        ])
    })

    it('grupo vacío o sin series ⇒ sin orden (nada que recorrer)', () => {
        expect(buildRoundOrder([])).toEqual([])
        expect(buildRoundOrder([{ id: 'a', sets: 0 }])).toEqual([])
    })
})

describe('isRoundComplete — V4 y D2 con el caso canónico «Dia B»', () => {
    it('tras el HOLD del miembro de movilidad la ronda NO está completa ⇒ el ejecutor avanza de miembro (V4)', () => {
        expect(isRoundComplete(DIA_B, 1, [], 'blockA')).toBe(false)
    })

    it('tras el PRESS PALLOF la ronda queda completa ⇒ el ejecutor se queda quieto (D2)', () => {
        expect(isRoundComplete(DIA_B, 1, [log('blockA', 1)], 'blockB')).toBe(true)
    })

    it('idempotencia: registrar DOS veces el mismo (bloque, serie) da el mismo veredicto', () => {
        const once = [log('blockA', 1)]
        const twice = [log('blockA', 1), log('blockA', 1)]
        expect(isRoundComplete(DIA_B, 1, twice)).toBe(isRoundComplete(DIA_B, 1, once))
        expect(isRoundComplete(DIA_B, 1, [...twice, log('blockB', 1), log('blockB', 1)])).toBe(true)
    })

    it('`extraLoggedBlockId` proyecta la serie recién confirmada (commit optimista) sin duplicarla', () => {
        expect(isRoundComplete(DIA_B, 1, [log('blockA', 1)])).toBe(false)
        expect(isRoundComplete(DIA_B, 1, [log('blockA', 1)], 'blockB')).toBe(true)
        // …y el mismo veredicto sale si la fila ya llegó al array de logs.
        expect(isRoundComplete(DIA_B, 1, [log('blockA', 1), log('blockB', 1)])).toBe(true)
    })

    it('un log de OTRA ronda no completa la actual', () => {
        expect(isRoundComplete(DIA_B, 2, [log('blockA', 1), log('blockB', 1), log('blockA', 2)])).toBe(false)
    })

    it('un miembro sin serie en esa ronda no bloquea el cierre', () => {
        const members = [{ id: 'a', sets: 3 }, { id: 'b', sets: 1 }]
        expect(isRoundComplete(members, 2, [log('a', 2)])).toBe(true)
    })
})

describe('firstIncompleteInRounds / findNextIncompleteInRounds', () => {
    it('la serie ACTIVA es la primera incompleta en orden intercalado', () => {
        expect(firstIncompleteInRounds(DIA_B, [])).toEqual({ blockId: 'blockA', set: 1 })
        expect(firstIncompleteInRounds(DIA_B, [log('blockA', 1)])).toEqual({ blockId: 'blockB', set: 1 })
        expect(firstIncompleteInRounds(DIA_B, [log('blockA', 1), log('blockB', 1)])).toEqual({
            blockId: 'blockA',
            set: 2,
        })
    })

    it('grupo terminado ⇒ null (no hay serie activa que pintar)', () => {
        const all = buildRoundOrder(DIA_B).map((p) => log(p.blockId, p.set))
        expect(firstIncompleteInRounds(DIA_B, all)).toBeNull()
    })

    it('la siguiente incompleta tras la recién logueada envuelve al principio si hace falta', () => {
        const order = buildRoundOrder(DIA_B)
        expect(findNextIncompleteInRounds(order, [log('blockA', 1)], { blockId: 'blockA', setNumber: 1 })).toEqual({
            blockId: 'blockB',
            set: 1,
        })
        // El alumno cerró la ÚLTIMA del orden y quedó un hueco atrás: envuelve.
        const logs = buildRoundOrder(DIA_B)
            .filter((p) => !(p.blockId === 'blockB' && p.set === 1))
            .map((p) => log(p.blockId, p.set))
        expect(findNextIncompleteInRounds(order, logs, { blockId: 'blockB', setNumber: 3 })).toEqual({
            blockId: 'blockB',
            set: 1,
        })
    })

    it('todo logueado ⇒ null', () => {
        const order = buildRoundOrder(DIA_B)
        const all = order.map((p) => log(p.blockId, p.set))
        expect(findNextIncompleteInRounds(order, all, { blockId: 'blockB', setNumber: 3 })).toBeNull()
    })
})
