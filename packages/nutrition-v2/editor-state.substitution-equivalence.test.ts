import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from './contracts'
import { countDraftChanges, readModelToDraft } from './quick-edit'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from './read-models'
import type { BuilderFood } from './editor-food'
import {
  QE_SUBSTITUTION_CONFIRM_WARNING,
  QE_SUBSTITUTION_SAME_CALORIES_NOTE,
  applyQuickEditToDraft,
  buildSubstitutionMap,
  countItemSubstitutionChanges,
  createCustomItem,
  qeSubstitutionEquivalence,
  quickEditReducer,
  readModelToEditState,
  type QeItem,
  type QeItemSubstitution,
  type QuickEditState,
} from './editor-state'

/**
 * Cantidad equivalente del reemplazo MOSTRADA en el editor del coach (T3.x, decision del dueño
 * 2026-08-18): el alumno no come "la misma porcion que lo prescrito" — la app le resuelve en vivo
 * la cantidad que IGUALA las kcal del item. El coach autorizaba a ciegas.
 *
 * Los dos invariantes que estas pruebas cuidan:
 *  1. el numero sale del MISMO modulo puro que ve el alumno y de las macros VIGENTES del catalogo
 *     (nunca de los `snapshot_*` congelados de la fila), y si no hay con que calcular no hay numero;
 *  2. la carga es DISPLAY-ONLY: rellenarla no mueve ni la proyeccion al draft ni el contador de
 *     cambios — o el editor abriria con "cambios sin guardar" fantasma.
 */

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_FOOD_ID = '77777777-7777-4777-8777-777777777777'
const SUB_FOOD_ID = '88888888-8888-4888-8888-888888888888'
const SUB_ID = '99999999-9999-4999-8999-999999999999'

/** "Posta de vacuno cocida" del catalogo: 185 kcal/100 g y porcion nominal de 30 g. */
const POSTA: BuilderFood = {
  id: SUB_FOOD_ID,
  name: 'Posta de vacuno cocida',
  brand: null,
  calories: 185,
  proteinG: 32,
  carbsG: 0,
  fatsG: 6,
  fiberG: 0,
  servingSize: 30,
  servingUnit: 'g',
  category: 'proteina',
  media: null,
  macrosBasis: 'per_100',
  householdGrams: null,
  householdLabel: null,
}

/** Item prescrito hidratado del read model: 120 g de lomo liso = 240 kcal congeladas. */
function lomoItem(overrides: Partial<QeItem> = {}): QeItem {
  return {
    key: ITEM_ID,
    id: ITEM_ID,
    foodId: ITEM_FOOD_ID,
    recipeId: null,
    displayName: 'Lomo liso',
    brand: null,
    quantity: '120',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    food: null,
    macroBase: {
      quantity: 120,
      macros: { calories: 240, proteinG: 42, carbsG: 0, fatsG: 8, fiberG: 0 },
    },
    isCustom: false,
    media: null,
    category: null,
    substitutions: [],
    ...overrides,
  }
}

function substitution(overrides: Partial<QeItemSubstitution> = {}): QeItemSubstitution {
  return {
    foodId: SUB_FOOD_ID,
    recipeId: null,
    customName: null,
    quantity: null,
    unit: null,
    displayName: POSTA.name,
    displayMacros: {
      calories: POSTA.calories,
      proteinG: POSTA.proteinG,
      carbsG: POSTA.carbsG,
      fatsG: POSTA.fatsG,
      fiberG: POSTA.fiberG,
      servingSize: POSTA.servingSize,
      servingUnit: POSTA.servingUnit,
      macrosBasis: 'per_100',
    },
    ...overrides,
  }
}

describe('qeSubstitutionEquivalence (cantidad que el alumno va a ver)', () => {
  it('resuelve la cantidad que iguala las kcal del item, redondeada al escalon de la unidad', () => {
    // 240 kcal / 1,85 kcal por g = 129,7 g → escalon de 5 g.
    const view = qeSubstitutionEquivalence(lomoItem(), substitution())
    expect(view).not.toBeNull()
    expect(view!.quantity).toBe(130)
    expect(view!.unit).toBe('g')
    expect(view!.label).toBe('≈ 130 g')
    expect(view!.note).toBe(QE_SUBSTITUTION_SAME_CALORIES_NOTE)
    expect(view!.explicit).toBe(false)
    expect(view!.requiresConfirmation).toBe(false)
    expect(view!.warning).toBeNull()
  })

  it('sigue la cantidad EDITADA del item (el coach ajusta y el numero se mueve)', () => {
    const view = qeSubstitutionEquivalence(lomoItem({ quantity: '60' }), substitution())
    // La mitad del item = la mitad de las kcal a igualar.
    expect(view!.quantity).toBe(65)
  })

  it('avisa el caso absurdo (Pechuga 100 g → 715 g de espinaca) en vez de ofrecerlo liso', () => {
    const pechuga = lomoItem({
      displayName: 'Pechuga de pollo',
      quantity: '100',
      macroBase: {
        quantity: 100,
        macros: { calories: 165, proteinG: 31, carbsG: 0, fatsG: 3.6, fiberG: 0 },
      },
    })
    const espinaca = substitution({
      displayName: 'Espinaca cruda',
      displayMacros: {
        calories: 23,
        proteinG: 2.9,
        carbsG: 3.6,
        fatsG: 0.4,
        fiberG: 2.2,
        servingSize: 100,
        servingUnit: 'g',
        macrosBasis: 'per_100',
      },
    })
    const view = qeSubstitutionEquivalence(pechuga, espinaca)
    expect(view!.quantity).toBe(715)
    expect(view!.requiresConfirmation).toBe(true)
    expect(view!.warning).toBe(QE_SUBSTITUTION_CONFIRM_WARNING)
  })

  it('respeta la cantidad que el coach escribio en la fila y muestra la diferencia real', () => {
    const view = qeSubstitutionEquivalence(lomoItem(), substitution({ quantity: 200, unit: 'g' }))
    expect(view!.explicit).toBe(true)
    // Sin "≈": no es una estimacion, es lo que el coach dejo escrito.
    expect(view!.label).toBe('200 g')
    expect(view!.requiresConfirmation).toBe(false)
    // 200 g de posta = 370 kcal contra 240 prescritas: +130 kcal, y hay que decirlo.
    expect(view!.note).toBe('+130 kcal respecto de lo prescrito')
  })

  it('NO pinta numero cuando el reemplazo no tiene macros vigentes en mano', () => {
    expect(qeSubstitutionEquivalence(lomoItem(), substitution({ displayMacros: null }))).toBeNull()
    // Respaldo local anterior a esta ola: la llave ni existe.
    const sinCampo: QeItemSubstitution = {
      foodId: SUB_FOOD_ID,
      recipeId: null,
      customName: null,
      quantity: null,
      unit: null,
      displayName: POSTA.name,
    }
    expect(qeSubstitutionEquivalence(lomoItem(), sinCampo)).toBeNull()
  })

  it('NO pinta numero cuando el item prescrito no tiene kcal con que comparar', () => {
    // Alimento libre sin macros: cualquier cifra seria inventada (mejor vacio que mentiroso).
    const libre = createCustomItem('nuevo')
    expect(qeSubstitutionEquivalence(libre, substitution())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Invariante: la carga de display NO mueve la firma de cambios
// ---------------------------------------------------------------------------

function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-18T12:00:00+00:00',
    asOfDate: '2026-08-18',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de prueba',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-08-10',
      effectiveTo: null,
    },
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: true,
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
            name: 'Almuerzo',
            startTime: '13:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                id: ITEM_ID,
                foodId: ITEM_FOOD_ID,
                recipeId: null,
                name: 'Lomo liso',
                brand: null,
                quantity: 120,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 240, proteinG: 42, carbsG: 0, fatsG: 8, fiberG: 0 },
              },
            ],
            exchangeTargets: [],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  }
}

/**
 * Fila leida de `nutrition_item_substitutions_v2`: su snapshot congelado corresponde a UNA
 * PORCION del sustituto (30 g ⇒ 56 kcal), NO a lo prescrito. Es exactamente el numero que no
 * hay que mostrarle al coach.
 */
const SUB_READ: NutritionItemSubstitutionRead = {
  id: SUB_ID,
  prescriptionItemId: ITEM_ID,
  foodId: SUB_FOOD_ID,
  recipeId: null,
  name: 'Posta de vacuno cocida',
  brand: null,
  quantity: null,
  unit: null,
  macros: { calories: 56, proteinG: 9.6, carbsG: 0, fatsG: 1.8, fiberG: 0 },
}

function draftOf(state: QuickEditState) {
  const baseDraft = readModelToDraft(makePlanModel(), CLIENT_ID)
  if (!baseDraft) throw new Error('fixture sin plan')
  return applyQuickEditToDraft(baseDraft, state)
}

function hydrate(foodsById: Record<string, BuilderFood> = {}): QuickEditState {
  const state = readModelToEditState(makePlanModel(), buildSubstitutionMap([SUB_READ], foodsById), {
    withMeta: true,
  })
  if (!state) throw new Error('fixture sin plan')
  return state
}

function firstSub(state: QuickEditState): QeItemSubstitution {
  const sub = state.variants[0]!.slots[0]!.items[0]!.substitutions[0]
  if (!sub) throw new Error('fixture sin reemplazo')
  return sub
}

describe('carga de display del reemplazo (macros vigentes) — invariantes', () => {
  it('hidrata SIN macros cuando no hay catalogo en mano: jamas cae al snapshot congelado', () => {
    const sub = firstSub(hydrate())
    expect(sub.displayName).toBe('Posta de vacuno cocida')
    expect(sub.displayMacros ?? null).toBeNull()
    // Sin macros no hay numero (y el 56 kcal del snapshot no se usa para nada).
    expect(qeSubstitutionEquivalence(hydrate().variants[0]!.slots[0]!.items[0]!, sub)).toBeNull()
  })

  it('con el catalogo vigente en mano resuelve la cantidad equivalente del alumno', () => {
    const state = hydrate({ [SUB_FOOD_ID]: POSTA })
    const item = state.variants[0]!.slots[0]!.items[0]!
    const view = qeSubstitutionEquivalence(item, firstSub(state))
    expect(view!.label).toBe('≈ 130 g')
  })

  it('rellenar la carga de display NO mueve la proyeccion al draft ni el contador de cambios', () => {
    const sinCatalogo = draftOf(hydrate())
    const conCatalogo = draftOf(hydrate({ [SUB_FOOD_ID]: POSTA }))
    expect(conCatalogo).toEqual(sinCatalogo)
    expect(countDraftChanges(sinCatalogo, conCatalogo)).toBe(0)
    expect(countItemSubstitutionChanges(sinCatalogo, conCatalogo)).toBe(0)
    expect(NutritionPlanDraftSchema.safeParse(conCatalogo).success).toBe(true)
  })

  it('la proyeccion del reemplazo no transporta ningun campo de display', () => {
    const projected = draftOf(hydrate({ [SUB_FOOD_ID]: POSTA })).dayVariants[0]!.mealSlots[0]!
      .items[0]!.substitutions![0]!
    expect(Object.keys(projected).sort()).toEqual([
      'customName',
      'foodId',
      'orderIndex',
      'quantity',
      'recipeId',
      'unit',
    ])
  })

  it('ADD_ITEM_SUBSTITUTION guarda las macros del catalogo y cuenta UN solo cambio', () => {
    const base = hydrate()
    const baseline = draftOf(base)
    const variant = base.variants[0]!
    const slot = variant.slots[0]!
    const added = quickEditReducer(base, {
      type: 'ADD_ITEM_SUBSTITUTION',
      variantKey: variant.key,
      slotKey: slot.key,
      itemKey: slot.items[0]!.key,
      food: { ...POSTA, id: ITEM_FOOD_ID + '-otro' },
    })
    const nuevo = added.variants[0]!.slots[0]!.items[0]!.substitutions[1]!
    expect(nuevo.displayMacros?.calories).toBe(185)
    expect(qeSubstitutionEquivalence(added.variants[0]!.slots[0]!.items[0]!, nuevo)!.label).toBe(
      '≈ 130 g',
    )
    // El alta si es un cambio real (una fila mas); la carga de display no suma nada aparte.
    expect(countItemSubstitutionChanges(baseline, draftOf(added))).toBe(1)
  })

  it('APPLY_FOOD_OVERRIDE baja la correccion del coach al numero del reemplazo, sin tocar el draft', () => {
    const state = hydrate({ [SUB_FOOD_ID]: POSTA })
    const baseline = draftOf(state)
    const corregido = quickEditReducer(state, {
      type: 'APPLY_FOOD_OVERRIDE',
      foodId: SUB_FOOD_ID,
      // El coach declara que la posta rinde la mitad de kcal: la equivalencia se duplica.
      macros: {
        calories: 92.5,
        proteinG: 16,
        carbsG: 0,
        fatsG: 3,
        fiberG: 0,
        macrosBasis: 'per_100',
        hasOverride: true,
        originalMacros: null,
      },
    })
    const item = corregido.variants[0]!.slots[0]!.items[0]!
    expect(qeSubstitutionEquivalence(item, firstSub(corregido))!.quantity).toBe(260)
    // Corregir macros de catalogo NO es una edicion del plan: el draft queda bit-identico.
    expect(draftOf(corregido)).toEqual(baseline)
    expect(countItemSubstitutionChanges(baseline, draftOf(corregido))).toBe(0)
  })
})
