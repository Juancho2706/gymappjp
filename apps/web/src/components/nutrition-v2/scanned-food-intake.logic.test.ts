import { describe, expect, it } from 'vitest'
import { NutritionIntakeMutationSchema, type FoodCatalogItem } from '@eva/nutrition-v2'
import { buildCatalogIntakePayload } from '@/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic'
import { buildScannedFoodIntakePayload } from './scanned-food-intake.logic'

// UUIDs RFC-validos (version 4 / variante 8): Zod 4 rechaza uuids deterministas no-RFC.
const food: FoodCatalogItem = {
  id: '33333333-3333-4333-8333-333333333333',
  catalogKey: null,
  gtin: '7702103130150',
  name: "Kellogg's Corn Flakes",
  brand: "Kellogg's",
  category: 'Cereales',
  countryCode: 'CL',
  servingSize: 100,
  servingUnit: 'g',
  calories: 363,
  proteinG: 7,
  carbsG: 83,
  fatsG: 1,
  fiberG: 3,
  sodiumMg: null,
  sugarG: null,
  saturatedFatG: null,
  packageQuantity: null,
  packageUnit: null,
  source: 'import',
  sourceRef: null,
  verificationStatus: 'unverified',
  media: null,
}

const context = {
  clientId: '11111111-1111-4111-8111-111111111111',
  date: '2026-07-18',
  timezone: 'America/Santiago',
  planVersionId: '22222222-2222-4222-8222-222222222222',
  snapshotId: null,
}

const input = {
  context,
  food,
  quantity: 40,
  unit: 'g',
  mealSlotCode: 'breakfast',
  idempotencyKey: 'intake-test-scan-0001',
  occurredAt: '2026-07-18T12:00:00.000Z',
}

describe('buildScannedFoodIntakePayload (registro desde el scanner)', () => {
  it('es el MISMO payload del catalogo salvo captureMethod=barcode', () => {
    const scanned = buildScannedFoodIntakePayload(input)
    const catalog = buildCatalogIntakePayload(input)
    expect(scanned.captureMethod).toBe('barcode')
    expect(catalog.captureMethod).toBe('search')
    expect({ ...scanned, captureMethod: 'search' }).toEqual(catalog)
  })

  it('usa el foodId local y snapshot por porcion del catalogo (el RPC escala)', () => {
    const scanned = buildScannedFoodIntakePayload(input)
    expect(scanned.foodId).toBe(food.id)
    expect(scanned.customName).toBeNull()
    expect(scanned.source).toBe('offplan')
    expect(scanned.quantity).toBe(40)
    expect(scanned.mealSlot).toBe('breakfast')
    expect(scanned.snapshot).toMatchObject({
      name: food.name,
      brand: food.brand,
      calories: 363,
      proteinG: 7,
      carbsG: 83,
      fatsG: 1,
      servingSize: 100,
      servingUnit: 'g',
    })
  })

  it('pasa la validacion Zod del contrato de mutacion (barcode es capture valido)', () => {
    const parsed = NutritionIntakeMutationSchema.safeParse(buildScannedFoodIntakePayload(input))
    expect(parsed.success).toBe(true)
  })

  it('sin franja elegida viaja mealSlot=null (registro suelto del dia)', () => {
    const scanned = buildScannedFoodIntakePayload({ ...input, mealSlotCode: null })
    expect(scanned.mealSlot).toBeNull()
  })
})
