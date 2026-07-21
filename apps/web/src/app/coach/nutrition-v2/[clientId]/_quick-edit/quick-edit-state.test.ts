import { describe, expect, it } from 'vitest'
import {
  NutritionPlanDraftSchema,
  countDraftChanges,
  readModelToDraft,
  type NutritionItemSubstitutionRead,
  type NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import {
  applyQuickEditToDraft,
  buildSubstitutionMap,
  collectPortionGroups,
  createCatalogItem,
  normalizeTimeHHMM,
  qeItemMacros,
  quickEditReducer,
  readModelToEditState,
  stepPortionsText,
  stepQuantityText,
  validateQuickEdit,
  type QePortionGroup,
  type QuickEditState,
} from './quick-edit-state'
import type { BuilderFood } from '../builder/_lib/draft-builder'

// Invariante central del quick-edit web: hidratar el read model y proyectarlo SIN editar
// debe dar CERO cambios contra el baseline (mismo pipeline de proyeccion en ambos lados),
// y cada operacion de edicion debe mover el contador y producir un draft valido (Zod).

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'

function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-17T12:00:00+00:00',
    asOfDate: '2026-07-17',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de prueba',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-07-10',
      effectiveTo: null,
    },
    visibleNotes: 'Toma agua',
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [
      {
        id: VARIANT_ID,
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: {
          calories: 2200,
          proteinG: 160,
          carbsG: 220,
          fatsG: 70,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [
          {
            id: SLOT_ID,
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                id: ITEM_ID,
                foodId: FOOD_ID,
                recipeId: null,
                name: 'Avena',
                brand: null,
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  }
}

const swapFood: BuilderFood = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Quinoa',
  brand: null,
  calories: 368,
  proteinG: 14,
  carbsG: 64,
  fatsG: 6,
  fiberG: 7,
  servingSize: 100,
  servingUnit: 'g',
  category: null,
  media: null,
}

function hydrate(): { state: QuickEditState; baseline: ReturnType<typeof applyQuickEditToDraft> } {
  const planModel = makePlanModel()
  const state = readModelToEditState(planModel)
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!state || !baseDraft) throw new Error('fixture sin plan')
  return { state, baseline: applyQuickEditToDraft(baseDraft, state) }
}

function currentDraftOf(state: QuickEditState) {
  const planModel = makePlanModel()
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!baseDraft) throw new Error('fixture sin plan')
  return applyQuickEditToDraft(baseDraft, state)
}

describe('quick-edit-state (web)', () => {
  it('hidratar y proyectar sin editar produce CERO cambios (sin diffs fantasma)', () => {
    const { state, baseline } = hydrate()
    expect(countDraftChanges(baseline, currentDraftOf(state))).toBe(0)
  })

  it('cambiar una cantidad cuenta 1 cambio y vuelve a 0 al deshacer el valor', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '90',
    })
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    const reverted = quickEditReducer(edited, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '80',
    })
    expect(countDraftChanges(baseline, currentDraftOf(reverted))).toBe(0)
  })

  it('swap conserva cantidad/unidad, cuenta 1 cambio y el draft resultante pasa el schema', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'SWAP_ITEM_FOOD',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      food: swapFood,
    })
    const item = edited.variants[0].slots[0].items[0]
    expect(item.foodId).toBe(swapFood.id)
    expect(item.quantity).toBe('80')
    expect(item.unit).toBe('g')
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    expect(() => NutritionPlanDraftSchema.parse(currentDraftOf(edited))).not.toThrow()
  })

  it('eliminar item + restaurar en su posicion = undo local exacto', () => {
    const { state, baseline } = hydrate()
    const removedItem = state.variants[0].slots[0].items[0]
    const removed = quickEditReducer(state, {
      type: 'REMOVE_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
    })
    expect(countDraftChanges(baseline, currentDraftOf(removed))).toBe(1)
    const restored = quickEditReducer(removed, {
      type: 'RESTORE_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      index: 0,
      item: removedItem,
    })
    expect(countDraftChanges(baseline, currentDraftOf(restored))).toBe(0)
  })

  it('agregar franja produce un draft valido y cuenta 1 cambio', () => {
    const { state, baseline } = hydrate()
    const edited = quickEditReducer(state, {
      type: 'ADD_SLOT',
      variantKey: VARIANT_ID,
      key: 'nueva-franja-key',
      name: 'Cena',
      startTime: '20:30',
    })
    expect(countDraftChanges(baseline, currentDraftOf(edited))).toBe(1)
    const draft = currentDraftOf(edited)
    expect(() => NutritionPlanDraftSchema.parse(draft)).not.toThrow()
    const slots = draft.dayVariants[0].mealSlots
    expect(slots[slots.length - 1].startTime).toBe('20:30')
  })

  it('macros en vivo: item hidratado escala linealmente; item swapeado usa el motor exacto', () => {
    const { state } = hydrate()
    const base = state.variants[0].slots[0].items[0]
    const doubled = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '160',
    })
    expect(qeItemMacros(base).calories).toBe(300)
    expect(qeItemMacros(doubled.variants[0].slots[0].items[0]).calories).toBe(600)

    const catalogItem = createCatalogItem('k1', swapFood)
    expect(qeItemMacros(catalogItem).calories).toBeGreaterThan(0)
  })

  it('validacion local: cantidad invalida y nombre libre vacio bloquean el publish', () => {
    const { state } = hydrate()
    const badQty = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '0',
    })
    expect(validateQuickEdit(badQty).ok).toBe(false)
    const withCustom = quickEditReducer(state, {
      type: 'ADD_CUSTOM_ITEM',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      key: 'custom-1',
    })
    expect(validateQuickEdit(withCustom).ok).toBe(false)
  })

  it('steppers: 5 en g, no baja de cero; normalizacion de hora HH:MM[:SS]', () => {
    expect(stepQuantityText('80', 5, 1)).toBe('85')
    expect(stepQuantityText('3', 5, -1)).toBe('3')
    expect(normalizeTimeHHMM('08:00:00')).toBe('08:00')
    expect(normalizeTimeHHMM(null)).toBe('')
  })
})

// ── Porciones (T1.2): hidratacion, contador, stepper 0,5 y proyeccion al draft ──────────

const TARGET_ID = '99999999-9999-4999-8999-999999999999'
const GROUP_C_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const GROUP_V_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makePlanModelWithPortions(): NutritionPlanReadModel {
  const model = makePlanModel()
  model.dayVariants[0].mealSlots[0] = {
    ...model.dayVariants[0].mealSlots[0],
    exchangeTargets: [
      {
        id: TARGET_ID,
        exchangeGroupId: GROUP_C_ID,
        groupCode: 'C',
        groupName: 'Cereales',
        color: '#F59E0B',
        portions: 2,
        notes: null,
        orderIndex: 0,
        ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0.5 },
        composedOf: null,
        macrosConfirmed: true,
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        exchangeGroupId: GROUP_V_ID,
        groupCode: 'V',
        groupName: 'Verduras',
        color: '#22C55E',
        portions: 1.5,
        notes: null,
        orderIndex: 1,
        ref: { calories: 25, proteinG: 2, carbsG: 5, fatsG: 0 },
        composedOf: null,
        macrosConfirmed: false,
      },
    ],
  }
  return model
}

function hydratePortions() {
  const planModel = makePlanModelWithPortions()
  const state = readModelToEditState(planModel)
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!state || !baseDraft) throw new Error('fixture sin plan')
  return {
    state,
    baseline: applyQuickEditToDraft(baseDraft, state),
    currentOf: (s: QuickEditState) => applyQuickEditToDraft(baseDraft, s),
    groups: collectPortionGroups(planModel),
  }
}

describe('quick-edit-state — porciones', () => {
  it('plan SIN porciones: portionTargets vacio, cero grupos elegibles y draft sin la clave', () => {
    const { state } = hydrate()
    expect(state.variants[0].slots[0].portionTargets).toEqual([])
    expect(collectPortionGroups(makePlanModel())).toEqual([])
    expect(currentDraftOf(state).dayVariants[0].mealSlots[0]).not.toHaveProperty('exchangeTargets')
  })

  it('hidratar y proyectar sin editar = 0 cambios; el draft con porciones pasa el schema', () => {
    const { state, baseline, currentOf } = hydratePortions()
    expect(state.variants[0].slots[0].portionTargets).toHaveLength(2)
    expect(countDraftChanges(baseline, currentOf(state))).toBe(0)
    expect(() => NutritionPlanDraftSchema.parse(currentOf(state))).not.toThrow()
  })

  it('stepper 0,5: 2 -> 1,5 cuenta 1 cambio; nunca baja de 0,5', () => {
    const { state, baseline, currentOf } = hydratePortions()
    const edited = quickEditReducer(state, {
      type: 'STEP_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: TARGET_ID,
      direction: -1,
    })
    expect(edited.variants[0].slots[0].portionTargets[0].portions).toBe('1.5')
    expect(countDraftChanges(baseline, currentOf(edited))).toBe(1)
    expect(stepPortionsText('0.5', -1)).toBe('0.5')
    expect(stepPortionsText('1,5', 1)).toBe('2')
  })

  it('alta desde el picker + baja de otro grupo = 2 cambios; no duplica un grupo ya presente', () => {
    const { state, baseline, currentOf, groups } = hydratePortions()
    const cereales = groups.find((g) => g.groupCode === 'C') as QePortionGroup
    // Cinturon de unicidad: agregar un grupo ya presente en la franja no hace nada.
    const dupe = quickEditReducer(state, {
      type: 'ADD_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      key: 'nueva-key',
      group: cereales,
    })
    expect(dupe.variants[0].slots[0].portionTargets).toHaveLength(2)

    // Baja de Verduras + alta de Cereales en una franja NUEVA no aplica aqui; simulamos
    // baja de V y re-alta de V (target nuevo sin id) => baja+alta = 2 cambios.
    const removed = quickEditReducer(state, {
      type: 'REMOVE_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: TARGET_ID,
    })
    const verduras = groups.find((g) => g.groupCode === 'V') as QePortionGroup
    const readded = quickEditReducer(removed, {
      type: 'REMOVE_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    })
    const withNew = quickEditReducer(readded, {
      type: 'ADD_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      key: 'nueva-v',
      group: verduras,
    })
    // Quedo: C quitado (1) + V quitado y re-agregado con las MISMAS porciones default 1
    // (V baseline era 1,5 -> nuevo target 1: cuenta como cambio de porciones = 1).
    expect(countDraftChanges(baseline, currentOf(withNew))).toBe(2)
  })

  it('quitar + restaurar en su posicion = undo local exacto (0 cambios)', () => {
    const { state, baseline, currentOf } = hydratePortions()
    const removedTarget = state.variants[0].slots[0].portionTargets[0]
    const removed = quickEditReducer(state, {
      type: 'REMOVE_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: TARGET_ID,
    })
    expect(countDraftChanges(baseline, currentOf(removed))).toBe(1)
    const restored = quickEditReducer(removed, {
      type: 'RESTORE_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      index: 0,
      target: removedTarget,
    })
    expect(countDraftChanges(baseline, currentOf(restored))).toBe(0)
  })

  it('validacion: porciones fuera de 0,5 en 0,5 bloquean el publish', () => {
    const { state } = hydratePortions()
    const bad = quickEditReducer(state, {
      type: 'SET_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: TARGET_ID,
      value: '1.3',
    })
    const validation = validateQuickEdit(bad)
    expect(validation.ok).toBe(false)
    expect(validation.errors[`portion.${TARGET_ID}.portions`]).toBeTruthy()
    // Coma decimal es-CL valida.
    const comma = quickEditReducer(state, {
      type: 'SET_PORTION_TARGET',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      targetKey: TARGET_ID,
      value: '1,5',
    })
    expect(validateQuickEdit(comma).ok).toBe(true)
  })

  it('collectPortionGroups: unicos por grupo, ordenados por codigo, con ref del snapshot', () => {
    const { groups } = hydratePortions()
    expect(groups.map((g) => g.groupCode)).toEqual(['C', 'V'])
    expect(groups[0].ref.carbsG).toBe(15)
    expect(groups[1].macrosConfirmed).toBe(false)
  })
})

// ── RESTORE_DRAFT: respaldo local restaurable (banner de sesion anterior) ────────────────

describe('quick-edit-state — RESTORE_DRAFT', () => {
  it('restaura el arbol completo de un borrador guardado (reemplazo total del estado)', () => {
    const { state, baseline } = hydrate()
    // Simula el arbol guardado en localStorage: una edicion (cantidad 80 -> 120).
    const saved = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '120',
    })
    // Partiendo del estado limpio recien hidratado, restaurar reemplaza el arbol entero.
    const restored = quickEditReducer(state, { type: 'RESTORE_DRAFT', state: saved })
    expect(restored).toBe(saved)
    expect(restored.variants[0].slots[0].items[0].quantity).toBe('120')
    expect(countDraftChanges(baseline, currentDraftOf(restored))).toBe(1)
  })

  it('un payload invalido (sin variants array) no restaura ni rompe: conserva el estado actual', () => {
    const { state } = hydrate()
    const badVariants = { variants: null } as unknown as QuickEditState
    expect(quickEditReducer(state, { type: 'RESTORE_DRAFT', state: badVariants })).toBe(state)
    const emptyPayload = {} as unknown as QuickEditState
    expect(quickEditReducer(state, { type: 'RESTORE_DRAFT', state: emptyPayload })).toBe(state)
  })
})

// ── Carry-over de reemplazos autorizados (F-02): el read-model NO los transporta, se fetchean
// aparte y se inyectan en la hidratacion. Deben viajar en la proyeccion del draft (o republicar
// los borraria) SIN inflar el contador de cambios (baseline y current pasan por la misma
// proyeccion). Esta es la clase del bug de private_notes. ────────────────────────────────────

const SUB_FOOD_ID = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'

const NULL_MACROS = { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null }

const SUB_READS: NutritionItemSubstitutionRead[] = [
  {
    id: 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1',
    prescriptionItemId: ITEM_ID,
    foodId: SUB_FOOD_ID,
    recipeId: null,
    name: 'Pavo molido',
    brand: 'Marca',
    quantity: null,
    unit: null,
    macros: { calories: 200, proteinG: 27, carbsG: 0, fatsG: 10, fiberG: 0 },
  },
  {
    id: 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2',
    prescriptionItemId: ITEM_ID,
    foodId: null,
    recipeId: null,
    name: 'Merluza al horno',
    brand: null,
    quantity: 120,
    unit: 'g',
    macros: NULL_MACROS,
  },
]

function hydrateWithSubs() {
  const planModel = makePlanModel()
  const state = readModelToEditState(planModel, buildSubstitutionMap(SUB_READS))
  const baseDraft = readModelToDraft(planModel, CLIENT_ID)
  if (!state || !baseDraft) throw new Error('fixture sin plan')
  return {
    state,
    baseDraft,
    baseline: applyQuickEditToDraft(baseDraft, state),
    currentOf: (s: QuickEditState) => applyQuickEditToDraft(baseDraft, s),
  }
}

describe('quick-edit-state — carry-over de reemplazos (F-02)', () => {
  it('projectItem incluye las substitutions carry-over en el draft (food + libre), y pasa el schema', () => {
    const { baseline } = hydrateWithSubs()
    const item = baseline.dayVariants[0].mealSlots[0].items[0]
    expect(item.substitutions).toHaveLength(2)
    // Reemplazo de catalogo: foodId conservado, sin nombre libre.
    expect(item.substitutions?.[0]).toMatchObject({
      foodId: SUB_FOOD_ID,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      orderIndex: 0,
    })
    // Reemplazo libre: conserva el nombre + cantidad/unidad, orderIndex por posicion.
    expect(item.substitutions?.[1]).toMatchObject({
      foodId: null,
      customName: 'Merluza al horno',
      quantity: 120,
      unit: 'g',
      orderIndex: 1,
    })
    expect(() => NutritionPlanDraftSchema.parse(baseline)).not.toThrow()
  })

  it('hidratar y proyectar sin editar = 0 cambios (los reemplazos NO cuentan un cambio falso)', () => {
    const { state, baseline, currentOf } = hydrateWithSubs()
    expect(countDraftChanges(baseline, currentOf(state))).toBe(0)
  })

  it('editar la cantidad de un item con reemplazos cuenta 1 y preserva las substitutions', () => {
    const { state, baseline, currentOf } = hydrateWithSubs()
    const edited = quickEditReducer(state, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: VARIANT_ID,
      slotKey: SLOT_ID,
      itemKey: ITEM_ID,
      value: '90',
    })
    const current = currentOf(edited)
    expect(countDraftChanges(baseline, current)).toBe(1)
    expect(current.dayVariants[0].mealSlots[0].items[0].substitutions).toHaveLength(2)
  })

  it('sin fetch de reemplazos: el item NO trae la clave substitutions (byte-identico a hoy)', () => {
    const planModel = makePlanModel()
    const state = readModelToEditState(planModel)
    const baseDraft = readModelToDraft(planModel, CLIENT_ID)
    if (!state || !baseDraft) throw new Error('fixture sin plan')
    const draft = applyQuickEditToDraft(baseDraft, state)
    expect(draft.dayVariants[0].mealSlots[0].items[0]).not.toHaveProperty('substitutions')
  })
})
