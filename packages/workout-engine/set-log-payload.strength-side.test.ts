/**
 * Reps POR LADO en FUERZA (tren «ciclo real y por lado», R3/R4) en `buildStrengthPayload`.
 *
 * Cubre el 4º parámetro OPCIONAL `ctx`: con `side_mode ∈ {per_side, alternating}` el builder lee
 * `reps_left` / `reps_right`, escribe `reps_done` = MÍNIMO de los dos lados (R3) y deja el desglose
 * en `metadata {left_reps, right_reps}`. SIN `ctx` el payload es byte-idéntico al de hoy — ese es el
 * test de identidad que blinda a los 296 logs históricos y a los contratos congelados de
 * `executor-mapping.parity.test.ts`.
 *
 * El hold por lado de MOVILIDAD (E0.5, `set-log-payload.per-side.test.ts`) no se toca: vive en otra
 * rama (`typedLogValues`) y escribe otras keys del mismo jsonb (`left_sec`/`right_sec`).
 */
import { describe, it, expect } from 'vitest'
import { buildStrengthPayload, buildTypedPayload } from './set-log-payload'

describe('buildStrengthPayload — reps POR LADO (per_side / alternating)', () => {
  it('lados distintos: reps_done = el MÍNIMO (R3, nunca la suma) y metadata con ambos', () => {
    expect(
      buildStrengthPayload({ weight: '20', reps_left: '12', reps_right: '10' }, 'b1', 1, { sideMode: 'per_side' }),
    ).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 20,
      repsDone: 10,
      rpe: null,
      rir: null,
      note: null,
      metadata: { left_reps: 12, right_reps: 10 },
    })
  })

  it('lados iguales (10 / 10): reps_done = 10, no 20', () => {
    const p = buildStrengthPayload({ weight: '20', reps_left: '10', reps_right: '10' }, 'b1', 1, {
      sideMode: 'per_side',
    })
    expect(p.repsDone).toBe(10)
    expect(p.metadata).toEqual({ left_reps: 10, right_reps: 10 })
  })

  it('alternating captura igual que per_side (R4: misma serie, mismo shape)', () => {
    const values = { weight: '20', reps_left: '10', reps_right: '10' }
    expect(buildStrengthPayload(values, 'b1', 1, { sideMode: 'alternating' })).toEqual(
      buildStrengthPayload(values, 'b1', 1, { sideMode: 'per_side' }),
    )
  })

  it('acepta el sideMode suelto (forma histórica del 3er argumento tipado)', () => {
    const p = buildStrengthPayload({ weight: '20', reps_left: '9', reps_right: '11' }, 'b1', 1, 'per_side')
    expect(p.repsDone).toBe(9)
    expect(p.metadata).toEqual({ left_reps: 9, right_reps: 11 })
  })

  it('un solo lado tipeado: reps_done = ese lado y el otro va null explícito', () => {
    const izq = buildStrengthPayload({ reps_left: '10' }, 'b1', 1, { sideMode: 'per_side' })
    expect(izq.repsDone).toBe(10)
    expect(izq.metadata).toEqual({ left_reps: 10, right_reps: null })

    const der = buildStrengthPayload({ reps_right: '7' }, 'b1', 1, { sideMode: 'per_side' })
    expect(der.repsDone).toBe(7)
    expect(der.metadata).toEqual({ left_reps: null, right_reps: 7 })
  })

  it('ningún lado tipeado: reps_done null y SIN key metadata (no `metadata: null`)', () => {
    const p = buildStrengthPayload({ weight: '20' }, 'b1', 1, { sideMode: 'per_side' })
    expect(p.repsDone).toBeNull()
    expect(p).not.toHaveProperty('metadata')
  })

  it('coma es-CL: cada lado redondea a entero ANTES de comparar', () => {
    const p = buildStrengthPayload({ weight: '62,25', reps_left: '12,6', reps_right: '10,2' }, 'b1', 1, {
      sideMode: 'per_side',
    })
    expect(p.weightKg).toBe(62.25)
    expect(p.metadata).toEqual({ left_reps: 13, right_reps: 10 })
    expect(p.repsDone).toBe(10)
  })

  it('lado inválido (negativo, texto, vacío, > 9999) ⇒ ese lado null; manda el presente', () => {
    for (const malo of ['-1', 'abc', '', '10000']) {
      const p = buildStrengthPayload({ reps_left: malo, reps_right: '8' }, 'b1', 1, { sideMode: 'per_side' })
      expect(p.metadata).toEqual({ left_reps: null, right_reps: 8 })
      expect(p.repsDone).toBe(8)
    }
    // Los dos lados inválidos ⇒ no hay serie por lado: sin metadata y sin reps.
    const nada = buildStrengthPayload({ reps_left: '-1', reps_right: 'x' }, 'b1', 1, { sideMode: 'per_side' })
    expect(nada.repsDone).toBeNull()
    expect(nada).not.toHaveProperty('metadata')
  })

  it('0 reps en un lado es un dato válido (no se confunde con "vacío")', () => {
    const p = buildStrengthPayload({ reps_left: '0', reps_right: '8' }, 'b1', 1, { sideMode: 'per_side' })
    expect(p.metadata).toEqual({ left_reps: 0, right_reps: 8 })
    expect(p.repsDone).toBe(0)
  })

  it('conserva peso, RPE, RIR y nota (la captura por lado solo cambia el eje de reps)', () => {
    expect(
      buildStrengthPayload(
        { weight: '20,5', reps_left: '10', reps_right: '9', rpe: '8', rir: '2', note: '  duele  ' },
        'b2',
        3,
        { sideMode: 'per_side' },
      ),
    ).toEqual({
      blockId: 'b2',
      setNumber: 3,
      weightKg: 20.5,
      repsDone: 9,
      rpe: 8,
      rir: 2,
      note: 'duele',
      metadata: { left_reps: 10, right_reps: 9 },
    })
  })

  it('el metadata de FUERZA nunca emite left_sec/right_sec (ni el de movilidad left_reps/right_reps)', () => {
    const fuerza = buildStrengthPayload({ reps_left: '10', reps_right: '10' }, 'b1', 1, { sideMode: 'per_side' })
    expect(Object.keys(fuerza.metadata ?? {})).toEqual(['left_reps', 'right_reps'])
    const movilidad = buildTypedPayload('mobility', { hold_left_sec: '30', hold_right_sec: '25' }, 'b1', 1, 'per_side')
    expect(Object.keys(movilidad.metadata ?? {})).toEqual(['left_sec', 'right_sec'])
  })
})

describe('buildStrengthPayload — identidad sin ctx (byte a byte lo de hoy)', () => {
  // Espejo literal de los 4 `it` congelados de `executor-mapping.parity.test.ts:290-330`: si el
  // parámetro nuevo cambiara algo sin `ctx`, esto se pone rojo antes que la paridad web↔RN.
  it('completo: peso decimal, reps entero, rpe/rir, nota trim — y SIN key metadata', () => {
    const p = buildStrengthPayload({ weight: '60,5', reps: '10', rpe: '8', rir: '2', note: '  buena  ' }, 'b1', 1)
    expect(p).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: 60.5,
      repsDone: 10,
      rpe: 8,
      rir: 2,
      note: 'buena',
    })
    expect(p).not.toHaveProperty('metadata')
  })

  it('todo vacío ⇒ todos null, sin metadata', () => {
    const p = buildStrengthPayload({}, 'b1', 1)
    expect(p).toEqual({
      blockId: 'b1',
      setNumber: 1,
      weightKg: null,
      repsDone: null,
      rpe: null,
      rir: null,
      note: null,
    })
    expect(p).not.toHaveProperty('metadata')
  })

  it('ctx sin sideMode / con sideMode null o bilateral ⇒ mismo payload que sin ctx', () => {
    const values = { weight: '60', reps: '8', reps_left: '10', reps_right: '10' }
    const base = buildStrengthPayload(values, 'b1', 1)
    expect(base.repsDone).toBe(8)
    expect(base).not.toHaveProperty('metadata')
    expect(buildStrengthPayload(values, 'b1', 1, {})).toEqual(base)
    expect(buildStrengthPayload(values, 'b1', 1, null)).toEqual(base)
    expect(buildStrengthPayload(values, 'b1', 1, { sideMode: null })).toEqual(base)
    expect(buildStrengthPayload(values, 'b1', 1, 'bilateral')).toEqual(base)
  })
})
