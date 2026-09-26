/**
 * Kilos o libras (tren kg-lb-ejecutor, docs/specs/kg-lb-ejecutor): conversión única del motor.
 *
 * Blinda las tres promesas del SPEC que se pueden romper sin que nadie lo note:
 *  - R2: ida y vuelta exacta a 0,1 lb con `numeric(6,2)` (45 lb se guarda y vuelve a verse 45 lb);
 *  - R7: la conversión ocurre UNA vez, en el payload, y sin unidad todo queda byte-idéntico;
 *  - D5: el coach lee kilos correctos con la unidad tecleada al lado.
 */
import { describe, it, expect } from 'vitest'
import {
  KG_PER_LB,
  WHEEL_WEIGHT_SPECS,
  convertTypedWeight,
  isWeightUnit,
  normalizeWeightUnit,
  resolveInitialWeightUnit,
  suggestedWeightInUnit,
  weightFromKg,
  weightToKg,
} from './weight-unit'
import { buildStrengthPayload, buildStrengthTimePayload } from './set-log-payload'
import {
  formatLoggedWeight,
  formatStrengthSetLine,
  formatStrengthTimeSetLine,
} from './logged-set-summary'
import { applyOptimisticSessionLog, buildOptimisticSessionLog } from './session-logs.optimistic'
import { reconcileSessionLogs, type WorkoutOfflineLog } from './session-logs.reconcile'

/** Lo que hace Postgres con `numeric(6,2)`: redondea a centésimas. */
const toNumeric62 = (kg: number) => Math.round(kg * 100) / 100

describe('unidades', () => {
  it('solo kg y lb son unidades de peso; sec, null y basura no', () => {
    expect(isWeightUnit('kg')).toBe(true)
    expect(isWeightUnit('lb')).toBe(true)
    expect(isWeightUnit('sec')).toBe(false)
    expect(isWeightUnit(null)).toBe(false)
    expect(isWeightUnit('LB')).toBe(false)
  })

  it('normalizeWeightUnit: todo lo que no sea lb es kilos (serie vieja sin unidad = kg, R7)', () => {
    expect(normalizeWeightUnit('lb')).toBe('lb')
    expect(normalizeWeightUnit('kg')).toBe('kg')
    expect(normalizeWeightUnit(undefined)).toBe('kg')
    expect(normalizeWeightUnit('sec')).toBe('kg')
  })

  it('la libra es la internacional exacta', () => {
    expect(KG_PER_LB).toBe(0.45359237)
  })
})

describe('conversión tipeado ↔ kg', () => {
  it('kg viaja tal cual (el camino de hoy no redondea)', () => {
    expect(weightToKg(62.5, 'kg')).toBe(62.5)
    expect(weightToKg(20.125, 'kg')).toBe(20.125)
    expect(weightFromKg(62.5, 'kg')).toBe(62.5)
  })

  it('lb → kg a centésimas (precisión de numeric(6,2))', () => {
    expect(weightToKg(45, 'lb')).toBe(20.41)
    expect(weightToKg(50, 'lb')).toBe(22.68)
    expect(weightToKg(0, 'lb')).toBe(0)
    expect(weightToKg(999, 'lb')).toBe(453.14)
  })

  it.each([0, 1, 2.5, 5, 10, 25, 45, 47.5, 50, 132.5, 190, 210, 225, 315, 405, 999])(
    'ida y vuelta exacta a 0,1 lb: %s lb → kg (numeric 6,2) → lb',
    (lb) => {
      const stored = toNumeric62(weightToKg(lb, 'lb'))
      expect(weightFromKg(stored, 'lb')).toBe(lb)
    },
  )

  it('cambiar el selector con un número escrito lo convierte, no lo duplica (R1)', () => {
    expect(convertTypedWeight(20, 'kg', 'lb')).toBe(44.1)
    expect(convertTypedWeight(50, 'lb', 'kg')).toBe(22.68)
    expect(convertTypedWeight(35, 'lb', 'lb')).toBe(35)
    expect(convertTypedWeight(35, 'kg', 'kg')).toBe(35)
  })
})

describe('unidad inicial del selector (D2 = a)', () => {
  it('última usada en el ejercicio > la del bloque > kg', () => {
    expect(resolveInitialWeightUnit({ lastUsed: 'lb', blockUnit: 'kg' })).toBe('lb')
    expect(resolveInitialWeightUnit({ lastUsed: 'kg', blockUnit: 'lb' })).toBe('kg')
    expect(resolveInitialWeightUnit({ lastUsed: null, blockUnit: 'lb' })).toBe('lb')
    expect(resolveInitialWeightUnit({})).toBe('kg')
  })

  it('load_unit = sec (fuerza por tiempo) no es una unidad de peso ⇒ kg', () => {
    expect(resolveInitialWeightUnit({ blockUnit: 'sec' })).toBe('kg')
  })
})

describe('sugerencias y rueda', () => {
  it('una sugerencia en libras se redondea al 2,5 más cercano (R3)', () => {
    expect(suggestedWeightInUnit(22.5, 'lb')).toBe(50)
    expect(suggestedWeightInUnit(20.41, 'lb')).toBe(45)
    expect(suggestedWeightInUnit(21, 'lb')).toBe(47.5)
    expect(suggestedWeightInUnit(22.5, 'kg')).toBe(22.5)
  })

  it('rueda kg sin cambios (0–400 / 2,5) y rueda lb 0–900 / 2,5', () => {
    expect(WHEEL_WEIGHT_SPECS.kg).toEqual({ step: 2.5, min: 0, max: 400 })
    expect(WHEEL_WEIGHT_SPECS.lb).toEqual({ step: 2.5, min: 0, max: 900 })
  })
})

describe('payload de fuerza: único punto de conversión (R2/R7)', () => {
  it('sin unidad en el contexto ⇒ byte-idéntico a lo previo (sin key weightUnit)', () => {
    const p = buildStrengthPayload({ weight: '45', reps: '8' }, 'b1', 1)
    expect(p).toEqual({ blockId: 'b1', setNumber: 1, weightKg: 45, repsDone: 8, rpe: null, rir: null, note: null })
    expect(p).not.toHaveProperty('weightUnit')
  })

  it('lb: el número tipeado se guarda en kilos y la unidad viaja', () => {
    const p = buildStrengthPayload({ weight: '45', reps: '8' }, 'b1', 1, { weightUnit: 'lb' })
    expect(p.weightKg).toBe(20.41)
    expect(p.weightUnit).toBe('lb')
  })

  it('kg explícito: número tal cual y la unidad viaja (el alumno eligió kilos)', () => {
    const p = buildStrengthPayload({ weight: '62,5', reps: '5' }, 'b1', 1, { weightUnit: 'kg' })
    expect(p.weightKg).toBe(62.5)
    expect(p.weightUnit).toBe('kg')
  })

  it('peso vacío en lb ⇒ weightKg null (peso corporal), la unidad igual viaja', () => {
    const p = buildStrengthPayload({ weight: '', reps: '10' }, 'b1', 1, { weightUnit: 'lb' })
    expect(p.weightKg).toBeNull()
    expect(p.weightUnit).toBe('lb')
  })

  it('unidad basura o sec ⇒ se ignora (byte-idéntico)', () => {
    const p = buildStrengthPayload({ weight: '45', reps: '8' }, 'b1', 1, { weightUnit: 'sec' })
    expect(p.weightKg).toBe(45)
    expect(p).not.toHaveProperty('weightUnit')
  })

  it('convive con reps por lado: metadata intacta, peso convertido', () => {
    const p = buildStrengthPayload({ weight: '25', reps_left: '10', reps_right: '9' }, 'b1', 2, {
      sideMode: 'per_side',
      weightUnit: 'lb',
    })
    expect(p.weightKg).toBe(11.34)
    expect(p.repsDone).toBe(9)
    expect(p.metadata).toEqual({ left_reps: 10, right_reps: 9 })
    expect(p.weightUnit).toBe('lb')
  })

  it('fuerza por tiempo: mismo contrato', () => {
    const p = buildStrengthTimePayload({ weight: '20', actual_hold_sec: '30' }, 'b2', 1, { weightUnit: 'lb' })
    expect(p.weightKg).toBe(9.07)
    expect(p.actualHoldSec).toBe(30)
    expect(p.weightUnit).toBe('lb')
    expect(buildStrengthTimePayload({ weight: '20', actual_hold_sec: '30' }, 'b2', 1)).not.toHaveProperty('weightUnit')
  })
})

describe('lecturas (R3 alumno · D5 coach)', () => {
  it('sin opciones ⇒ «20,4 kg», idéntico al formato previo', () => {
    expect(formatLoggedWeight(20.41)).toBe('20,4 kg')
    expect(formatLoggedWeight(60)).toBe('60 kg')
  })

  it('alumno en libras: «45 lb»', () => {
    expect(formatLoggedWeight(20.41, { unit: 'lb' })).toBe('45 lb')
    expect(formatLoggedWeight(22.68, { unit: 'lb' })).toBe('50 lb')
  })

  it('coach: kilos correctos + unidad tecleada «20,4 kg (45 lb)»', () => {
    expect(formatLoggedWeight(20.41, { enteredUnit: 'lb' })).toBe('20,4 kg (45 lb)')
    expect(formatLoggedWeight(20, { enteredUnit: 'kg' })).toBe('20 kg')
    expect(formatLoggedWeight(20, { enteredUnit: null })).toBe('20 kg')
  })

  const perSide = { weight_kg: 20.41, metadata: { left_reps: 10, right_reps: 10 }, weight_unit: 'lb' }

  it('línea de fuerza por lado: sin opciones igual que hoy; alumno lb; coach anotado', () => {
    expect(formatStrengthSetLine(perSide)).toBe('20,4 kg × 10 / 10')
    expect(formatStrengthSetLine(perSide, { unit: 'lb' })).toBe('45 lb × 10 / 10')
    expect(formatStrengthSetLine(perSide, { annotateEntered: true })).toBe('20,4 kg (45 lb) × 10 / 10')
  })

  it('línea de fuerza por tiempo: mismo contrato', () => {
    const log = { weight_kg: 9.07, reps_done: 5, actual_hold_sec: 30, weight_unit: 'lb' }
    expect(formatStrengthTimeSetLine(log)).toBe('9,1 kg × 5 · 30 s')
    expect(formatStrengthTimeSetLine(log, { unit: 'lb' })).toBe('20 lb × 5 · 30 s')
    expect(formatStrengthTimeSetLine(log, { annotateEntered: true })).toBe('9,1 kg (20 lb) × 5 · 30 s')
  })
})

describe('la unidad no se pierde en el optimismo ni en la cola offline', () => {
  const base = { blockId: 'b1', setNumber: 1, weightKg: 20.41, repsDone: 8, rpe: null, rir: null }

  it('optimista: viaja solo si existe', () => {
    expect(buildOptimisticSessionLog({ ...base, weightUnit: 'lb' }).weight_unit).toBe('lb')
    expect(buildOptimisticSessionLog(base)).not.toHaveProperty('weight_unit')
    const list = applyOptimisticSessionLog([], { ...base, weightUnit: 'lb' })
    expect(list[0]).toMatchObject({ weight_kg: 20.41, weight_unit: 'lb' })
  })

  it('cola offline: un item con unidad la conserva; uno viejo sin unidad no la inventa', () => {
    const queued: WorkoutOfflineLog[] = [
      { ...base, planId: 'p', coachSlug: 'c', timestamp: 1, weightUnit: 'lb' },
      { ...base, setNumber: 2, weightKg: 45, planId: 'p', coachSlug: 'c', timestamp: 2 },
    ]
    const out = reconcileSessionLogs([], queued)
    const s1 = out.find((l) => l.set_number === 1)!
    const s2 = out.find((l) => l.set_number === 2)!
    expect(s1).toMatchObject({ weight_kg: 20.41, weight_unit: 'lb', _pending: true })
    expect(s2.weight_kg).toBe(45)
    expect(s2).not.toHaveProperty('weight_unit')
  })
})
