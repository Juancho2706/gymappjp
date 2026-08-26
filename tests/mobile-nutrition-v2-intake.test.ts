import { describe, expect, it } from 'vitest'
import type { NutritionIntakeReadItem, NutritionMealSlotRead } from '@eva/nutrition-v2'
import type { NutritionPrescriptionItemRead, QueuedIntakeLike } from '../apps/mobile/lib/nutrition-v2-intake'
import {
  buildAteAsPrescribedMutation,
  buildEditIntakeCorrection,
  buildQueuedIntakeOverlay,
  buildRecordIntakeMutation,
  buildVoidIntakeCorrection,
  buildVoidIntakeRequest,
  bulkAteSnackbarState,
  computeIntakeTotals,
  nutritionV2EntryFactor,
  nutritionV2IntakeIdempotencyKey,
  optimisticIntakeRow,
  prescribedIntakeIdempotencyKey,
  prescribedIntakeTotals,
  prescribedIntentOperationId,
  shouldQueueNutritionV2Error,
} from '../apps/mobile/lib/nutrition-v2-intake'
import {
  buildPrescribedIntakePayload,
  prescribedIntakeIdempotencyKey as webPrescribedIntakeIdempotencyKey,
} from '../apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic'
import {
  buildScannedFoodIntakeMutation,
  scannedFoodUnitOptions,
} from '../apps/mobile/lib/nutrition-v2-scanner.logic'

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

  /**
   * NUT-010 (opcion A): el retiro dejo de ser una correccion de contribucion cero. Ese payload
   * conservaba cantidad, unidad, franja y prescriptionItemId, y el reemplazo nacia ACTIVO — por eso
   * el item del plan seguia "consumido" y la cobertura derivada no bajaba. Ahora es un gesto propio
   * con payload MINIMO contra `void_nutrition_intake_v2`, identico al de la web.
   */
  it('retirar (void) manda el payload minimo: clientId, entryId, motivo y key', () => {
    const payload = buildVoidIntakeRequest({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_A,
      entry: consumedEntry,
      reason: 'lo registré por error',
    })
    expect(payload.clientId).toBe(CLIENT)
    expect(payload.entryId).toBe(ENTRY)
    expect(payload.reason).toBe('lo registré por error')
    expect(payload.idempotencyKey).toBeTruthy()
    expect(Object.keys(payload).sort()).toEqual(['clientId', 'entryId', 'idempotencyKey', 'reason'])
  })

  it('un motivo en blanco cae a un texto por defecto valido para el contrato', () => {
    const payload = buildVoidIntakeRequest({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_B,
      entry: consumedEntry,
      reason: '   ',
    })
    expect(payload.reason.length).toBeGreaterThanOrEqual(3)
  })

  it('el builder LEGADO de void sigue exportado para drenar la cola vieja (un release)', () => {
    // Compatibilidad: retiros encolados ANTES del deploy viajan como correction y drenan por
    // `correct_nutrition_intake_v2`. Cuando esa ventana cierre, esta funcion y este caso se borran.
    const payload = buildVoidIntakeCorrection({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_B,
      localDate: '2026-07-15',
      timezone: 'America/Santiago',
      entry: consumedEntry,
      reason: 'lo registré por error',
    })
    expect(payload.correctsEntryId).toBe(ENTRY)
    expect(payload.snapshot.calories).toBe(0)
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

/**
 * NUT-001 (lado RN): el registro libre y el escaneado mandan `macrosBasis: 'per_100'` y los
 * totales OPTIMISTAS se calculan con esa misma base, de modo que el numero que ve el alumno en
 * la fila encolada coincide con el que reconstruira el servidor. Matriz 30/60/125/250 en g, ml y
 * un, con porcion 60 y 100 — espejo exacto de la matriz web.
 */
describe('NUT-001 (RN) - matriz de escala del catalogo (base per_100)', () => {
  const CAL = 155

  function expectedCalories(quantity: number, unit: string, servingSize: number): number {
    const factor = unit === 'g' || unit === 'ml' ? quantity / 100 : (quantity * servingSize) / 100
    return Math.round(CAL * factor * 10) / 10
  }

  for (const servingSize of [60, 100]) {
    for (const unit of ['g', 'ml', 'un']) {
      for (const quantity of [30, 60, 125, 250]) {
        it(`${quantity} ${unit} con porcion ${servingSize} g escala per_100`, () => {
          const snapshot = {
            name: 'Alimento del informe',
            brand: null,
            calories: CAL,
            proteinG: 10,
            carbsG: 20,
            fatsG: 5,
            fiberG: 1,
            servingSize,
            servingUnit: 'g',
            macrosBasis: 'per_100' as const,
          }
          const payload = buildRecordIntakeMutation({
            ...baseRecord,
            quantity,
            unit,
            snapshot,
          })
          expect(payload.snapshot.macrosBasis).toBe('per_100')
          expect(computeIntakeTotals(quantity, unit, snapshot).calories).toBe(
            expectedCalories(quantity, unit, servingSize),
          )
        })
      }
    }
  }

  it('cierra el caso del informe: 100 g = 155 kcal y 1 unidad = 93 kcal', () => {
    const snapshot = {
      calories: CAL,
      proteinG: 10,
      carbsG: 20,
      fatsG: 5,
      fiberG: 1,
      servingSize: 60,
      macrosBasis: 'per_100' as const,
    }
    expect(computeIntakeTotals(100, 'g', snapshot).calories).toBe(155)
    expect(computeIntakeTotals(1, 'un', snapshot).calories).toBe(93)
  })

  it('un snapshot SIN base declarada conserva la formula legada (historial intacto)', () => {
    const legacy = { calories: CAL, proteinG: 10, carbsG: 20, fatsG: 5, fiberG: 1, servingSize: 60 }
    expect(computeIntakeTotals(100, 'g', legacy).calories).toBe(258.3)
  })

  it('el scanner RN manda la misma base y la unidad canonica que el buscador', () => {
    const mutation = buildScannedFoodIntakeMutation({
      clientId: CLIENT,
      deviceId: DEVICE,
      operationId: OP_A,
      occurredAt: NOW,
      registration: {
        localDate: '2026-07-15',
        timezone: 'America/Santiago',
        planVersionId: null,
        snapshotId: null,
        slotOptions: [],
      },
      food: {
        id: FOOD,
        catalogKey: null,
        gtin: '7801234567894',
        name: 'Alimento del informe',
        brand: null,
        category: null,
        countryCode: 'CL',
        servingSize: 60,
        servingUnit: 'g',
        calories: CAL,
        proteinG: 10,
        carbsG: 20,
        fatsG: 5,
        fiberG: 1,
        sodiumMg: null,
        sugarG: null,
        saturatedFatG: null,
        packageQuantity: null,
        packageUnit: null,
        source: 'eva',
        sourceRef: null,
        verificationStatus: 'eva_verified',
        media: null,
      },
      quantity: 1,
      // La UI historica mandaba 'unidad'; el helper lo normaliza al codigo canonico.
      unit: 'unidad',
      mealSlotCode: null,
    })
    expect(mutation.unit).toBe('un')
    expect(mutation.snapshot.macrosBasis).toBe('per_100')
    expect(computeIntakeTotals(mutation.quantity, mutation.unit, mutation.snapshot).calories).toBe(93)
  })

  it('las unidades ofrecidas por el scanner son canonicas (g|ml segun magnitud + un)', () => {
    expect(scannedFoodUnitOptions({ servingUnit: 'g' })).toEqual(['g', 'un'])
    expect(scannedFoodUnitOptions({ servingUnit: 'ml' })).toEqual(['ml', 'un'])
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

// ── NUT-002: el payload prescrito NO debe reescalar macros ya totalizados ────────
// Los macros del item prescrito son TOTALES de la cantidad prescrita y el RPC SIEMPRE los reescala
// por su factor. El invariante que fija esta suite es: total reconstruido == macros mostrados.

/** Replica del factor SQL (`private.nutrition_v2_entry_factor`) para reconstruir el total. */
function rpcFactor(quantity: number, unit: string, servingSize: number | null): number {
  return unit === 'g' || unit === 'ml' ? quantity / (servingSize ?? 100) : quantity
}

describe('nutrition v2 intake - "Lo comí" prescrito conserva los macros del item', () => {
  it('manda el snapshot per-unidad con servingSize = 1', () => {
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
    expect(payload.snapshot.servingSize).toBe(1)
    expect(payload.snapshot.calories).toBeCloseTo(330 / 200, 10)
    expect(payload.snapshot.proteinG).toBeCloseTo(62 / 200, 10)
  })

  it('el total reconstruido == macros del item para 1/100/200 y g/ml/un', () => {
    for (const unit of ['g', 'ml', 'un']) {
      for (const quantity of [1, 100, 200]) {
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
          item: { ...prescriptionItem, quantity, unit },
        })
        const total =
          (payload.snapshot.calories ?? 0) *
          rpcFactor(payload.quantity, payload.unit, payload.snapshot.servingSize)
        expect(total).toBeCloseTo(330, 6)
      }
    }
  })

  it('los totales optimistas de la UI son los MISMOS que reconstruye el servidor', () => {
    expect(prescribedIntakeTotals(prescriptionItem).calories).toBe(330)
    expect(prescribedIntakeTotals({ ...prescriptionItem, quantity: 50 }).calories).toBe(330)
    expect(prescribedIntakeTotals({ ...prescriptionItem, quantity: 2, unit: 'un' }).calories).toBe(330)
  })

  it('paridad con la web: mismo snapshot para el mismo item prescrito', () => {
    const slot: NutritionMealSlotRead = {
      id: '66666666-6666-4666-8666-666666666666',
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
    const webPayload = buildPrescribedIntakePayload({
      context: {
        clientId: CLIENT,
        date: '2026-07-15',
        timezone: 'America/Santiago',
        planVersionId: VERSION,
        snapshotId: null,
      },
      slot,
      item: prescriptionItem,
      idempotencyKey: 'intake-abcdefgh12',
      occurredAt: NOW,
    })
    const rnPayload = buildAteAsPrescribedMutation({
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
    expect(rnPayload.snapshot).toEqual(webPayload.snapshot)
    expect(rnPayload.quantity).toBe(webPayload.quantity)
    expect(rnPayload.unit).toBe(webPayload.unit)
    expect(rnPayload.source).toBe(webPayload.source)
    expect(rnPayload.captureMethod).toBe(webPayload.captureMethod)
  })
})

// ── NUT-003 capa 1: la key deriva de la INTENCION, no del gesto ──────────────────
describe('nutrition v2 intake - operationId determinista del camino prescrito', () => {
  it('dos invocaciones con (dia, item) iguales producen el MISMO operationId y la MISMA key', () => {
    const a = prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC })
    const b = prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC })
    expect(a).toBe(b)
    const keyA = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: a, kind: 'intake' })
    const keyB = nutritionV2IntakeIdempotencyKey({ clientId: CLIENT, deviceId: DEVICE, operationId: b, kind: 'intake' })
    expect(keyA).toBe(keyB)
    expect(keyA.length).toBeGreaterThanOrEqual(8)
    expect(keyA.length).toBeLessThanOrEqual(200)
  })

  it('difiere por dia, por item y por attempt (repetir plato es una intencion NUEVA)', () => {
    const base = prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC })
    expect(prescribedIntentOperationId({ localDate: '2026-07-16', prescriptionItemId: PRESC })).not.toBe(base)
    expect(prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: ENTRY })).not.toBe(base)
    expect(
      prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC, attempt: 2 }),
    ).not.toBe(base)
  })

  it('rechaza un attempt invalido', () => {
    expect(() =>
      prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC, attempt: 0 }),
    ).toThrow()
  })

  it('dos "Lo comí" del mismo item el mismo dia hornean payloads con la MISMA idempotency key', () => {
    const build = () =>
      buildAteAsPrescribedMutation({
        clientId: CLIENT,
        deviceId: DEVICE,
        operationId: prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: prescriptionItem.id }),
        localDate: '2026-07-15',
        occurredAt: NOW,
        timezone: 'America/Santiago',
        slotCode: 'lunch',
        planVersionId: VERSION,
        daySnapshotId: null,
        item: prescriptionItem,
      })
    expect(build().idempotencyKey).toBe(build().idempotencyKey)
  })

  // N4: el indice del servidor ya scopea por client_id, asi que el deviceId dentro de la clave
  // solo lograba que el MISMO alumno duplicara al marcar desde dos aparatos (o tras reinstalar,
  // que rota el deviceId).
  it('la key prescrita NO cambia con el dispositivo', () => {
    const ate = (deviceId: string) =>
      buildAteAsPrescribedMutation({
        clientId: CLIENT,
        deviceId,
        operationId: prescribedIntentOperationId({
          localDate: '2026-07-15',
          prescriptionItemId: prescriptionItem.id,
        }),
        localDate: '2026-07-15',
        occurredAt: NOW,
        timezone: 'America/Santiago',
        slotCode: 'lunch',
        planVersionId: VERSION,
        daySnapshotId: null,
        item: prescriptionItem,
      })
    expect(ate('device-a').idempotencyKey).toBe(ate('device-b').idempotencyKey)
    expect(ate('device-a').idempotencyKey).not.toContain('device-a')
  })

  it('el alimento LIBRE conserva el deviceId en la key (repetirlo es intencion valida)', () => {
    const free = (deviceId: string) => buildRecordIntakeMutation({ ...baseRecord, deviceId })
    expect(free('device-a').idempotencyKey).not.toBe(free('device-b').idempotencyKey)
  })

  it('web y RN emiten EXACTAMENTE la misma key para (dia, item)', () => {
    const rn = prescribedIntakeIdempotencyKey(
      prescribedIntentOperationId({ localDate: '2026-07-15', prescriptionItemId: PRESC }),
    )
    const web = webPrescribedIntakeIdempotencyKey({
      localDate: '2026-07-15',
      prescriptionItemId: PRESC,
    })
    expect(rn).toBe(web)
    expect(rn).toBe(`intake-presc-2026-07-15-${PRESC}-a1`)
  })
})

// ── NUT-003 capa 2 / NUT-019: la cola tiene representacion en la UI de intake ────
describe('nutrition v2 intake - overlay derivado de la cola', () => {
  const queuedRecord = (idempotencyKey: string, overrides: Record<string, unknown> = {}): QueuedIntakeLike => ({
    action: 'record',
    idempotencyKey,
    payload: buildRecordIntakeMutation({
      ...baseRecord,
      operationId: idempotencyKey,
      prescriptionItemId: PRESC,
      ...overrides,
    }),
  })

  it('expone los prescriptionItemId aun encolados y su key', () => {
    const overlay = buildQueuedIntakeOverlay([queuedRecord('k-uno')], '2026-07-15')
    expect(overlay.queuedPrescriptionItemIds).toEqual([PRESC])
    expect(overlay.queuedKeyByPrescriptionItemId[PRESC]).toBe('k-uno')
    expect(overlay.addedBySlot.lunch).toHaveLength(1)
    expect(overlay.addedBySlot.lunch[0].queuedKey).toBe('k-uno')
    expect(overlay.addedBySlot.lunch[0].status).toBe('offline')
  })

  it('ignora la cola de otros dias', () => {
    const overlay = buildQueuedIntakeOverlay(
      [queuedRecord('k-uno', { localDate: '2026-07-14' })],
      '2026-07-15',
    )
    expect(overlay.queuedPrescriptionItemIds).toEqual([])
    expect(overlay.addedBySlot.lunch).toBeUndefined()
  })

  it('un record sin prescriptionItemId (alimento libre) no apaga ningun boton', () => {
    const overlay = buildQueuedIntakeOverlay([queuedRecord('k-libre', { prescriptionItemId: null })], '2026-07-15')
    expect(overlay.queuedPrescriptionItemIds).toEqual([])
    expect(overlay.addedBySlot.lunch[0].queuedKey).toBe('k-libre')
  })
})

describe('nutrition v2 intake - snackbar de la tanda (bulk)', () => {
  it('(0,0,3) sin nada registrado: error y sin deshacer', () => {
    const state = bulkAteSnackbarState({ slotName: 'Almuerzo', eligible: 3, recorded: 0, queued: 0 })
    expect(state.tone).toBe('danger')
    expect(state.canUndo).toBe(false)
  })

  it('(0,3,3) todo en cola: ofrece deshacer y lo dice', () => {
    const state = bulkAteSnackbarState({ slotName: 'Almuerzo', eligible: 3, recorded: 0, queued: 3 })
    expect(state.message).toContain('sin conexión')
    expect(state.detail).toContain('3 quedaron en cola')
    expect(state.canUndo).toBe(true)
  })

  it('(1,2,3) mixto: el detalle NO oculta lo encolado', () => {
    const state = bulkAteSnackbarState({ slotName: 'Almuerzo', eligible: 3, recorded: 1, queued: 2 })
    expect(state.message).toBe('Registraste tu Almuerzo')
    expect(state.detail).toContain('Registré 1 de 3.')
    expect(state.detail).toContain('2 quedaron en cola')
    expect(state.canUndo).toBe(true)
  })

  it('(3,0,3) todo registrado: sin detalle y con deshacer', () => {
    const state = bulkAteSnackbarState({ slotName: 'Almuerzo', eligible: 3, recorded: 3, queued: 0 })
    expect(state.detail).toBeNull()
    expect(state.canUndo).toBe(true)
  })

  it('(1,0,3) con sobrantes: los nombra', () => {
    const state = bulkAteSnackbarState({ slotName: 'Almuerzo', eligible: 3, recorded: 1, queued: 0 })
    expect(state.detail).toContain('Quedaron 2 sin registrar.')
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
