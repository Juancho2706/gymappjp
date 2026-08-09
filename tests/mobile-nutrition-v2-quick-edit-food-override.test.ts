// T2.2 — correccion de macros desde el QUICK-EDIT RN. Logica PURA de
// apps/mobile/lib/nutrition-v2-quick-edit.ts (accion APPLY_FOOD_OVERRIDE), espejo del
// `APPLY_FOOD_OVERRIDE` del builder web (draft-builder.macros-basis.test.ts).
//
// Las dos garantias que sostiene: la correccion es del ALIMENTO —alcanza TODAS sus apariciones,
// en cualquier dia y franja— y NO es un cambio del plan, asi que no puede inflar el contador de
// "cambios sin publicar" (el diff mira foodId/nombre/cantidad/unidad, no los macros del catalogo).
// Ningun modulo importa runtime react-native.
import { describe, expect, it } from 'vitest'
import type { BuilderFood, BuilderFoodMacrosPatch } from '../apps/mobile/lib/nutrition-v2-builder'
import {
  countQuickEditChanges,
  quickEditReducer,
  type QuickEditItem,
  type QuickEditSlot,
  type QuickEditState,
  type QuickEditVariant,
} from '../apps/mobile/lib/nutrition-v2-quick-edit'

const FOOD_ID = '77777777-7777-4777-8777-777777777777'
const OTRO_FOOD_ID = '88888888-8888-4888-8888-888888888888'
const ITEM_ID = '66666666-6666-4666-8666-666666666666'
const SLOT_ID = '55555555-5555-4555-8555-555555555555'

function makeFood(id: string, name: string): BuilderFood {
  return {
    id,
    name,
    brand: null,
    calories: 143,
    proteinG: 17,
    carbsG: 0,
    fatsG: 8,
    fiberG: 0,
    servingSize: 100,
    servingUnit: 'g',
    category: 'proteina',
    media: null,
    macrosBasis: 'per_serving',
    hasOverride: false,
    originalMacros: null,
  }
}

function makeItem(key: string, food: BuilderFood): QuickEditItem {
  return {
    key,
    id: ITEM_ID,
    foodId: food.id,
    recipeId: null,
    displayName: food.name,
    brand: null,
    customName: null,
    quantity: '100',
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    baseQuantity: 100,
    baseMacros: { calories: 143, proteinG: 17, carbsG: 0, fatsG: 8, fiberG: 0 },
    category: food.category,
    media: null,
    food,
  }
}

function makeSlot(key: string, items: QuickEditItem[]): QuickEditSlot {
  return {
    key,
    id: SLOT_ID,
    code: 'slot-1',
    name: 'Desayuno',
    startTime: '08:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    targets: {},
    instructions: null,
    items,
  }
}

function makeVariant(key: string, slots: QuickEditSlot[]): QuickEditVariant {
  return {
    key,
    id: null,
    label: key === 'default' ? 'Todos los días' : 'Lunes',
    dayOfWeek: key === 'default' ? null : 1,
    default: key === 'default',
    targets: { calories: '2200', proteinG: '160', carbsG: '220', fatsG: '70' },
    fixedTargets: { fiberG: null, sodiumMg: null, waterMl: null },
    slots,
  }
}

/** El MISMO alimento en dos dias distintos, mas otro alimento que no debe moverse. */
function makeState(): QuickEditState {
  const pollo = makeFood(FOOD_ID, 'Carne molida de pollo, cruda')
  const otro = makeFood(OTRO_FOOD_ID, 'Otro alimento')
  return {
    visibleNotes: 'Toma agua',
    variants: [
      makeVariant('default', [makeSlot('s-base', [makeItem('i-base', pollo)])]),
      makeVariant('dia-1', [makeSlot('s-lu', [makeItem('i-lu', pollo), makeItem('i-otro', otro)])]),
    ],
  }
}

const PATCH: BuilderFoodMacrosPatch = {
  calories: 160,
  proteinG: 20,
  carbsG: 0,
  fatsG: 9,
  fiberG: 0,
  macrosBasis: 'per_serving',
  hasOverride: true,
  originalMacros: { calories: 143, proteinG: 17, carbsG: 0, fatsG: 8, fiberG: 0 },
}

const APPLY = { type: 'APPLY_FOOD_OVERRIDE', foodId: FOOD_ID, macros: PATCH } as const

describe('quick-edit RN — APPLY_FOOD_OVERRIDE', () => {
  it('alcanza TODAS las apariciones del alimento, en cualquier dia', () => {
    const next = quickEditReducer(makeState(), APPLY)
    expect(next.variants[0].slots[0].items[0].food?.calories).toBe(160)
    expect(next.variants[1].slots[0].items[0].food?.calories).toBe(160)
    // El badge ✎ y el tachado del catalogo viajan en el mismo parche.
    expect(next.variants[1].slots[0].items[0].food?.hasOverride).toBe(true)
    expect(next.variants[1].slots[0].items[0].food?.originalMacros?.calories).toBe(143)
  })

  it('no toca los demas alimentos', () => {
    const next = quickEditReducer(makeState(), APPLY)
    const otro = next.variants[1].slots[0].items[1].food
    expect(otro?.id).toBe(OTRO_FOOD_ID)
    expect(otro?.calories).toBe(143)
    expect(otro?.hasOverride).toBe(false)
  })

  it('conserva la base declarada: corregir numeros no cambia la convencion', () => {
    const next = quickEditReducer(makeState(), APPLY)
    expect(next.variants[0].slots[0].items[0].food?.macrosBasis).toBe('per_serving')
  })

  it('NO cuenta como cambio sin publicar: la correccion es del catalogo, no del plan', () => {
    const baseline = makeState()
    const next = quickEditReducer(makeState(), APPLY)
    expect(countQuickEditChanges(baseline, next)).toBe(0)
  })
})
