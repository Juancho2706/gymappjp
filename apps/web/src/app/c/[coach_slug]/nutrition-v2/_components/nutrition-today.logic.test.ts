import { describe, expect, it } from 'vitest'
import {
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeSourceSchema,
  type FoodCatalogItem,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
} from '@eva/nutrition-v2'
import {
  buildCatalogIntakePayload,
  buildCorrectionPayload,
  buildPrescribedIntakePayload,
  buildVoidPayload,
} from './nutrition-today.logic'

const CTX = {
  clientId: '33333333-3333-4333-8333-333333333333',
  date: '2026-07-15',
  timezone: 'America/Santiago',
  planVersionId: '77777777-7777-4777-8777-777777777777',
  snapshotId: '88888888-8888-4888-8888-888888888888',
}

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

/** Reproduce el factor del RPC para verificar que el total recomputado == macros. */
function rpcFactor(quantity: number, unit: string, servingSize: number | null): number {
  return unit === 'g' || unit === 'ml' ? quantity / (servingSize ?? 100) : quantity
}

describe('buildPrescribedIntakePayload', () => {
  it('normaliza a por-unidad para que el total recomputado == macros prescritos', () => {
    const payload = buildPrescribedIntakePayload({
      context: CTX,
      slot: SLOT,
      item: ITEM,
      idempotencyKey: 'intake-abcdefgh12',
    })

    // Contrato compartido acepta el payload.
    const parsed = NutritionIntakeMutationSchema.parse(payload)
    expect(parsed.source).toBe('prescription')
    expect(parsed.captureMethod).toBe('prescription')
    expect(parsed.prescriptionItemId).toBe(ITEM.id)
    expect(parsed.mealSlot).toBe('lunch')
    expect(parsed.snapshot.servingSize).toBe(1)

    // Invariante clave: snapshot.calorias * factor(cantidad, unidad, 1) == 330.
    const total = (parsed.snapshot.calories ?? 0) * rpcFactor(parsed.quantity, parsed.unit, parsed.snapshot.servingSize)
    expect(Math.round(total)).toBe(330)
  })

  it('usa customName cuando el item no tiene foodId', () => {
    const payload = buildPrescribedIntakePayload({
      context: CTX,
      slot: SLOT,
      item: { ...ITEM, foodId: null, name: 'Colacion libre' },
      idempotencyKey: 'intake-abcdefgh12',
    })
    expect(payload.foodId).toBeNull()
    expect(payload.customName).toBe('Colacion libre')
  })
})

describe('buildCatalogIntakePayload', () => {
  const FOOD: FoodCatalogItem = {
    id: '44444444-4444-4444-8444-444444444444',
    catalogKey: null,
    gtin: null,
    name: 'Arroz cocido',
    brand: null,
    category: null,
    countryCode: 'CL',
    servingSize: 100,
    servingUnit: 'g',
    calories: 130,
    proteinG: 2.7,
    carbsG: 28,
    fatsG: 0.3,
    fiberG: 0.4,
    sodiumMg: null,
    sugarG: null,
    saturatedFatG: null,
    packageQuantity: null,
    packageUnit: null,
    source: 'eva',
    sourceRef: null,
    verificationStatus: 'eva_verified',
    media: null,
  }

  it('arma un intake offplan valido con macros por-porcion del catalogo', () => {
    const payload = buildCatalogIntakePayload({
      context: CTX,
      food: FOOD,
      quantity: 200,
      unit: 'g',
      mealSlotCode: null,
      idempotencyKey: 'intake-abcdefgh12',
    })
    const parsed = NutritionIntakeMutationSchema.parse(payload)
    expect(parsed.source).toBe('offplan')
    expect(parsed.captureMethod).toBe('search')
    expect(parsed.foodId).toBe(FOOD.id)
    expect(parsed.mealSlot).toBeNull()
    expect(parsed.snapshot.servingSize).toBe(100)
    // 200 g de un alimento 130 kcal/100 g -> 260 kcal.
    const total = (parsed.snapshot.calories ?? 0) * rpcFactor(parsed.quantity, parsed.unit, parsed.snapshot.servingSize)
    expect(Math.round(total)).toBe(260)
  })

  it('lock del contrato: el alimento libre usa source valido y un source inventado se rechaza', () => {
    const payload = buildCatalogIntakePayload({
      context: CTX,
      food: FOOD,
      quantity: 100,
      unit: 'g',
      mealSlotCode: null,
      idempotencyKey: 'intake-abcdefgh12',
    })
    // Regresion (perdida silenciosa QA): el dialogo del alumno registra 'offplan', que SI pertenece
    // al contrato del RPC. Fijamos el valor exacto y su pertenencia al enum.
    expect(payload.source).toBe('offplan')
    expect(NutritionIntakeSourceSchema.options).toContain(payload.source)
    // Fail-closed: un source fuera del contrato hace fallar la validacion de la mutacion.
    const tampered = { ...payload, source: 'quien-sabe' }
    expect(NutritionIntakeMutationSchema.safeParse(tampered).success).toBe(false)
  })
})

describe('buildCorrectionPayload', () => {
  const ENTRY: NutritionIntakeReadItem = {
    id: '66666666-6666-4666-8666-666666666666',
    foodId: '44444444-4444-4444-8444-444444444444',
    customName: null,
    quantity: 100,
    unit: 'g',
    mealSlot: 'lunch',
    source: 'quien-sabe',
    captureMethod: 'quien-sabe',
    occurredAt: '2026-07-15T12:00:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: null,
    snapshot: {
      name: 'Arroz',
      brand: null,
      calories: 130,
      proteinG: 2.7,
      carbsG: 28,
      fatsG: 0.3,
      fiberG: 0.4,
      servingSize: 100,
      servingUnit: 'g',
    },
    totals: { calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4 },
  }

  it('reusa el snapshot original, cambia la cantidad y coacciona la cadena', () => {
    const payload = buildCorrectionPayload({
      context: CTX,
      entry: ENTRY,
      newQuantity: 150,
      reason: 'comi mas',
      idempotencyKey: 'correction-abcdefgh',
    })
    const parsed = NutritionIntakeCorrectionSchema.parse(payload)
    expect(parsed.correctsEntryId).toBe(ENTRY.id)
    expect(parsed.correctionReason).toBe('comi mas')
    expect(parsed.quantity).toBe(150)
    // Fuentes desconocidas del read model se degradan a enums validos.
    expect(parsed.source).toBe('offplan')
    expect(parsed.captureMethod).toBe('manual')
    expect(parsed.occurredAt).toBe(ENTRY.occurredAt)
  })

  it('retira poniendo los macros del snapshot en 0 y conserva la cadena (paridad RN)', () => {
    const payload = buildVoidPayload({
      context: CTX,
      entry: ENTRY,
      reason: 'lo registre por error',
      idempotencyKey: 'void-abcdefgh12',
    })
    const parsed = NutritionIntakeCorrectionSchema.parse(payload)
    expect(parsed.correctsEntryId).toBe(ENTRY.id)
    expect(parsed.correctionReason).toBe('lo registre por error')
    expect(parsed.quantity).toBe(ENTRY.quantity)
    expect(parsed.source).toBe('manual')
    expect(parsed.captureMethod).toBe('manual')
    // Contribucion CERO: el reemplazo no aporta macros al dia.
    expect(parsed.snapshot.calories).toBe(0)
    expect(parsed.snapshot.proteinG).toBe(0)
    expect(parsed.snapshot.carbsG).toBe(0)
    expect(parsed.snapshot.fatsG).toBe(0)
    expect(parsed.snapshot.fiberG).toBe(0)
  })
})
