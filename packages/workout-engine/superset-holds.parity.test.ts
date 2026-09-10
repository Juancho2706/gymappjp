/**
 * Paridad web ↔ RN del CONTRATO COMPLETO del hold en superserie (specs/cuenta-atras-en-pantalla,
 * W1.13 · R15 + R34).
 *
 * Encadena las tres piezas que deciden qué queda guardado cuando la cuenta atrás llega a 0 dentro de
 * una superserie —`decideHoldAutolog` → `isRoundComplete` → `buildStrengthTimePayload`— y compara el
 * objeto del motor (el que despacha RN) contra el objeto que produce el camino web (el que
 * `LogSetForm` manda a `logSetAction`). Mismo formato que los 30 asserts de
 * `executor-mapping.parity.test.ts:290-330`: los objetos WEB_* son literales derivados del camino de
 * la web, y si el motor deja de producirlos exactamente, este archivo se pone rojo.
 *
 * Caso canónico «Dia B»: superserie B = «Plancha lateral con rodillas apoyadas» (movilidad, hold) +
 * «Press pallof horizontal con banda» (fuerza), 3 rondas, descanso de grupo 90 s; la fuerza por
 * tiempo es «plancha frontal mantenida» convertida a `3 × 30 s · 10 kg`, serie 2, RIR 2.
 *
 * La columna `alternating` es la que impide la asimetría de hoy (§9 T17): para el eje TIEMPO
 * `alternating` captura UN lado en las dos plataformas — RN no puede pedir una caja y la web dos.
 */
import { describe, it, expect } from 'vitest'

import { decideHoldAutolog, holdSidesFor } from './hold-autolog'
import { buildStrengthTimePayload } from './set-log-payload'
import { isRoundComplete, type RoundLogLike, type RoundMemberBlock } from './superset-rounds'

const DIA_B: RoundMemberBlock[] = [
    { id: 'blockA', sets: 3 },
    { id: 'blockB', sets: 3 },
]
const log = (blockId: string, setNumber: number): RoundLogLike => ({ block_id: blockId, set_number: setNumber })

const BLOCK = 'blk-plancha'
const SET = 2

// ── Lo que la WEB manda a `logSetAction` para el mismo caso (literales de referencia) ────────────

const WEB_BILATERAL = {
    blockId: BLOCK,
    setNumber: SET,
    weightKg: 10,
    repsDone: null,
    rpe: null,
    rir: 2,
    note: null,
    actualHoldSec: 30,
    metadata: { hold_source: 'timer' },
}

const WEB_PER_SIDE = {
    blockId: BLOCK,
    setNumber: SET,
    weightKg: 10,
    repsDone: null,
    rpe: null,
    rir: 2,
    note: null,
    actualHoldSec: 58,
    metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
}

const WEB_ALTERNATING = {
    blockId: BLOCK,
    setNumber: SET,
    weightKg: 10,
    repsDone: null,
    rpe: null,
    rir: 2,
    note: null,
    actualHoldSec: 30,
    metadata: { hold_source: 'timer' },
}

describe('paridad del hold en superserie — bilateral', () => {
    it('la cuenta atrás llega a 0 ⇒ decisión, ronda y payload iguales al camino web', () => {
        const decision = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            side: holdSidesFor('bilateral')[0],
            context: 'superset',
            closesRound: isRoundComplete(DIA_B, 1, [], 'blockA'),
        })
        expect(decision).toEqual({
            fillSeconds: 30,
            submit: true,
            holdSource: 'timer',
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'next-member',
        })
        const payload = buildStrengthTimePayload(
            { weight: '10', actual_hold_sec: String(decision.fillSeconds), rir: '2' },
            BLOCK,
            SET,
            { sideMode: 'bilateral', holdSource: decision.holdSource },
        )
        expect(payload).toEqual(WEB_BILATERAL)
    })

    it('la serie que CIERRA la ronda guarda igual pero no avanza (D2: espera «Ronda lista · Descansar 90 s»)', () => {
        const closes = isRoundComplete(DIA_B, 1, [log('blockA', 1)], 'blockB')
        expect(closes).toBe(true)
        const decision = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            context: 'superset',
            closesRound: closes,
        })
        expect(decision.submit).toBe(true)
        expect(decision.advance).toBe('stay')
        expect(
            buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', rir: '2' }, BLOCK, SET, {
                holdSource: decision.holdSource,
            }),
        ).toEqual(WEB_BILATERAL)
    })
})

describe('paridad del hold en superserie — `per_side`', () => {
    it('dos lados, UNA sola fila: `actual_hold_sec` = L + R y los lados en el mismo jsonb', () => {
        const sides = holdSidesFor('per_side')
        expect(sides).toEqual(['left', 'right'])
        const left = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            side: sides[0],
            context: 'superset',
            closesRound: false,
        })
        expect(left).toMatchObject({ submit: false, advanceSide: true, autoStartNextSide: true, advance: 'stay' })
        // «Listo» a los 28 s del lado derecho no cambia el contrato de columnas, solo la marca.
        const right = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 28,
            prescribedSec: 30,
            side: sides[1],
            context: 'superset',
            closesRound: false,
        })
        expect(right).toMatchObject({ submit: true, advance: 'next-member' })
        const payload = buildStrengthTimePayload(
            {
                weight: '10',
                hold_left_sec: String(left.fillSeconds),
                hold_right_sec: '28',
                rir: '2',
            },
            BLOCK,
            SET,
            { sideMode: 'per_side', holdSource: right.holdSource },
        )
        expect(payload).toEqual(WEB_PER_SIDE)
    })
})

describe('paridad del hold en superserie — `alternating` (H7, el assert de R34)', () => {
    it('captura UN solo lado en las dos plataformas: caja única y jsonb sin `left_sec`/`right_sec`', () => {
        const sides = holdSidesFor('alternating')
        expect(sides).toEqual(['single'])
        const decision = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            side: sides[0],
            context: 'superset',
            closesRound: false,
        })
        expect(decision).toMatchObject({ fillSeconds: 30, submit: true, advanceSide: false })
        const payload = buildStrengthTimePayload(
            { weight: '10', actual_hold_sec: '30', rir: '2' },
            BLOCK,
            SET,
            { sideMode: 'alternating', holdSource: decision.holdSource },
        )
        expect(payload).toEqual(WEB_ALTERNATING)
        expect(payload.metadata).not.toHaveProperty('left_sec')
        expect(payload.metadata).not.toHaveProperty('right_sec')
    })
})

describe('paridad del payload — bordes compartidos', () => {
    it('coma es-CL: «10,5» ⇒ 10.5 en las dos plataformas', () => {
        expect(
            buildStrengthTimePayload({ weight: '10,5', actual_hold_sec: '30' }, BLOCK, SET, { holdSource: 'timer' })
                .weightKg,
        ).toBe(10.5)
    })

    it('sin `holdSource` ninguna de las dos manda la key `metadata`', () => {
        expect(buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', rir: '2' }, BLOCK, SET)).toEqual({
            blockId: BLOCK,
            setNumber: SET,
            weightKg: 10,
            repsDone: null,
            rpe: null,
            rir: 2,
            note: null,
            actualHoldSec: 30,
        })
    })

    it('«Listo» antes de 0 ⇒ el MISMO objeto con `hold_source: manual` y los segundos reales (A2/R22)', () => {
        const decision = decideHoldAutolog({ reason: 'done-early', elapsedSec: 18, prescribedSec: 30 })
        expect(decision).toMatchObject({ fillSeconds: 18, submit: true, holdSource: 'manual' })
        expect(
            buildStrengthTimePayload(
                { weight: '10', actual_hold_sec: String(decision.fillSeconds), rir: '2' },
                BLOCK,
                SET,
                { holdSource: decision.holdSource },
            ),
        ).toEqual({ ...WEB_BILATERAL, actualHoldSec: 18, metadata: { hold_source: 'manual' } })
    })
})
