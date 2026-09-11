/**
 * Contrato del payload de FUERZA POR TIEMPO (specs/cuenta-atras-en-pantalla, W1.3/W1.3b/W1.4).
 *
 * Tres cosas que este archivo tiene que dejar clavadas:
 *  1. `buildStrengthTimePayload` guarda las REPS OPCIONALES del alumno (F1: entero > 0 ⇒ viajan;
 *     vacías o `0` ⇒ `reps_done: null`, NUNCA 0), el hold en `actual_hold_sec` (suma L+R en
 *     `per_side`) y **jamás** `actual_duration_sec` —que es el eje de cardio/roller y
 *     metería la plancha en `totalCardioDurationSec`.
 *  2. `hold_source` también se escribe por el carril TIPADO (movilidad y roller): sin eso los 32
 *     holds de movilidad del caso canónico saldrían sin marca y la consulta de adopción quedaría ciega.
 *  3. Nada de lo anterior mueve una coma en lo viejo: sin `holdSource` el payload NO gana la key
 *     `metadata`, y `buildStrengthPayload` —congelado por 30+ asserts— sigue byte-idéntico.
 */
import { describe, it, expect } from 'vitest'

import {
  buildStrengthPayload,
  buildStrengthTimePayload,
  buildTypedPayload,
} from './set-log-payload'
import { holdSidesFor } from './hold-autolog'

// Caso canónico del tren: «plancha frontal mantenida» convertida a fuerza por tiempo, 3 × 30 s · 10 kg,
// serie 2, RIR 2.
const BLOCK = 'blk-plancha'
const SET = 2

describe('buildStrengthTimePayload — bilateral', () => {
  it('guarda peso, hold y esfuerzo con `reps_done` en null y la marca del reloj', () => {
    expect(
      buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', rir: '2' }, BLOCK, SET, {
        holdSource: 'timer',
      }),
    ).toEqual({
      blockId: BLOCK,
      setNumber: SET,
      weightKg: 10,
      repsDone: null,
      rpe: null,
      rir: 2,
      note: null,
      actualHoldSec: 30,
      metadata: { hold_source: 'timer' },
    })
  })

  it('NUNCA escribe `actual_duration_sec` (ese eje es de cardio/roller)', () => {
    const p = buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30' }, BLOCK, SET, {
      holdSource: 'timer',
    })
    expect('actualDurationSec' in p).toBe(false)
  })

  it('`reps_done` es null, nunca 0 (un 0 contaría como serie de 0 reps en las RPC de récords)', () => {
    const p = buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', reps: '0' }, BLOCK, SET)
    expect(p.repsDone).toBeNull()
  })

  // ── F1 (owner 11-09): «nunca deberíamos quitar reps de los ejercicios de fuerza» ───────────────
  it('las reps tipeadas VIAJAN junto al hold (el eje de tiempo no las reemplaza)', () => {
    expect(
      buildStrengthTimePayload({ weight: '45', reps: '5', actual_hold_sec: '30' }, BLOCK, SET, {
        holdSource: 'timer',
      }),
    ).toEqual({
      blockId: BLOCK,
      setNumber: SET,
      weightKg: 45,
      repsDone: 5,
      rpe: null,
      rir: null,
      note: null,
      actualHoldSec: 30,
      metadata: { hold_source: 'timer' },
    })
  })

  it('las reps son OPCIONALES: vacías o ausentes ⇒ `reps_done: null` y la serie se guarda igual', () => {
    expect(buildStrengthTimePayload({ weight: '10', reps: '', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBeNull()
    expect(buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBeNull()
    expect(buildStrengthTimePayload({ weight: '10', reps: '   ', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBeNull()
  })

  it('basura o negativos en la caja de reps ⇒ null (nunca un entero inventado)', () => {
    expect(buildStrengthTimePayload({ reps: 'abc', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBeNull()
    expect(buildStrengthTimePayload({ reps: '-3', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBeNull()
  })

  it('reps con coma/decimal se redondean a entero (misma regla que la fuerza clásica)', () => {
    expect(buildStrengthTimePayload({ reps: '5,4', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBe(5)
    expect(buildStrengthTimePayload({ reps: '5,6', actual_hold_sec: '30' }, BLOCK, SET).repsDone).toBe(6)
  })

  it('reps SIN hold: la serie sale con reps y sin `actual_hold_sec` (el guard de fila vacía la deja pasar)', () => {
    const p = buildStrengthTimePayload({ weight: '45', reps: '5' }, BLOCK, SET)
    expect(p.repsDone).toBe(5)
    expect(p.actualHoldSec).toBeNull()
  })

  it('`per_side` con reps: UNA sola caja de reps + los dos holds en `metadata`', () => {
    expect(
      buildStrengthTimePayload(
        { weight: '10', reps: '8', hold_left_sec: '30', hold_right_sec: '28' },
        BLOCK,
        SET,
        { sideMode: 'per_side', holdSource: 'timer' },
      ),
    ).toMatchObject({
      repsDone: 8,
      actualHoldSec: 58,
      metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
    })
  })

  it('peso con coma es-CL y nota en blanco ⇒ null', () => {
    const p = buildStrengthTimePayload(
      { weight: '10,5', actual_hold_sec: '30', note: '   ' },
      BLOCK,
      SET,
      { holdSource: 'manual' },
    )
    expect(p.weightKg).toBe(10.5)
    expect(p.note).toBeNull()
  })

  it('sin peso (peso corporal) ⇒ `weightKg: null` y el hold igual se guarda', () => {
    expect(buildStrengthTimePayload({ actual_hold_sec: '45' }, BLOCK, 1)).toMatchObject({
      weightKg: null,
      actualHoldSec: 45,
    })
  })

  it('sin `holdSource` el payload NO gana la key `metadata`', () => {
    const p = buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', rir: '2' }, BLOCK, SET)
    expect('metadata' in p).toBe(false)
    expect(p).toEqual({
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

  it('la marca `manual` viaja igual que la del reloj (misma clave, solo cambia el valor)', () => {
    const timer = buildStrengthTimePayload({ actual_hold_sec: '18' }, BLOCK, SET, { holdSource: 'timer' })
    const manual = buildStrengthTimePayload({ actual_hold_sec: '18' }, BLOCK, SET, { holdSource: 'manual' })
    expect(manual).toEqual({ ...timer, metadata: { hold_source: 'manual' } })
  })
})

describe('buildStrengthTimePayload — lados (R34 / H7)', () => {
  it('`per_side`: `actual_hold_sec` = L + R y `metadata` con las TRES claves', () => {
    expect(
      buildStrengthTimePayload(
        { weight: '10', hold_left_sec: '30', hold_right_sec: '28', rir: '2' },
        BLOCK,
        SET,
        { sideMode: 'per_side', holdSource: 'timer' },
      ),
    ).toEqual({
      blockId: BLOCK,
      setNumber: SET,
      weightKg: 10,
      repsDone: null,
      rpe: null,
      rir: 2,
      note: null,
      actualHoldSec: 58,
      metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
    })
  })

  it('`per_side` con un solo lado tipeado: el otro queda null y la suma toma el presente', () => {
    expect(
      buildStrengthTimePayload({ hold_left_sec: '30' }, BLOCK, SET, { sideMode: 'per_side' }),
    ).toMatchObject({
      actualHoldSec: 30,
      metadata: { left_sec: 30, right_sec: null },
    })
  })

  it('`alternating` ⇒ UN solo lado: caja única y `metadata` SIN `left_sec`/`right_sec` (H7)', () => {
    expect(
      buildStrengthTimePayload({ weight: '10', actual_hold_sec: '30', rir: '2' }, BLOCK, SET, {
        sideMode: 'alternating',
        holdSource: 'timer',
      }),
    ).toEqual({
      blockId: BLOCK,
      setNumber: SET,
      weightKg: 10,
      repsDone: null,
      rpe: null,
      rir: 2,
      note: null,
      actualHoldSec: 30,
      metadata: { hold_source: 'timer' },
    })
  })

  it('`holdSidesFor`: las tres filas de la regla única', () => {
    expect(holdSidesFor('per_side')).toEqual(['left', 'right'])
    expect(holdSidesFor('alternating')).toEqual(['single'])
    expect(holdSidesFor(null)).toEqual(['single'])
    expect(holdSidesFor('bilateral')).toEqual(['single'])
  })
})

describe('buildStrengthPayload — congelado (W1.4)', () => {
  it('un coach que solo usa reps tiene identidad BYTE A BYTE (ni una key nueva)', () => {
    expect(buildStrengthPayload({ weight: '60', reps: '10', rpe: '8', rir: '2', note: 'buena' }, 'b1', 1)).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 60,
      repsDone: 10,
      rpe: 8,
      rir: 2,
      note: 'buena',
    })
  })

  it('la fuerza clásica NO cambia de regla de lados: `alternating` sigue capturando dos lados en REPS', () => {
    expect(
      buildStrengthPayload({ weight: '20', reps_left: '10', reps_right: '9' }, 'b1', 1, {
        sideMode: 'alternating',
      }),
    ).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 20,
      repsDone: 9,
      rpe: null,
      rir: null,
      note: null,
      metadata: { left_reps: 10, right_reps: 9 },
    })
  })
})

// ── `hold_source` por el carril TIPADO: movilidad y roller (W1.3b / F1) ─────────────────────────

describe('buildTypedPayload — marca de fuente del hold', () => {
  it('movilidad BILATERAL con `holdSource` ⇒ gana `metadata: { hold_source }` (hoy no ganaba la key)', () => {
    expect(
      buildTypedPayload('mobility', { actual_hold_sec: '30' }, 'b-mov', 1, {
        sideMode: 'bilateral',
        holdSource: 'timer',
      }),
    ).toEqual({
      blockId: 'b-mov',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 30,
      actualAvgHr: null,
      metadata: { hold_source: 'timer' },
    })
  })

  it('movilidad `per_side` con `holdSource` ⇒ las TRES claves en el MISMO objeto jsonb', () => {
    const p = buildTypedPayload('mobility', { hold_left_sec: '30', hold_right_sec: '28' }, 'b-mov', 1, {
      sideMode: 'per_side',
      holdSource: 'manual',
    })
    expect(p.actualHoldSec).toBe(58)
    expect(p.metadata).toEqual({ left_sec: 30, right_sec: 28, hold_source: 'manual' })
  })

  it('roller ⇒ siempre `manual` (R12: no tiene reloj en este tren)', () => {
    expect(
      buildTypedPayload('roller', { actual_duration_sec: '50', reps_done: '4' }, 'b-rol', 2, {
        holdSource: 'manual',
      }).metadata,
    ).toEqual({ hold_source: 'manual' })
  })

  it('cardio NO se toca: aunque le pasen `holdSource`, la key no aparece (CA-14)', () => {
    const p = buildTypedPayload('cardio', { cardio_min: '30' }, 'b-car', 1, { holdSource: 'timer' })
    expect('metadata' in p).toBe(false)
  })

  it('SIN `holdSource` los tres modos quedan byte-idénticos al comportamiento previo', () => {
    expect(buildTypedPayload('mobility', { actual_hold_sec: '30' }, 'b-mov', 1)).toEqual({
      blockId: 'b-mov',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 30,
      actualAvgHr: null,
    })
    expect(
      buildTypedPayload('mobility', { actual_hold_sec: '30' }, 'b-mov', 1, { sideMode: 'bilateral' }),
    ).not.toHaveProperty('metadata')
    expect(buildTypedPayload('cardio', { cardio_min: '30' }, 'b-car', 1)).toEqual({
      blockId: 'b-car',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: 1800,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
    })
    expect(buildTypedPayload('roller', { actual_duration_sec: '50', reps_done: '4' }, 'b-rol', 2)).toEqual({
      blockId: 'b-rol',
      setNumber: 2,
      weightKg: null,
      repsDone: 4,
      rpe: null,
      rir: null,
      actualDurationSec: 50,
      actualDistanceM: null,
      actualHoldSec: null,
      actualAvgHr: null,
    })
  })

  it('el 3.er argumento histórico (`sideMode` suelto) sigue funcionando y sale SIN marca', () => {
    const suelto = buildTypedPayload('mobility', { hold_left_sec: '30', hold_right_sec: '28' }, 'b-mov', 1, 'per_side')
    expect(suelto.metadata).toEqual({ left_sec: 30, right_sec: 28 })
  })
})
