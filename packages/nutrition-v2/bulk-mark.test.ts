import { describe, it, expect } from 'vitest'
import {
  bulkMarkSlotState,
  bulkMarkCtaLabel,
  consumedPrescriptionItemIds,
  type PrescriptionItemRead,
} from './bulk-mark'
import type { NutritionMealSlotRead, NutritionTodayReadModel } from './read-models'

// Fixtures mínimos: el helper solo lee prescriptionItems + intakeItems + unassignedIntake.
function item(id: string, opts: { optional?: boolean; calories?: number | null } = {}): PrescriptionItemRead {
  return {
    id,
    foodId: null,
    recipeId: null,
    name: `Item ${id}`,
    brand: null,
    quantity: 100,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: opts.optional ?? false,
    substitutionGroupId: null,
    notes: null,
    macros: {
      calories: opts.calories === undefined ? 100 : opts.calories,
      proteinG: null,
      carbsG: null,
      fatsG: null,
      fiberG: null,
    },
  }
}

function intake(prescriptionItemId: string | null) {
  return { prescriptionItemId } as NutritionMealSlotRead['intakeItems'][number]
}

function slot(
  id: string,
  items: PrescriptionItemRead[],
  intakeItems: ReturnType<typeof intake>[] = [],
): NutritionMealSlotRead {
  return {
    id,
    code: id,
    name: `Slot ${id}`,
    startTime: null,
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    prescriptionItems: items,
    intakeItems,
  } as unknown as NutritionMealSlotRead
}

function today(
  slots: NutritionMealSlotRead[],
  unassigned: ReturnType<typeof intake>[] = [],
): NutritionTodayReadModel {
  return { mealSlots: slots, unassignedIntake: unassigned } as unknown as NutritionTodayReadModel
}

describe('bulkMarkSlotState', () => {
  it('all-open: ningún requerido consumido → CTA "Comí toda esta comida", suma kcal', () => {
    const s = slot('s1', [item('a', { calories: 100 }), item('b', { calories: 50 }), item('c', { calories: 30 })])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.status).toBe('all-open')
    expect(state.eligible.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(state.requiredTotal).toBe(3)
    expect(state.requiredConsumed).toBe(0)
    expect(state.remaining).toBe(3)
    expect(state.eligibleKcal).toBe(180)
    expect(bulkMarkCtaLabel(state)).toBe('Comí toda esta comida')
  })

  it('partial: algunos consumidos → CTA "Comer lo que falta (N)" solo con los faltantes', () => {
    const s = slot('s1', [item('a'), item('b'), item('c')], [intake('a')])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.status).toBe('partial')
    expect(state.eligible.map((i) => i.id)).toEqual(['b', 'c'])
    expect(state.requiredConsumed).toBe(1)
    expect(state.remaining).toBe(2)
    expect(bulkMarkCtaLabel(state)).toBe('Comer lo que falta (2)')
  })

  it('complete: todos los requeridos consumidos → sin CTA', () => {
    const s = slot('s1', [item('a'), item('b')], [intake('a'), intake('b')])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.status).toBe('complete')
    expect(state.eligible).toHaveLength(0)
    expect(bulkMarkCtaLabel(state)).toBeNull()
  })

  it('none-required: franja solo con opcionales → sin control', () => {
    const s = slot('s1', [item('a', { optional: true }), item('b', { optional: true })])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.status).toBe('none-required')
    expect(state.requiredTotal).toBe(0)
    expect(bulkMarkCtaLabel(state)).toBeNull()
  })

  it('excluye opcionales del bulk (aunque no estén consumidos)', () => {
    const s = slot('s1', [item('a'), item('b'), item('opt', { optional: true })])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.status).toBe('all-open')
    expect(state.requiredTotal).toBe(2)
    expect(state.eligible.map((i) => i.id)).toEqual(['a', 'b'])
    expect(state.eligible.some((i) => i.id === 'opt')).toBe(false)
  })

  it('cuenta consumo desde intakes SIN franja (unassignedIntake)', () => {
    const s = slot('s1', [item('a'), item('b')])
    const state = bulkMarkSlotState(today([s], [intake('a')]), s)
    expect(state.status).toBe('partial')
    expect(state.eligible.map((i) => i.id)).toEqual(['b'])
  })

  it('kcal nulas cuentan como 0', () => {
    const s = slot('s1', [item('a', { calories: null }), item('b', { calories: 40 })])
    const state = bulkMarkSlotState(today([s]), s)
    expect(state.eligibleKcal).toBe(40)
  })
})

describe('consumedPrescriptionItemIds', () => {
  it('junta ids de franjas y sin franja, ignora null', () => {
    const s1 = slot('s1', [item('a')], [intake('a'), intake(null)])
    const s2 = slot('s2', [item('b')], [])
    const ids = consumedPrescriptionItemIds(today([s1, s2], [intake('z')]))
    expect([...ids].sort()).toEqual(['a', 'z'])
  })
})
