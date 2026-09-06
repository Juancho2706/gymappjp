import { describe, expect, it } from 'vitest'
import {
  consumedEntryForItem,
  formatIntakeClock,
  isPortionMarkEntry,
  isPriorVersionEntry,
  outOfPlanEntries,
  prescribedItemImplausibleCopy,
  prescribedItemPlausibility,
  priorVersionCalories,
  priorVersionEntries,
  slotFreeEntries,
  slotPortionMarksTotal,
  slotPriorVersionEntries,
} from './today-entries'
import type { NutritionIntakeReadItem, NutritionMealSlotRead, NutritionTodayReadModel } from './read-models'

// Fixtures portados VERBATIM del test web (`nutrition-today.logic.test.ts`), que sigue verde
// contra las re-exportaciones: la mudanza no puede cambiar ni un caso.
const SLOT: NutritionMealSlotRead = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'lunch',
  name: 'Almuerzo',
  startTime: '13:00',
  endTime: null,
  mode: 'anchor',
  required: true,
  instructions: null,
  targets: {},
  prescriptionItems: [],
  intakeItems: [],
}

const ITEM: NutritionMealSlotRead['prescriptionItems'][number] = {
  id: '22222222-2222-4222-8222-222222222222',
  foodId: '44444444-4444-4444-8444-444444444444',
  recipeId: null,
  name: 'Pechuga de pollo',
  brand: null,
  quantity: 200,
  unit: 'g',
  minimumQuantity: null,
  maximumQuantity: null,
  optional: false,
  substitutionGroupId: null,
  notes: null,
  macros: { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7.2, fiberG: null },
}

function intakeEntry(overrides: Partial<NutritionIntakeReadItem> & { id: string }): NutritionIntakeReadItem {
  return {
    foodId: null,
    customName: 'Registro',
    quantity: 1,
    unit: 'un',
    mealSlot: 'lunch',
    source: 'offplan',
    captureMethod: 'manual',
    occurredAt: '2026-07-29T16:04:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: null,
    snapshot: {
      name: 'Registro',
      brand: null,
      calories: 100,
      proteinG: 5,
      carbsG: 10,
      fatsG: 2,
      fiberG: null,
      servingSize: 1,
      servingUnit: 'un',
    },
    totals: { calories: 100, proteinG: 5, carbsG: 10, fatsG: 2, fiberG: 0 },
    ...overrides,
  }
}

function todayModel(overrides: Partial<NutritionTodayReadModel>): NutritionTodayReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-29T00:00:00.000Z',
    localDate: '2026-07-29',
    timezone: 'America/Santiago',
    snapshotId: null,
    plan: null,
    targets: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
    remaining: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    mealSlots: [],
    unassignedIntake: [],
    syncToken: 'token',
    ...overrides,
  }
}

describe('isPortionMarkEntry', () => {
  it('una marca sintetica de porcion trae grupo + porciones > 0', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e1', exchangeGroupCode: 'C', exchangePortions: 1.5 }))).toBe(true)
  })

  it('un alimento libre normal (sin grupo) no es marca de porcion', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e2' }))).toBe(false)
  })

  it('una correctora fantasma de 0 kcal (exchangePortions null) tampoco cuenta como marca', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e3', exchangeGroupCode: 'C', exchangePortions: null }))).toBe(false)
  })
})

describe('consumedEntryForItem / slotFreeEntries / slotPortionMarksTotal', () => {
  const prescribed = intakeEntry({ id: 'p1', prescriptionItemId: ITEM.id, customName: null, foodId: ITEM.foodId })
  const free = intakeEntry({ id: 'f1', prescriptionItemId: null })
  const orphan = intakeEntry({ id: 'o1', prescriptionItemId: 'no-existe-ya' })
  const portionMark = intakeEntry({ id: 'm1', exchangeGroupCode: 'C', exchangePortions: 1.5 })
  const slot: NutritionMealSlotRead = {
    ...SLOT,
    prescriptionItems: [ITEM],
    intakeItems: [prescribed, free, orphan, portionMark],
  }

  it('encuentra el registro del item prescrito por prescriptionItemId', () => {
    expect(consumedEntryForItem(slot, ITEM.id)?.id).toBe('p1')
    expect(consumedEntryForItem(slot, 'otro-item')).toBeNull()
  })

  it('lo libre + lo huerfano entran a "Fuera del plan" de la franja; la marca de porcion NO', () => {
    const ids = slotFreeEntries(slot).map((entry) => entry.id)
    expect(ids.sort()).toEqual(['f1', 'o1'])
  })

  it('suma todas las porciones marcadas de la franja en un solo numero', () => {
    expect(slotPortionMarksTotal(slot)).toBe(1.5)
    expect(slotPortionMarksTotal({ ...SLOT, intakeItems: [free] })).toBe(0)
  })
})

describe('outOfPlanEntries', () => {
  it('junta lo sin franja con lo de franjas que no se renderizan (nunca desaparece un registro)', () => {
    const strandedSlotEntry = intakeEntry({ id: 's1', mealSlot: 'snack', occurredAt: '2026-07-29T10:00:00.000Z' })
    const strandedSlot: NutritionMealSlotRead = { ...SLOT, id: 'snack-id', code: 'snack', intakeItems: [strandedSlotEntry] }
    const unassigned = intakeEntry({ id: 'u1', mealSlot: null, occurredAt: '2026-07-29T08:00:00.000Z' })
    const model = todayModel({ mealSlots: [strandedSlot], unassignedIntake: [unassigned] })

    const out = outOfPlanEntries(model, new Set(['lunch']))
    expect(out.map((entry) => entry.id)).toEqual(['u1', 's1'])
  })

  it('una franja renderizada no aporta nada a "Fuera del plan"', () => {
    const model = todayModel({ mealSlots: [{ ...SLOT, intakeItems: [intakeEntry({ id: 'p1' })] }] })
    expect(outOfPlanEntries(model, new Set(['lunch']))).toHaveLength(0)
  })
})

describe('formatIntakeClock', () => {
  it('formatea la hora en la zona indicada (UTC, deterministico)', () => {
    expect(formatIntakeClock('2026-07-29T13:04:00.000Z', 'UTC')).toBe('13:04')
  })

  it('fecha invalida ⇒ cadena vacia (nunca revienta el render)', () => {
    expect(formatIntakeClock('no-es-fecha', 'UTC')).toBe('')
  })
})

// ── Registros de una versión anterior del plan (SPEC cantidades-honestas §4.4) ────

describe('isPriorVersionEntry / slotPriorVersionEntries', () => {
  const free = intakeEntry({ id: 'f1', prescriptionItemId: null })
  const orphan = intakeEntry({ id: 'o1', prescriptionItemId: 'item-de-la-v1' })
  const prescribed = intakeEntry({ id: 'p1', prescriptionItemId: ITEM.id })
  const slot: NutritionMealSlotRead = {
    ...SLOT,
    prescriptionItems: [ITEM],
    intakeItems: [prescribed, free, orphan],
  }

  it('un registro con id de item que ya no esta en la franja es de una version anterior', () => {
    expect(isPriorVersionEntry(orphan, slot)).toBe(true)
  })

  it('un registro libre (sin prescriptionItemId) NO es de una version anterior', () => {
    expect(isPriorVersionEntry(free, slot)).toBe(false)
  })

  it('un registro sobre un item vigente tampoco', () => {
    expect(isPriorVersionEntry(prescribed, slot)).toBe(false)
  })

  it('slotPriorVersionEntries es el subconjunto huerfano de lo libre', () => {
    expect(slotPriorVersionEntries(slot).map((entry) => entry.id)).toEqual(['o1'])
  })

  it('la marca de porcion nunca entra (no viene de un item prescrito)', () => {
    const mark = intakeEntry({ id: 'm1', prescriptionItemId: 'item-de-la-v1', exchangeGroupCode: 'C', exchangePortions: 1 })
    const withMark: NutritionMealSlotRead = { ...slot, intakeItems: [...slot.intakeItems, mark] }
    expect(slotPriorVersionEntries(withMark).map((entry) => entry.id)).toEqual(['o1'])
  })
})

describe('priorVersionEntries / priorVersionCalories', () => {
  it('junta los huerfanos de las franjas y los de unassignedIntake', () => {
    const slotOrphan = intakeEntry({ id: 'o1', prescriptionItemId: 'item-de-la-v1' })
    const unassignedOrphan = intakeEntry({ id: 'o2', prescriptionItemId: 'otro-item-de-la-v1', mealSlot: null })
    const model = todayModel({
      mealSlots: [{ ...SLOT, prescriptionItems: [ITEM], intakeItems: [slotOrphan] }],
      unassignedIntake: [unassignedOrphan],
    })
    expect(priorVersionEntries(model).map((entry) => entry.id)).toEqual(['o1', 'o2'])
  })

  it('un id que vive en OTRA franja del snapshot no es huerfano (el item se movio de comida)', () => {
    const moved = intakeEntry({ id: 'x1', prescriptionItemId: ITEM.id, mealSlot: 'dinner' })
    const dinner: NutritionMealSlotRead = { ...SLOT, id: 'dinner-id', code: 'dinner', intakeItems: [moved] }
    const lunch: NutritionMealSlotRead = { ...SLOT, prescriptionItems: [ITEM] }
    expect(priorVersionEntries(todayModel({ mealSlots: [lunch, dinner] }))).toHaveLength(0)
  })

  it('ignora lo libre, las marcas de porcion y lo que no esta activo', () => {
    const free = intakeEntry({ id: 'f1', prescriptionItemId: null })
    const mark = intakeEntry({ id: 'm1', prescriptionItemId: 'v1', exchangeGroupCode: 'C', exchangePortions: 1 })
    const voided = intakeEntry({ id: 'v1', prescriptionItemId: 'v1', status: 'voided' })
    const model = todayModel({
      mealSlots: [{ ...SLOT, prescriptionItems: [ITEM], intakeItems: [free, mark, voided] }],
    })
    expect(priorVersionEntries(model)).toHaveLength(0)
    expect(priorVersionCalories(model)).toBe(0)
  })

  it('suma las kcal de los huerfanos redondeadas a 1 decimal (sin ruido de coma flotante)', () => {
    const a = intakeEntry({ id: 'o1', prescriptionItemId: 'v1', totals: { calories: 4470.04, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 } })
    const b = intakeEntry({ id: 'o2', prescriptionItemId: 'v2', totals: { calories: 0.2, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 } })
    const c = intakeEntry({ id: 'o3', prescriptionItemId: 'v3', totals: { calories: 0.1, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 } })
    const model = todayModel({ mealSlots: [{ ...SLOT, prescriptionItems: [ITEM], intakeItems: [a, b, c] }] })
    expect(priorVersionCalories(model)).toBe(4470.3)
  })

  it('sin huerfanos el dia no le debe nada a versiones anteriores', () => {
    const model = todayModel({
      mealSlots: [{ ...SLOT, prescriptionItems: [ITEM], intakeItems: [intakeEntry({ id: 'p1', prescriptionItemId: ITEM.id })] }],
    })
    expect(priorVersionCalories(model)).toBe(0)
  })
})

// ── "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5) ───────────────────────

describe('prescribedItemPlausibility / prescribedItemImplausibleCopy', () => {
  function prescribed(
    overrides: Partial<NutritionMealSlotRead['prescriptionItems'][number]>,
  ): NutritionMealSlotRead['prescriptionItems'][number] {
    return { ...ITEM, ...overrides, macros: { ...ITEM.macros, ...(overrides.macros ?? {}) } }
  }

  it('el caso Jean: 30 un de 4.470 kcal se marca por kcal (sin servingSize no hay gramaje)', () => {
    const item = prescribed({ name: 'Huevo revuelto', quantity: 30, unit: 'un', macros: { ...ITEM.macros, calories: 4470 } })
    const assessment = prescribedItemPlausibility(item)
    expect(assessment.implausible).toBe(true)
    expect(assessment.reasons).toEqual(['kcal'])
    expect(assessment.grams).toBeNull()
    // El copy sin gramaje ya trae las kcal: no se repiten.
    expect(prescribedItemImplausibleCopy(item, assessment)).toBe('¿Seguro? Este ítem suma 4.470 kcal.')
  })

  it('una cantidad de masa absurda se marca por gramos y el copy suma las kcal aparte', () => {
    const item = prescribed({ name: 'arroz cocido', quantity: 900, unit: 'g', macros: { ...ITEM.macros, calories: 1240 } })
    const assessment = prescribedItemPlausibility(item)
    expect(assessment.reasons).toEqual(['grams', 'kcal'])
    expect(assessment.grams).toBe(900)
    expect(prescribedItemImplausibleCopy(item, assessment)).toBe('¿Seguro? 900 g de arroz cocido. Suma 1.240 kcal.')
  })

  it('un item normal del plan no dispara nada (330 kcal, 200 g)', () => {
    expect(prescribedItemPlausibility(ITEM).implausible).toBe(false)
  })

  it('macros nulas cuentan como 0 kcal: no hay confirmación que mostrar', () => {
    const item = prescribed({ quantity: 1, unit: 'porción', macros: { ...ITEM.macros, calories: null } })
    const assessment = prescribedItemPlausibility(item)
    expect(assessment.implausible).toBe(false)
    expect(assessment.calories).toBe(0)
  })

  it('sin nombre el copy no dice "undefined"', () => {
    const item = prescribed({ name: null, quantity: 900, unit: 'g', macros: { ...ITEM.macros, calories: 1240 } })
    expect(prescribedItemImplausibleCopy(item)).toContain('de este alimento')
  })
})
