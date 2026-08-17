import { describe, expect, it } from 'vitest'
import { NutritionPlanDraftSchema } from './contracts'
import { countDraftChanges, readModelToDraft } from './quick-edit'
import type { NutritionPlanReadModel } from './read-models'
import {
  PORTION_NOTES_MAX,
  SLOT_INSTRUCTIONS_MAX,
  applyQuickEditToDraft,
  quickEditReducer,
  readModelToEditState,
  validateQuickEdit,
  type QuickEditState,
} from './editor-state'

// Notas del coach por franja y por grupo («el globito», N-A): SET_SLOT_INSTRUCTIONS edita
// `slot.instructions` (campo que UPDATE_SLOT no cubre) y SET_PORTION_NOTES la nota del grupo
// de porciones. Ambas guardan el texto CRUDO y la proyeccion normaliza ''/espacios → null,
// asi que baseline y current (misma proyeccion) jamas acusan cambios fantasma.

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'
const SLOT_B_ID = '88888888-8888-4888-8888-888888888888'
const GROUP_ID = '99999999-9999-4999-8999-999999999999'
const TARGET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/**
 * Plan con dos franjas: la primera CON nota de franja y nota de grupo (para probar limpiar),
 * la segunda con ambas en null (para probar escribir desde cero).
 */
function makePlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-17T12:00:00+00:00',
    asOfDate: '2026-08-17',
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
            instructions: 'Sin azúcar agregada',
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
            exchangeTargets: [
              {
                id: TARGET_ID,
                exchangeGroupId: GROUP_ID,
                groupCode: 'PRO',
                groupName: 'Proteínas',
                color: '#3B82F6',
                portions: 2,
                notes: 'Prefiere pescado',
                orderIndex: 0,
                ref: { calories: 110, proteinG: 21, carbsG: 0, fatsG: 3 },
                composedOf: null,
                macrosConfirmed: true,
              },
            ],
          },
          {
            id: SLOT_B_ID,
            code: 'slot-2',
            name: 'Almuerzo',
            startTime: '13:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [],
            exchangeTargets: [
              {
                id: TARGET_B_ID,
                exchangeGroupId: GROUP_ID,
                groupCode: 'PRO',
                groupName: 'Proteínas',
                color: '#3B82F6',
                portions: 1,
                notes: null,
                orderIndex: 0,
                ref: { calories: 110, proteinG: 21, carbsG: 0, fatsG: 3 },
                composedOf: null,
                macrosConfirmed: true,
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'sync-token',
  }
}

function hydrate(): QuickEditState {
  const state = readModelToEditState(makePlanModel())
  if (!state) throw new Error('fixture sin plan')
  return state
}

function draftOf(state: QuickEditState) {
  const baseDraft = readModelToDraft(makePlanModel(), CLIENT_ID)
  if (!baseDraft) throw new Error('fixture sin plan')
  return applyQuickEditToDraft(baseDraft, state)
}

/** Franja proyectada por id (el orden del fixture es estable, esto lo hace explicito). */
function projectedSlot(state: QuickEditState, slotId: string) {
  const slot = draftOf(state).dayVariants[0]!.mealSlots.find((candidate) => candidate.id === slotId)
  if (!slot) throw new Error(`fixture sin franja ${slotId}`)
  return slot
}

describe('SET_SLOT_INSTRUCTIONS (nota del coach de la franja, N-A)', () => {
  it('hidrata la nota existente y sin editar proyecta cero cambios', () => {
    const state = hydrate()
    const slot = state.variants[0]!.slots[0]!
    expect(slot.instructions).toBe('Sin azúcar agregada')
    expect(countDraftChanges(draftOf(state), draftOf(state))).toBe(0)
  })

  it('escribe la nota, cuenta 1 cambio y proyecta normalizada (trim) en un draft Zod-valido', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slotB = variant.slots[1]!
    const baseline = draftOf(state)

    const noted = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: slotB.key,
      value: '  Almorzar sin pantallas  ',
    })
    // El estado guarda el texto CRUDO (textarea vivo); normaliza la proyeccion.
    expect(noted.variants[0]!.slots[1]!.instructions).toBe('  Almorzar sin pantallas  ')
    expect(projectedSlot(noted, SLOT_B_ID).instructions).toBe('Almorzar sin pantallas')
    expect(countDraftChanges(baseline, draftOf(noted))).toBe(1)
    expect(NutritionPlanDraftSchema.safeParse(draftOf(noted)).success).toBe(true)
  })

  it('limpiar ("") proyecta null y cuenta 1 cambio sobre una franja que tenia nota', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const cleared = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: variant.slots[0]!.key,
      value: '',
    })
    expect(projectedSlot(cleared, SLOT_ID).instructions).toBeNull()
    expect(countDraftChanges(draftOf(state), draftOf(cleared))).toBe(1)
  })

  it('solo espacios ⇒ null: no cuenta como cambio sobre una franja sin nota', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const blank = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: variant.slots[1]!.key,
      value: '   ',
    })
    expect(projectedSlot(blank, SLOT_B_ID).instructions).toBeNull()
    expect(countDraftChanges(draftOf(state), draftOf(blank))).toBe(0)
  })

  it('deshacer = re-despachar el valor previo: vuelve a cero cambios', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slot = variant.slots[0]!
    const edited = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: slot.key,
      value: 'Otra cosa',
    })
    expect(countDraftChanges(draftOf(state), draftOf(edited))).toBe(1)
    const undone = quickEditReducer(edited, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: slot.key,
      value: slot.instructions ?? '',
    })
    expect(countDraftChanges(draftOf(state), draftOf(undone))).toBe(0)
  })

  it('RESTORE_DRAFT (deshacer de acciones anchas) tambien revierte la nota', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const edited = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: variant.slots[0]!.key,
      value: 'Nota transitoria',
    })
    const restored = quickEditReducer(edited, { type: 'RESTORE_DRAFT', state })
    expect(countDraftChanges(draftOf(state), draftOf(restored))).toBe(0)
  })
})

describe('SET_PORTION_NOTES (nota del grupo de porciones, ya en la gramatica)', () => {
  it('escribe desde cero, proyecta normalizada y cuenta 1 cambio', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slotB = variant.slots[1]!
    const noted = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slotB.key,
      targetKey: slotB.portionTargets[0]!.key,
      value: '  sin frituras  ',
    })
    expect(projectedSlot(noted, SLOT_B_ID).exchangeTargets?.[0]?.notes).toBe('sin frituras')
    expect(countDraftChanges(draftOf(state), draftOf(noted))).toBe(1)
    expect(NutritionPlanDraftSchema.safeParse(draftOf(noted)).success).toBe(true)
  })

  it('limpiar ("") proyecta null y cuenta 1 cambio; solo espacios sobre null no cuenta', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slotA = variant.slots[0]!
    const cleared = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slotA.key,
      targetKey: slotA.portionTargets[0]!.key,
      value: '',
    })
    expect(projectedSlot(cleared, SLOT_ID).exchangeTargets?.[0]?.notes).toBeNull()
    expect(countDraftChanges(draftOf(state), draftOf(cleared))).toBe(1)

    const slotB = variant.slots[1]!
    const blank = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slotB.key,
      targetKey: slotB.portionTargets[0]!.key,
      value: '   ',
    })
    expect(projectedSlot(blank, SLOT_B_ID).exchangeTargets?.[0]?.notes).toBeNull()
    expect(countDraftChanges(draftOf(state), draftOf(blank))).toBe(0)
  })

  it('deshacer = re-despachar el valor previo: vuelve a cero cambios', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slotA = variant.slots[0]!
    const target = slotA.portionTargets[0]!
    const edited = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slotA.key,
      targetKey: target.key,
      value: 'otra nota',
    })
    const undone = quickEditReducer(edited, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slotA.key,
      targetKey: target.key,
      value: target.notes ?? '',
    })
    expect(countDraftChanges(draftOf(state), draftOf(undone))).toBe(0)
  })
})

describe('topes del contrato (espejo local, corta antes del VALIDATION generico)', () => {
  it('nota de franja: al tope pasa, sobre el tope marca slot.<key>.instructions', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slot = variant.slots[0]!
    const atMax = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: slot.key,
      value: 'x'.repeat(SLOT_INSTRUCTIONS_MAX),
    })
    expect(validateQuickEdit(atMax).ok).toBe(true)

    const over = quickEditReducer(state, {
      type: 'SET_SLOT_INSTRUCTIONS',
      variantKey: variant.key,
      slotKey: slot.key,
      // Espacios de sobra no cuentan contra el tope: el contrato trimea antes de medir.
      value: `  ${'x'.repeat(SLOT_INSTRUCTIONS_MAX + 1)}  `,
    })
    const result = validateQuickEdit(over)
    expect(result.ok).toBe(false)
    expect(result.errors[`slot.${slot.key}.instructions`]).toContain(String(SLOT_INSTRUCTIONS_MAX))
  })

  it('nota de grupo: al tope pasa, sobre el tope marca portion.<key>.notes', () => {
    const state = hydrate()
    const variant = state.variants[0]!
    const slot = variant.slots[0]!
    const target = slot.portionTargets[0]!
    const atMax = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slot.key,
      targetKey: target.key,
      value: 'x'.repeat(PORTION_NOTES_MAX),
    })
    expect(validateQuickEdit(atMax).ok).toBe(true)

    const over = quickEditReducer(state, {
      type: 'SET_PORTION_NOTES',
      variantKey: variant.key,
      slotKey: slot.key,
      targetKey: target.key,
      value: 'x'.repeat(PORTION_NOTES_MAX + 1),
    })
    const result = validateQuickEdit(over)
    expect(result.ok).toBe(false)
    expect(result.errors[`portion.${target.key}.notes`]).toContain(String(PORTION_NOTES_MAX))
  })
})
