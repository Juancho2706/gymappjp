/**
 * Helpers RN del tren kg-lb-ejecutor (W4): valores tecleados con marca de unidad, lecturas en la unidad
 * del ejercicio, peso objetivo del builder y chip de sobrecarga. Todos puros.
 */
import { describe, expect, it } from 'vitest'
import {
  suggestionNum,
  valuesInWeightUnit,
  weightNum,
} from '../../apps/mobile/components/alumno/workout/weight-unit-context'
import {
  builderWeightUnit,
  targetWeightInputValue,
  targetWeightLabel,
} from '../../apps/mobile/lib/plan-builder/target-weight'
import { overloadChipLabel } from '../../apps/mobile/components/alumno/workout/workout-ui'

describe('valuesInWeightUnit — lo tecleado en la unidad del ejercicio', () => {
  it('kilos sin marca ⇒ el MISMO objeto (camino previo al tren intacto)', () => {
    const v = { weight: '60', reps: '8' }
    expect(valuesInWeightUnit(v, 'kg')).toBe(v)
  })

  it('semilla en kilos (sin marca) ⇒ libras a décimas + marca', () => {
    expect(valuesInWeightUnit({ weight: '20', reps: '8' }, 'lb')).toEqual({ weight: '44,1', reps: '8', wu: 'lb' })
  })

  it('borrador ya escrito en libras ⇒ no se reconvierte', () => {
    const v = { weight: '45', wu: 'lb' }
    expect(valuesInWeightUnit(v, 'lb')).toBe(v)
  })

  it('borrador en libras abierto con el ejercicio en kilos ⇒ kilos a centésimas', () => {
    expect(valuesInWeightUnit({ weight: '50', wu: 'lb' }, 'kg')).toEqual({ weight: '22,68', wu: 'kg' })
  })

  it('sin peso escrito solo cambia la marca', () => {
    expect(valuesInWeightUnit({ reps: '8' }, 'lb')).toEqual({ reps: '8', wu: 'lb' })
  })

  it('null / undefined pasan tal cual', () => {
    expect(valuesInWeightUnit(null, 'lb')).toBeNull()
    expect(valuesInWeightUnit(undefined, 'lb')).toBeUndefined()
  })
})

describe('lecturas', () => {
  it('weightNum: kg ⇒ el número tal cual; lb ⇒ es-CL a décimas', () => {
    expect(weightNum(20.41, 'kg')).toBe(20.41)
    expect(weightNum(20.41, 'lb')).toBe('45')
  })

  it('suggestionNum: en lb redondea al 2,5 (nadie carga 49,6 lb)', () => {
    expect(suggestionNum(60, 'kg')).toBe(60)
    expect(suggestionNum(60, 'lb')).toBe('132,5')
    expect(suggestionNum(22.5, 'lb')).toBe('50')
  })
})

describe('peso objetivo del builder (D3 = a)', () => {
  it('sin unidad o en kg: el string crudo de siempre', () => {
    expect(builderWeightUnit({})).toBe('kg')
    expect(builderWeightUnit({ load_unit: 'sec' })).toBe('kg')
    expect(targetWeightInputValue({ target_weight_kg: '62.5' })).toBe('62.5')
    expect(targetWeightLabel({ target_weight_kg: '62.5' })).toBe('62.5 kg')
  })

  it('en lb: el input y el rótulo muestran libras a partir de los kilos guardados', () => {
    const block = { target_weight_kg: '20.41', load_unit: 'lb' }
    expect(builderWeightUnit(block)).toBe('lb')
    expect(targetWeightInputValue(block)).toBe('45')
    expect(targetWeightLabel(block)).toBe('45 lb')
    expect(targetWeightLabel(block, '')).toBe('45lb')
  })

  it('número de la base (no string) y vacío', () => {
    expect(targetWeightLabel({ target_weight_kg: 60, load_unit: 'kg' })).toBe('60 kg')
    expect(targetWeightLabel({ target_weight_kg: null, load_unit: 'lb' })).toBeNull()
  })
})

describe('overloadChipLabel en la unidad del ejercicio', () => {
  const block = { progression_type: 'weight' as const, progression_value: 2.5, target_weight_kg: 60 }
  const eff = {
    mode: 'weekly_linear',
    modeImplemented: true,
    isProgressed: true,
    weightKg: 65,
    baseWeightKg: 60,
    addedKg: 5,
    weeksApplied: 2,
  } as unknown as Parameters<typeof overloadChipLabel>[1]

  it('kg ⇒ texto idéntico al previo', () => {
    expect(overloadChipLabel(block, eff, 3)).toBe('Sem 3 · 65 kg')
    expect(overloadChipLabel(block, { ...eff!, isProgressed: false }, 3)).toBe('+2.5 kg/sem')
  })

  it('lb ⇒ objetivo redondeado a 2,5 lb e incremento a décimas', () => {
    expect(overloadChipLabel(block, eff, 3, 'lb')).toBe('Sem 3 · 142,5 lb')
    expect(overloadChipLabel(block, { ...eff!, isProgressed: false }, 3, 'lb')).toBe('+5,5 lb/sem')
  })
})
