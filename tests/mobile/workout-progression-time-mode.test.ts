/**
 * Guard D4/H9 en el port RN de la sobrecarga progresiva (specs/cuenta-atras-en-pantalla, **W3.1c**) —
 * espejo exacto del test web `apps/web/src/lib/workout/progression.test.ts` §«modo TIEMPO apaga la
 * doble progresión», que cubre W1.16.
 *
 * `apps/mobile/lib/workout/progression.ts` es un port 1:1 del web y lo consume `ExecutorV3` vía
 * `computeEffectiveTarget`; sin este guard un bloque de fuerza POR TIEMPO con doble progresión queda
 * en `holding` para siempre en RN («mantén el peso hasta completar 30 reps» de un hold de 30 s), que
 * es justo el bug que el guard web ya evita. Anti-drift: los dos motores tienen que decir lo mismo.
 */
import { describe, expect, it } from 'vitest'
import {
  computeEffectiveTarget,
  parseRepsTop,
  type ProgressionBlockInput,
} from '../../apps/mobile/lib/workout/progression'

/** Plancha con disco: 3 × 30 s, el espejo legacy `reps` dice "30s" (NOT NULL en la DB). */
const timeBlock = (over: Partial<ProgressionBlockInput> = {}): ProgressionBlockInput => ({
  target_weight_kg: 10,
  progression_type: 'weight',
  progression_value: 2.5,
  progression_mode: 'double',
  reps: '30s',
  reps_unit: 'sec',
  duration_sec: 30,
  sets: 3,
  ...over,
})

describe('computeEffectiveTarget (RN) — modo TIEMPO apaga la doble progresión (D4/H9)', () => {
  it('el bug que evita: parseRepsTop("30s") lee 30 "reps" que no existen', () => {
    expect(parseRepsTop('30s')).toBe(30)
    expect(parseRepsTop('1m30s')).toBe(30)
  })

  it('con repsDone [null, null, null] NO devuelve holding: cae a weekly_linear', () => {
    const r = computeEffectiveTarget(timeBlock(), {
      currentWeek: 3,
      weeksToRepeat: 8,
      lastSession: { weightKg: 10, repsDone: [null, null, null] },
    })
    expect(r.holding).toBe(false)
    expect(r.status).not.toBe('holding')
    expect(r.repsTopToUnlock).toBeNull()
    // weekly_linear de la semana 3: 10 + 2 × 2,5 = 15
    expect(r.weightKg).toBe(15)
    expect(r.status).toBe('progressed')
    // `mode` reporta el modo EFECTIVO, no el declarado (mismo precedente que el fallback ya
    // existente cuando el rango de reps no se puede parsear).
    expect(r.mode).toBe('weekly_linear')
  })

  it('idéntico a lo que daría el bloque con progression_mode weekly_linear', () => {
    const ctx = {
      currentWeek: 3,
      weeksToRepeat: 8,
      lastSession: { weightKg: 10, repsDone: [null, null, null] },
    }
    expect(computeEffectiveTarget(timeBlock(), ctx)).toEqual(
      computeEffectiveTarget(timeBlock({ progression_mode: 'weekly_linear' }), ctx),
    )
  })

  it('sin última sesión tampoco se cuelga (semana 1 = base)', () => {
    const r = computeEffectiveTarget(timeBlock(), { currentWeek: 1, weeksToRepeat: 8 })
    expect(r.weightKg).toBe(10)
    expect(r.holding).toBe(false)
    expect(r.status).toBe('flat')
  })

  it('el AND del predicado manda: sin reps_unit "sec" el guard NO se activa (H8)', () => {
    // Los 2 bloques strength de LIVE con `duration_sec` y `reps_unit NULL` son fuerza clásica:
    // su doble progresión tiene que seguir funcionando exactamente como hoy.
    const r = computeEffectiveTarget(timeBlock({ reps: '8-12', reps_unit: null, duration_sec: 600 }), {
      currentWeek: 3,
      lastSession: { weightKg: 10, repsDone: [12, 12, 12] },
    })
    expect(r.status).toBe('progressed')
    expect(r.repsTopToUnlock).toBe(12)
    expect(r.weightKg).toBe(12.5) // desde el peso de la última sesión, no desde la semana
  })

  it('un bloque de REPS con "double" sigue byte-idéntico (holding y progressed)', () => {
    const repsBlock = (): ProgressionBlockInput => ({
      target_weight_kg: 50,
      progression_type: 'weight',
      progression_value: 2.5,
      progression_mode: 'double',
      reps: '8-12',
      sets: 3,
    })
    const holding = computeEffectiveTarget(repsBlock(), {
      currentWeek: 4,
      lastSession: { weightKg: 52.5, repsDone: [12, 11, 10] },
    })
    expect(holding.status).toBe('holding')
    expect(holding.weightKg).toBe(52.5)
    expect(holding.repsTopToUnlock).toBe(12)

    const progressed = computeEffectiveTarget(repsBlock(), {
      currentWeek: 4,
      lastSession: { weightKg: 52.5, repsDone: [12, 12, 12] },
    })
    expect(progressed.status).toBe('progressed')
    expect(progressed.weightKg).toBe(55)
  })
})
