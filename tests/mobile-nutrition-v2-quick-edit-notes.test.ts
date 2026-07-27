// Notas visibles EDITABLES en el quick-edit RN (visible_notes) — logica PURA de
// apps/mobile/lib/nutrition-v2-quick-edit.ts: hidratacion desde el read model, accion
// SET_VISIBLE_NOTES, contador de cambios normalizado, proyeccion al draft canonico
// (trim / '' -> null; ya NO se pisa con el baseline), restauracion de borradores
// pre-notas y tope del contrato (8000). El modulo no importa runtime react-native.
import { describe, expect, it } from 'vitest'
import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  VISIBLE_NOTES_MAX,
  buildQuickEditBaseline,
  countQuickEditChanges,
  normalizeVisibleNotes,
  planModelToQuickEditState,
  quickEditReducer,
  quickEditStateToDraft,
  validateQuickEditState,
  type QuickEditState,
} from '../apps/mobile/lib/nutrition-v2-quick-edit'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const VARIANT_ID = '44444444-4444-4444-8444-444444444444'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const FOOD_ID = '77777777-7777-4777-8777-777777777777'

function makePlanModel(visibleNotes: string | null = 'Toma agua'): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-26T12:00:00+00:00',
    asOfDate: '2026-07-26',
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
    visibleNotes,
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
  } as unknown as NutritionPlanReadModel
}

let seq = 0
function genKey(prefix: string): string {
  seq += 1
  return `${prefix}-${seq}`
}

function hydrate(visibleNotes: string | null = 'Toma agua') {
  const planModel = makePlanModel(visibleNotes)
  const baseline = buildQuickEditBaseline(planModel)
  const state = planModelToQuickEditState(planModel, genKey)
  if (!baseline) throw new Error('fixture sin plan')
  return { planModel, baseline, state }
}

describe('quick-edit RN — notas visibles editables', () => {
  it('hidrata las notas del read model; null hidrata cadena vacia', () => {
    expect(hydrate().state.visibleNotes).toBe('Toma agua')
    expect(hydrate(null).state.visibleNotes).toBe('')
  })

  it('SET_VISIBLE_NOTES cuenta 1 cambio; espacios alrededor del mismo texto NO cuentan', () => {
    const { state } = hydrate()
    const edited = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: 'Nueva pauta' })
    expect(countQuickEditChanges(state, edited)).toBe(1)
    const padded = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: '  Toma agua  ' })
    expect(countQuickEditChanges(state, padded)).toBe(0)
  })

  it('editar metas/items NO pierde las notas (spread del estado en mapVariant)', () => {
    const { state } = hydrate()
    const withNotes = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: 'Persistente' })
    const edited = quickEditReducer(withNotes, {
      type: 'SET_TARGET',
      variantKey: 'default',
      field: 'calories',
      value: '2100',
    })
    expect(edited.visibleNotes).toBe('Persistente')
    const editedItem = quickEditReducer(edited, {
      type: 'SET_ITEM_QUANTITY',
      variantKey: 'default',
      slotKey: edited.variants[0].slots[0].key,
      itemKey: edited.variants[0].slots[0].items[0].key,
      value: '90',
    })
    expect(editedItem.visibleNotes).toBe('Persistente')
  })

  it('el draft proyecta las notas EDITADAS normalizadas (trim; vacio -> null), no las del baseline', () => {
    const { baseline, state } = hydrate()
    const edited = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: '  Nueva pauta  ' })
    const draft = quickEditStateToDraft({
      state: edited,
      baseline,
      clientId: CLIENT_ID,
      effectiveFrom: '2026-07-26',
    })
    expect(draft.visibleNotes).toBe('Nueva pauta')

    const cleared = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: '   ' })
    const clearedDraft = quickEditStateToDraft({
      state: cleared,
      baseline,
      clientId: CLIENT_ID,
      effectiveFrom: '2026-07-26',
    })
    // Borrar la nota es una edicion valida: gana el estado, no el baseline ('Toma agua').
    expect(clearedDraft.visibleNotes).toBeNull()
  })

  it('RESTORE_DRAFT de un borrador pre-notas conserva las notas actuales; con notas las restaura', () => {
    const { state } = hydrate()
    const legacy = { variants: state.variants } as unknown as QuickEditState
    const restoredLegacy = quickEditReducer(state, { type: 'RESTORE_DRAFT', state: legacy })
    expect(restoredLegacy.visibleNotes).toBe('Toma agua')

    const saved = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: 'Guardada' })
    const restored = quickEditReducer(state, { type: 'RESTORE_DRAFT', state: saved })
    expect(restored).toBe(saved)
  })

  it('notas sobre el tope (8000) marcan error local; en el tope pasan', () => {
    const { state } = hydrate()
    const atMax = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: 'x'.repeat(VISIBLE_NOTES_MAX) })
    expect(validateQuickEditState(atMax).errors['plan.visibleNotes']).toBeUndefined()
    const tooLong = quickEditReducer(state, { type: 'SET_VISIBLE_NOTES', value: 'x'.repeat(VISIBLE_NOTES_MAX + 1) })
    const validation = validateQuickEditState(tooLong)
    expect(validation.ok).toBe(false)
    expect(validation.errors['plan.visibleNotes']).toBeTruthy()
  })

  it('normalizeVisibleNotes: trim, vacio/undefined/null -> null', () => {
    expect(normalizeVisibleNotes('  hola  ')).toBe('hola')
    expect(normalizeVisibleNotes('')).toBeNull()
    expect(normalizeVisibleNotes('   ')).toBeNull()
    expect(normalizeVisibleNotes(null)).toBeNull()
    expect(normalizeVisibleNotes(undefined)).toBeNull()
  })
})
