/**
 * Hold de movilidad POR LADO (E0.5 · executor-v3) en el mapeo valores->columnas del log.
 *
 * Cubre el parámetro OPCIONAL `sideMode` de `typedLogValues` / `buildTypedPayload`: con
 * `side_mode === 'per_side'` el hold se tipea por lado (`hold_left_sec` / `hold_right_sec`) y se
 * mapea a `metadata {left_sec, right_sec}` + `actual_hold_sec` = SUMA L+R. SIN el parámetro el
 * comportamiento es byte-idéntico al previo (paridad) — el contrato congelado de
 * `executor-mapping.parity.test.ts` NO se toca; esto solo agrega el eje nuevo.
 */
import { describe, it, expect } from 'vitest'
import { typedLogValues, buildTypedPayload } from './set-log-payload'

describe('typedLogValues — hold POR LADO (per_side)', () => {
  it('suma L+R en actual_hold_sec y arma metadata {left_sec, right_sec} (enteros)', () => {
    expect(typedLogValues('mobility', { hold_left_sec: '30', hold_right_sec: '25' }, 'per_side')).toEqual({
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 55,
      actualAvgHr: null,
      repsDone: null,
      metadata: { left_sec: 30, right_sec: 25 },
    })
  })

  it('redondea a entero cada lado antes de sumar (coma es-CL)', () => {
    const v = typedLogValues('mobility', { hold_left_sec: '30,4', hold_right_sec: '25,6' }, 'per_side')
    expect(v.metadata).toEqual({ left_sec: 30, right_sec: 26 })
    expect(v.actualHoldSec).toBe(56)
  })

  it('un solo lado tipeado: el otro queda null y la suma cuenta solo el presente', () => {
    const v = typedLogValues('mobility', { hold_left_sec: '40' }, 'per_side')
    expect(v.metadata).toEqual({ left_sec: 40, right_sec: null })
    expect(v.actualHoldSec).toBe(40)
  })

  it('per_side sin ningún lado: metadata null y actual_hold_sec null', () => {
    const v = typedLogValues('mobility', {}, 'per_side')
    expect(v.metadata).toBeNull()
    expect(v.actualHoldSec).toBeNull()
  })
})

describe('typedLogValues — paridad sin sideMode (byte-idéntico)', () => {
  it('mobility bilateral: un solo hold desde actual_hold_sec y SIN key metadata', () => {
    const v = typedLogValues('mobility', { actual_hold_sec: '30' })
    expect(v).toEqual({
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 30,
      actualAvgHr: null,
      repsDone: null,
    })
    expect(v).not.toHaveProperty('metadata')
  })

  it('cardio y roller ignoran sideMode=per_side (sin metadata, mapeo intacto)', () => {
    const cardio = typedLogValues('cardio', { cardio_min: '20' }, 'per_side')
    expect(cardio).toEqual({ actualDurationSec: 1200, actualDistanceM: null, actualHoldSec: null, actualAvgHr: null, repsDone: null })
    expect(cardio).not.toHaveProperty('metadata')
    const roller = typedLogValues('roller', { actual_duration_sec: '45', reps_done: '3' }, 'per_side')
    expect(roller).not.toHaveProperty('metadata')
    expect(roller.repsDone).toBe(3)
  })
})

describe('buildTypedPayload — hold POR LADO (per_side)', () => {
  it('serie per_side: metadata + suma en actual_hold_sec, peso/rir null', () => {
    expect(buildTypedPayload('mobility', { hold_left_sec: '30', hold_right_sec: '25' }, 'b1', 1, 'per_side')).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 55,
      actualAvgHr: null,
      metadata: { left_sec: 30, right_sec: 25 },
    })
  })

  it('per_side conserva el rpe sembrado post-log (edición)', () => {
    const p = buildTypedPayload('mobility', { hold_left_sec: '20', hold_right_sec: '20', rpe: '7' }, 'b2', 2, 'per_side')
    expect(p.rpe).toBe(7)
    expect(p.actualHoldSec).toBe(40)
    expect(p.metadata).toEqual({ left_sec: 20, right_sec: 20 })
  })

  it('paridad: sin sideMode el payload NO gana la key metadata (mobility bilateral)', () => {
    const p = buildTypedPayload('mobility', { actual_hold_sec: '40' }, 'b3', 3)
    expect(p).toEqual({
      blockId: 'b3',
      setNumber: 3,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      actualDurationSec: null,
      actualDistanceM: null,
      actualHoldSec: 40,
      actualAvgHr: null,
    })
    expect(p).not.toHaveProperty('metadata')
  })
})
