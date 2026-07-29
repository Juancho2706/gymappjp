/**
 * Rehidratación del builder RN desde el plan vigente (FD4).
 *
 * Criterio de la ola: "rehacer un plan multi-día en RN rehidrata sin pérdida". Acá se fija con
 * el round-trip completo: read-model -> `BuilderState` -> `assembleDraft` -> mismos N días, con
 * sus franjas, items, reemplazos y porciones. La divergencia deliberada con la web es que RN NO
 * resuelve `foods` server-side: todo item de catálogo se reconstruye desde su SNAPSHOT congelado,
 * que debe reproducir EXACTAMENTE las macros prescritas.
 */
import { describe, expect, it, vi } from 'vitest'
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  assembleDraft,
  computeItemMacros,
  type NutritionV2WriteClient,
} from '../apps/mobile/lib/nutrition-v2-builder'
import { portionsKey } from '../apps/mobile/lib/nutrition-v2-builder-portions'
import {
  loadBuilderSubstitutionsForVersion,
  rehydrateBuilderState,
} from '../apps/mobile/lib/nutrition-v2-builder-rehydrate'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const VERSION_ID = '33333333-3333-4333-8333-333333333333'
const FOOD_ID = '44444444-4444-4444-8444-444444444444'
const SUB_FOOD_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_ID = 'a0000000-0000-4000-8000-000000000001'

let idSeed = 0
function uuid(): string {
  idSeed += 1
  return `66666666-6666-4666-8666-${idSeed.toString(16).padStart(12, '0')}`
}

type ReadVariant = NutritionPlanReadModel['dayVariants'][number]
type ReadSlot = ReadVariant['mealSlots'][number]
type ReadItem = ReadSlot['prescriptionItems'][number]

function item(over: Partial<ReadItem> = {}): ReadItem {
  return {
    id: uuid(),
    foodId: FOOD_ID,
    recipeId: null,
    name: 'Pollo',
    brand: null,
    quantity: 200,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    macros: { calories: 200, proteinG: 20, carbsG: 40, fatsG: 10, fiberG: 4 },
    media: null,
    category: null,
    ...over,
  } as ReadItem
}

function slot(over: Partial<ReadSlot> = {}): ReadSlot {
  return {
    id: uuid(),
    code: 'slot-1',
    name: 'Almuerzo',
    startTime: '13:00:00',
    endTime: null,
    mode: 'anchor',
    required: false,
    instructions: null,
    targets: {},
    prescriptionItems: [item()],
    ...over,
  } as ReadSlot
}

function variant(over: Partial<ReadVariant> = {}): ReadVariant {
  return {
    id: uuid(),
    key: 'default',
    label: 'Todos los días',
    dayOfWeek: null,
    isDefault: true,
    targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: null, sodiumMg: null, waterMl: null },
    mealSlots: [slot()],
    ...over,
  } as ReadVariant
}

function planModel(dayVariants: ReadVariant[]): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-28T12:00:00.000Z',
    asOfDate: '2026-07-28',
    timezone: 'America/Santiago',
    plan: {
      id: PLAN_ID,
      name: 'Plan de definicion',
      strategy: 'structured',
      versionId: VERSION_ID,
      versionNumber: 3,
      status: 'published',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    },
    visibleNotes: null,
    protocolNotes: null,
    permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: true,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants,
    syncToken: 'tok',
  } as unknown as NutritionPlanReadModel
}

describe('rehydrateBuilderState RN — plan vigente -> estado del wizard', () => {
  it('sin plan vigente devuelve null (el wizard arranca en blanco)', () => {
    const empty = { ...planModel([]), plan: null } as unknown as NutritionPlanReadModel
    expect(rehydrateBuilderState({ planModel: empty, effectiveFrom: '2026-07-28' })).toBeNull()
  })

  it('rehidrata cabecera, franjas e items (hora `13:00:00` -> `13:00`)', () => {
    const result = rehydrateBuilderState({ planModel: planModel([variant()]), effectiveFrom: '2026-07-28' })!
    const state = result.state
    expect(state.strategy).toBe('structured')
    expect(state.planName).toBe('Plan de definicion')
    expect(state.effectiveFrom).toBe('2026-07-28')
    expect(state.targets).toEqual({ calories: '2000', proteinG: '150', carbsG: '200', fatsG: '60' })
    expect(state.permissions).toEqual({
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: true,
      canSubstitute: true,
    })
    const base = state.variants[0]
    expect(base.isDefault).toBe(true)
    expect(base.slots[0].startTime).toBe('13:00')
    expect(base.slots[0].items[0].food?.id).toBe(FOOD_ID)
    expect(base.slots[0].items[0].quantity).toBe('200')
  })

  it('sin catálogo de `foods` (el caso NORMAL en RN) el snapshot reproduce las macros prescritas', () => {
    const result = rehydrateBuilderState({ planModel: planModel([variant()]), effectiveFrom: '2026-07-28' })!
    const rehydratedItem = result.state.variants[0].slots[0].items[0]
    expect(rehydratedItem.food).not.toBeNull()
    const macros = computeItemMacros(rehydratedItem.food!, Number(rehydratedItem.quantity), rehydratedItem.unit)
    expect(macros.calories).toBe(200)
    expect(macros.proteinG).toBe(20)
    expect(macros.carbsG).toBe(40)
    expect(macros.fatsG).toBe(10)
    expect(macros.fiberG).toBe(4)
  })

  it('item LIBRE (sin foodId): invierte las macros por 100 desde el snapshot', () => {
    const free = item({ foodId: null, name: 'Batido casero', quantity: 200, macros: { calories: 300, proteinG: 20, carbsG: 30, fatsG: 10, fiberG: null } })
    const result = rehydrateBuilderState({
      planModel: planModel([variant({ mealSlots: [slot({ prescriptionItems: [free] })] })]),
      effectiveFrom: '2026-07-28',
    })!
    const rehydratedItem = result.state.variants[0].slots[0].items[0]
    expect(rehydratedItem.food).toBeNull()
    expect(rehydratedItem.customName).toBe('Batido casero')
    expect(rehydratedItem.customCalories).toBe('150')
    expect(rehydratedItem.customProteinG).toBe('10')
  })

  it('plan de 3 días con porciones y reemplazos: republicar emite los MISMOS 3 días sin pérdida', () => {
    const baseItem = item()
    const baseSlot = slot({
      prescriptionItems: [baseItem],
      exchangeTargets: [
        { exchangeGroupId: GROUP_ID, portions: 2, groupCode: 'C', groupName: 'Cereales', color: null, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }, composedOf: null, macrosConfirmed: true, notes: null, orderIndex: 0 },
      ],
    } as Partial<ReadSlot>)
    const model = planModel([
      variant({ mealSlots: [baseSlot] }),
      variant({
        key: 'sabado',
        label: 'Sábado',
        dayOfWeek: 6,
        isDefault: false,
        // Metas propias => se rehidrata como personalizado.
        targets: { calories: 2600, proteinG: 150, carbsG: 200, fatsG: 60, fiberG: null, sodiumMg: null, waterMl: null },
        mealSlots: [slot({ name: 'Asado' })],
      }),
      variant({
        key: 'domingo',
        label: 'Domingo',
        dayOfWeek: 0,
        isDefault: false,
        // Mismas metas del base => hereda.
        mealSlots: [slot({ name: 'Brunch' })],
      }),
    ])

    const sub: NutritionItemSubstitutionRead = {
      id: uuid(),
      prescriptionItemId: baseItem.id,
      foodId: SUB_FOOD_ID,
      recipeId: null,
      name: 'Pavo',
      brand: null,
      quantity: null,
      unit: null,
      macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
    }

    const result = rehydrateBuilderState({
      planModel: model,
      substitutionsByItemId: { [baseItem.id]: [sub] },
      effectiveFrom: '2026-07-28',
    })!
    const state = result.state

    expect(state.variants.map((v) => v.key)).toEqual(['default', 'sabado', 'domingo'])
    expect(state.variants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(state.variants.map((v) => v.targetsMode)).toEqual(['inherit', 'custom', 'inherit'])
    expect(state.activeVariantKey).toBe('default')

    // Las porciones vuelven con la clave COMPUESTA del día al que pertenecen.
    expect(result.portionsBySlot).toEqual({
      [portionsKey('default', baseSlot.id)]: [{ exchangeGroupId: GROUP_ID, portions: 2 }],
    })

    // Republicar sin tocar nada reproduce el plan completo.
    const draft = assembleDraft(state, {
      clientId: CLIENT_ID,
      planId: PLAN_ID,
      portionsBySlot: result.portionsBySlot,
    })
    expect(draft.dayVariants).toHaveLength(3)
    expect(draft.dayVariants.map((v) => v.dayOfWeek)).toEqual([null, 6, 0])
    expect(draft.dayVariants.map((v) => v.label)).toEqual(['Todos los días', 'Sábado', 'Domingo'])
    // Herencia congelada: sábado con sus metas propias, domingo con las del base.
    expect(draft.dayVariants[1].targets.calories).toBe(2600)
    expect(draft.dayVariants[2].targets.calories).toBe(2000)
    // Reemplazos y porciones sobreviven al round-trip.
    expect(draft.dayVariants[0].mealSlots[0].items[0].substitutions).toEqual([
      { foodId: SUB_FOOD_ID, recipeId: null, customName: null, quantity: null, unit: null, orderIndex: 0 },
    ])
    expect(draft.dayVariants[0].mealSlots[0].exchangeTargets).toEqual([
      { exchangeGroupId: GROUP_ID, portions: 2, notes: null, orderIndex: 0 },
    ])
  })

  it('normaliza un read-model con dos variantes marcadas default (dato imposible, tolerado)', () => {
    const model = planModel([variant(), variant({ key: 'otra', label: 'Otra', dayOfWeek: null, isDefault: true })])
    const state = rehydrateBuilderState({ planModel: model, effectiveFrom: '2026-07-28' })!.state
    expect(state.variants.filter((v) => v.isDefault)).toHaveLength(1)
    // La segunda no tiene dayOfWeek valido => se descarta (jamas produce un draft que el RPC rechace).
    expect(state.variants).toHaveLength(1)
  })
})

describe('loadBuilderSubstitutionsForVersion (NUT-008: el fallo NO es "sin reemplazos")', () => {
  function dbWith(result: { data?: unknown[]; error?: { message: string } | null }): NutritionV2WriteClient {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null })),
    }
    return { from: vi.fn(() => chain), rpc: vi.fn() } as unknown as NutritionV2WriteClient
  }

  it('agrupa por prescriptionItemId cuando la lectura va bien', async () => {
    const db = dbWith({
      data: [
        {
          id: uuid(),
          prescription_item_id: 'item-1',
          food_id: SUB_FOOD_ID,
          recipe_id: null,
          snapshot_name: 'Pavo',
          custom_name: null,
          snapshot_brand: null,
          quantity: null,
          unit: null,
          snapshot_calories: 120,
          snapshot_protein_g: 20,
          snapshot_carbs_g: 0,
          snapshot_fats_g: 3,
          snapshot_fiber_g: 0,
        },
      ],
    })
    const res = await loadBuilderSubstitutionsForVersion(db, VERSION_ID)
    expect(res.status).toBe('loaded')
    expect(res.byItemId['item-1']).toHaveLength(1)
    expect(res.byItemId['item-1'][0].name).toBe('Pavo')
  })

  it('un plan sin reemplazos es `loaded` con el mapa vacío', async () => {
    const res = await loadBuilderSubstitutionsForVersion(dbWith({ data: [] }), VERSION_ID)
    expect(res.status).toBe('loaded')
    expect(res.byItemId).toEqual({})
  })

  it('un error de lectura viaja como `error` (el caller NO puede rehidratar a medias)', async () => {
    const res = await loadBuilderSubstitutionsForVersion(dbWith({ error: { message: 'boom' } }), VERSION_ID)
    expect(res.status).toBe('error')
    expect(res.byItemId).toEqual({})
  })

  it('una excepción de red también corta en voz alta', async () => {
    const db = {
      from: vi.fn(() => {
        throw new Error('Network request failed')
      }),
      rpc: vi.fn(),
    } as unknown as NutritionV2WriteClient
    const res = await loadBuilderSubstitutionsForVersion(db, VERSION_ID)
    expect(res.status).toBe('error')
  })
})
