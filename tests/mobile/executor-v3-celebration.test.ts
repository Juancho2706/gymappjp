/**
 * Adaptador de borde del PR en vivo del ejecutor V3 (E4.2) — `computeLivePr`. El motor (`detectPR`) tiene
 * su propia suite en el paquete; acá se valida SÓLO la capa de borde que re-empaqueta los datos de
 * `useWorkoutSession` (histórico reciente + máximo all-time) al shape del motor, incluida el ancla de peso
 * all-time que evita el PR falso "superé mi última vez pero no mi récord".
 */
import { describe, expect, it } from 'vitest'
import { computeLivePr } from '../../apps/mobile/components/alumno/workout/v3/pr-live'
import type { PrevSet } from '../../apps/mobile/lib/workout-session'

const hist = (rows: Array<[number, number]>, date = '2026-07-01'): PrevSet[] =>
  rows.map(([weight_kg, reps_done]) => ({ weight_kg, reps_done, date }))

describe('computeLivePr', () => {
  it('sin histórico ni máximo all-time NO es PR (primer registro)', () => {
    const r = computeLivePr({ weightKg: 100, repsDone: 5, substituted: false, history: [], allTimeMaxKg: 0 })
    expect(r.isPR).toBe(false)
    expect(r.prevBest).toBeNull()
  })

  it('supera el máximo all-time ⇒ PR de PESO', () => {
    const r = computeLivePr({
      weightKg: 105,
      repsDone: 3,
      substituted: false,
      history: hist([[100, 5]]),
      allTimeMaxKg: 100,
    })
    expect(r.isPR).toBe(true)
    expect(r.kind).toBe('weight')
    expect(r.prevBest?.weightKg).toBe(100)
  })

  it('mismo peso pero más reps que el histórico ⇒ PR de 1RM estimado (no de peso)', () => {
    const r = computeLivePr({
      weightKg: 100,
      repsDone: 8,
      substituted: false,
      history: hist([[100, 5]]),
      allTimeMaxKg: 100,
    })
    expect(r.isPR).toBe(true)
    expect(r.kind).toBe('e1rm')
  })

  it('el ancla all-time evita el PR falso: superar la última sesión NO basta si no supera el récord', () => {
    // Última sesión = 90 kg, pero el récord histórico es 110 kg. Levantar 100×2 supera la última sesión
    // pero NO el récord de peso, y su 1RM estimado (≈106,7) tampoco supera el del récord (110×1 ≈113,7)
    // → no es PR. El ancla all-time es lo que impide el falso positivo "superé mi última vez".
    const r = computeLivePr({
      weightKg: 100,
      repsDone: 2,
      substituted: false,
      history: hist([[90, 5]]),
      allTimeMaxKg: 110,
    })
    expect(r.isPR).toBe(false)
    expect(r.prevBest?.weightKg).toBe(110)
  })

  it('una serie con máquina sustituida nunca es PR (anti-PR-falso)', () => {
    const r = computeLivePr({
      weightKg: 200,
      repsDone: 10,
      substituted: true,
      history: hist([[100, 5]]),
      allTimeMaxKg: 100,
    })
    expect(r.isPR).toBe(false)
  })

  it('sin máximo all-time cae al histórico reciente para decidir el PR de peso', () => {
    const r = computeLivePr({
      weightKg: 85,
      repsDone: 5,
      substituted: false,
      history: hist([[80, 5]]),
      allTimeMaxKg: undefined,
    })
    expect(r.isPR).toBe(true)
    expect(r.kind).toBe('weight')
  })

  it('serie tipada (peso null) nunca es PR', () => {
    const r = computeLivePr({
      weightKg: null,
      repsDone: null,
      substituted: false,
      history: hist([[100, 5]]),
      allTimeMaxKg: 100,
    })
    expect(r.isPR).toBe(false)
  })
})
