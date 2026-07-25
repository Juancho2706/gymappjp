import { describe, expect, it } from 'vitest'
import type { NutritionIntakeReadItem } from '@eva/nutrition-v2'
import type { NutritionPrescriptionItemRead } from '../apps/mobile/lib/nutrition-v2-intake'
import {
  buildAteAsPrescribedMutation,
  buildEditIntakeCorrection,
  buildRecordIntakeMutation,
  buildVoidIntakeCorrection,
  computeIntakeTotals,
  nutritionV2EntryFactor,
  nutritionV2IntakeIdempotencyKey,
  optimisticIntakeRow,
  shouldQueueNutritionV2Error,
} from '../apps/mobile/lib/nutrition-v2-intake'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const FOOD = '22222222-2222-4222-8222-222222222222'
const ENTRY = '33333333-3333-4333-8333-333333333333'
const PRESC = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'
const DEVICE = 'android-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OP_A = 'op-aaaaaaaa-1111-4111-8111-111111111111'
const OP_B = 'op-bbbbbbbb-2222-4222-8222-222222222222'
const NOW = '2026-07-15T12:00:00.000Z'

const baseRecord = {
  clientId: CLIENT,
  deviceId: DEVICE,
  operationId: OP_A,
  localDate: '2026-07-15',
  occurredAt: NOW,
  timezone: 'America/Santiago',
  foodId: FOOD,
  quantity: 150,
  unit: 'g',
  mealSlot: 'lunch',
  source: 'offplan' as const,
  captureMethod: 'search' as const,
  snapshot: { name: 'Arroz', brand: null, calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4, servingSize: 100, servingUnit: 'g' },
}

const prescriptionItem: NutritionPrescriptionItemRead = {
  id: PRESC,
  foodId: FOOD,
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
  macros: { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7, fiberG: 0 },
}

const consumedEntry: NutritionIntakeReadItem = {
  id: ENTRY,
  foodId: FOOD,
  customName: null,
  quantity: 100,
  unit: 'g',
  mealSlot: 'lunch',
  source: 'offplan',
  captureMethod: 'search',
  occurredAt: NOW,
  status: 'active',
  revision: 1,
  correctsEntryId: null,
  prescriptionItemId: null,
  snapshot: { name: 'Arroz', brand: null, calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4, servingSize: 100, servingUnit: 'g' },
  totals: { calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4 },
}

describe('nutrition v2 intake - idempotency key ESTABLE por intento', () => {
  it('es identica en dos llamadas con el mismo operationId (dedup de la cola)', () => {
    const a = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: OP_A, kind: 'intake' })
    const b = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: OP_A, kind: 'intake' })
    expect(a).toBe(b)
  })

  it('difiere por operationId y por kind', () => {
    const intakeA = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: OP_A, kind: 'intake' })
    const intakeB = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: OP_B, kind: 'intake' })
    const correctA = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: OP_A, kind: 'correction' })
    expect(intakeA).not.toBe(intakeB)
    expect(intakeA).not.toBe(correctA)
  })

  it('el payload record hornea la misma key para el mismo operationId (no duplica en replay)', () => {
    const first = buildRecordIntakeMutation(baseRecord)
    const second = buildRecordIntakeMutation(baseRecord)
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
    expect(first.idempotencyKey.length).toBeGreaterThanOrEqual(8)
  })
})

describe('nutrition v2 intake - builders validados', () => {
  it('record valido pasa el schema Zod con snapshot y franja', () => {
    const payload = buildRecordIntakeMutation(baseRecord)
    expect(payload.clientId).toBe(CLIENT)
    expect(payload.mealSlot).toBe('lunch')
    expect(payload.snapshot.name).toBe('Arroz')
    expect(payload.source).toBe('offplan')
  })

  it('comi lo indicado conserva prescriptionItemId, franja y planVersionId', () => {
    const payload = buildAteAsPrescribedMutation({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_A,
      localDate: '2026-07-15',
      occurredAt: NOW,
      timezone: 'America/Santiago',
      slotCode: 'lunch',
      planVersionId: VERSION,
      daySnapshotId: null,
      item: prescriptionItem,
    })
    expect(payload.prescriptionItemId).toBe(PRESC)
    expect(payload.planVersionId).toBe(VERSION)
    expect(payload.mealSlot).toBe('lunch')
    expect(payload.source).toBe('prescription')
    expect(payload.captureMethod).toBe('prescription')
    expect(payload.snapshot.calories).toBe(330)
  })

  it('editar produce una correction con motivo y conserva unidad, hora, fuente y captura', () => {
    const payload = buildEditIntakeCorrection({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_A,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
      entry: consumedEntry,
      quantity: 250,
      reason: 'comí un poco menos',
    })
    expect(payload.correctsEntryId).toBe(ENTRY)
    expect(payload.quantity).toBe(250)
    expect(payload.unit).toBe(consumedEntry.unit)
    expect(payload.occurredAt).toBe(consumedEntry.occurredAt)
    expect(payload.source).toBe(consumedEntry.source)
    expect(payload.captureMethod).toBe(consumedEntry.captureMethod)
    expect(payload.correctionReason).toBe('comí un poco menos')
  })

  it('retirar (void) zerea los macros, conserva la cadena y transporta el motivo', () => {
    const payload = buildVoidIntakeCorrection({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_A,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
      entry: consumedEntry,
      reason: 'lo registré por error',
    })
    expect(payload.correctsEntryId).toBe(ENTRY)
    expect(payload.quantity).toBeGreaterThan(0)
    expect(payload.occurredAt).toBe(consumedEntry.occurredAt)
    expect(payload.correctionReason).toBe('lo registré por error')
    expect(payload.snapshot.calories).toBe(0)
    expect(payload.snapshot.proteinG).toBe(0)
  })

  it('el void de una porción conserva su metadata en la cola para rehidratar el descuento', () => {
    const payload = buildVoidIntakeCorrection({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_B,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
      entry: { ...consumedEntry, exchangeGroupCode: 'C', exchangePortions: 0.5 },
      reason: 'porción desmarcada',
    })

    expect(payload.snapshot.exchangeGroupCode).toBe('C')
    expect(payload.snapshot.exchangePortions).toBe(0.5)
    expect(payload.note).toBe('Registro retirado')
  })

  it('rechaza un motivo menor a tres caracteres', () => {
    expect(() =>
      buildEditIntakeCorrection({
        clientId: CLIENT,
        deviceId: DEVICE,
        operationId: OP_A,
        localDate: '2026-07-15',
        timezone: 'America/Santiago',
        entry: consumedEntry,
        quantity: 120,
        reason: 'no',
      }),
    ).toThrow()
  })
})

describe('nutrition v2 intake - totales identicos al servidor', () => {
  it('g/ml escala por serving-size', () => {
    expect(nutritionV2EntryFactor(150, 'g', 100)).toBeCloseTo(1.5, 5)
    expect(computeIntakeTotals(150, 'g', { calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4, servingSize: 100 }).calories).toBe(195)
  })

  it('unidad un usa la cantidad como factor', () => {
    expect(nutritionV2EntryFactor(2, 'un', null)).toBe(2)
    expect(computeIntakeTotals(2, 'un', { calories: 90, proteinG: 5, carbsG: 1, fatsG: 7, fiberG: 0, servingSize: null }).calories).toBe(180)
  })

  it('serving-size ausente en g asume 100', () => {
    expect(nutritionV2EntryFactor(50, 'g', null)).toBeCloseTo(0.5, 5)
  })
})

describe('nutrition v2 intake - clasificacion de errores para la cola', () => {
  it('encola red/desconocido y 408/429/5xx; NO encola 4xx deterministas', () => {
    expect(shouldQueueNutritionV2Error(new Error('network'))).toBe(true)
    expect(shouldQueueNutritionV2Error({ status: 500 })).toBe(true)
    expect(shouldQueueNutritionV2Error({ status: 429 })).toBe(true)
    expect(shouldQueueNutritionV2Error({ status: 408 })).toBe(true)
    expect(shouldQueueNutritionV2Error({ status: 400 })).toBe(false)
    expect(shouldQueueNutritionV2Error({ status: 403 })).toBe(false)
  })
})

describe('nutrition v2 intake - fila optimista', () => {
  it('mapea a NutritionFoodRowModel con status offline', () => {
    const row = optimisticIntakeRow({
      id: 'temp-1',
      name: 'Arroz',
      quantity: 150,
      unit: 'g',
      status: 'offline',
      totals: computeIntakeTotals(150, 'g', { calories: 130, proteinG: 2.7, carbsG: 28, fatsG: 0.3, fiberG: 0.4, servingSize: 100 }),
    })
    expect(row.status).toBe('offline')
    expect(row.calories).toBe(195)
    expect(row.quantityLabel).toContain('g')
    expect(row.shareQuantity).toBe(150)
    expect(row.shareUnit).toBe('g')
  })
})
