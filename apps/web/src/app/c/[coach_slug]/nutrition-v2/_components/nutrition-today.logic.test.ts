import { describe, expect, it } from 'vitest'
import {
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeSourceSchema,
  NutritionIntakeVoidSchema,
  intakeEntryFactor,
  type FoodCatalogItem,
  type NutritionIntakeReadItem,
  type NutritionItemSubstitutionRead,
  type NutritionMealSlotRead,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import {
  applyTodayOptimistic,
  buildBulkUndoPayloads,
  buildCatalogIntakePayload,
  buildCorrectionPayload,
  buildOptimisticIntakeEntry,
  buildOptimisticSubstitutionEntry,
  buildPrescribedIntakePayload,
  buildVoidPayload,
  consumedEntryForItem,
  estimateCatalogIntakeTotals,
  formatIntakeClock,
  groupSubstitutionsByPrescriptionItem,
  isPortionMarkEntry,
  outOfPlanEntries,
  resolveItemDisplayNote,
  slotFreeEntries,
  slotPortionMarksTotal,
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

/**
 * NUT-001 — matriz de escala del catalogo. Los macros de `public.foods` son POR 100 g/ml y
 * `serving_size` solo describe la porcion; la formula LEGADA dividia g/ml por `serving_size` e
 * ignoraba la porcion en la unidad contable, o sea exactamente lo inverso al motor canonico
 * (`packages/nutrition-engine/macros.ts:120-135`). Con el alimento del informe (155 kcal/100 g,
 * porcion 60 g) registrar 100 g daba 258,3 kcal y 1 unidad daba 155 kcal.
 *
 * Esta matriz fija el contrato per_100 en las 4 superficies (las 4 construyen el mismo payload
 * via `buildCatalogIntakePayload`) y verifica que el TOTAL ESTIMADO que ve el alumno usa la
 * misma funcion pura que reconstruira el servidor.
 */
describe('NUT-001 — matriz de escala del catalogo (base per_100)', () => {
  const EJEMPLO = {
    id: '44444444-4444-4444-8444-444444444444',
    catalogKey: null,
    gtin: null,
    name: 'Alimento del informe',
    brand: null,
    category: null,
    countryCode: 'CL',
    servingSize: 60,
    servingUnit: 'g',
    calories: 155,
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
  } satisfies FoodCatalogItem

  /** kcal esperadas por contrato per_100: g/ml ⇒ qty/100 · un ⇒ qty*serving/100. */
  function expectedCalories(quantity: number, unit: string, servingSize: number): number {
    const factor = unit === 'g' || unit === 'ml' ? quantity / 100 : (quantity * servingSize) / 100
    return Math.round(155 * factor * 10) / 10
  }

  const QUANTITIES = [30, 60, 125, 250]
  const UNITS = ['g', 'ml', 'un'] as const
  const SERVINGS = [60, 100]

  for (const servingSize of SERVINGS) {
    for (const unit of UNITS) {
      for (const quantity of QUANTITIES) {
        it(`${quantity} ${unit} con porcion ${servingSize} g escala per_100`, () => {
          const food = { ...EJEMPLO, servingSize }
          const payload = buildCatalogIntakePayload({
            context: CTX,
            food,
            quantity,
            unit,
            mealSlotCode: null,
            idempotencyKey: 'intake-abcdefgh12',
          })
          const parsed = NutritionIntakeMutationSchema.parse(payload)
          expect(parsed.snapshot.macrosBasis).toBe('per_100')

          // Total que reconstruira el RPC con la base declarada.
          const total =
            (parsed.snapshot.calories ?? 0) *
            intakeEntryFactor({
              quantity: parsed.quantity,
              unit: parsed.unit,
              servingSize: parsed.snapshot.servingSize,
              basis: parsed.snapshot.macrosBasis,
            })
          expect(Math.round(total * 10) / 10).toBe(expectedCalories(quantity, unit, servingSize))

          // El "Total estimado" del formulario usa la MISMA funcion pura.
          expect(estimateCatalogIntakeTotals({ food, quantity, unit }).calories).toBe(
            expectedCalories(quantity, unit, servingSize),
          )
        })
      }
    }
  }

  it('cierra el caso exacto del informe: 100 g = 155 kcal y 1 unidad = 93 kcal', () => {
    expect(estimateCatalogIntakeTotals({ food: EJEMPLO, quantity: 100, unit: 'g' }).calories).toBe(155)
    expect(estimateCatalogIntakeTotals({ food: EJEMPLO, quantity: 1, unit: 'un' }).calories).toBe(93)
    // El default de la UI (cantidad = porcion) tambien queda correcto: 60 g ⇒ 93 kcal.
    expect(estimateCatalogIntakeTotals({ food: EJEMPLO, quantity: 60, unit: 'g' }).calories).toBe(93)
  })

  it('normaliza la unidad de la UI al codigo canonico (unidad ⇒ un)', () => {
    const payload = buildCatalogIntakePayload({
      context: CTX,
      food: EJEMPLO,
      quantity: 1,
      unit: 'unidad',
      mealSlotCode: null,
      idempotencyKey: 'intake-abcdefgh12',
    })
    expect(payload.unit).toBe('un')
    expect(NutritionIntakeMutationSchema.safeParse(payload).success).toBe(true)
  })

  it('el contrato rechaza una unidad fuera de la whitelist en una escritura nueva', () => {
    const payload = buildCatalogIntakePayload({
      context: CTX,
      food: EJEMPLO,
      quantity: 1,
      unit: 'taza',
      mealSlotCode: null,
      idempotencyKey: 'intake-abcdefgh12',
    })
    expect(NutritionIntakeMutationSchema.safeParse(payload).success).toBe(false)
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

  /**
   * NUT-010 (opcion A): el assert de FORMA del payload viejo (macros en 0, cantidad conservada,
   * cadena de correccion) quedo INVALIDO. Ese payload era justamente el problema: creaba una entry
   * correctora ACTIVA que seguia contando como consumida. Ahora el retiro es un gesto propio con
   * payload MINIMO contra `void_nutrition_intake_v2`.
   */
  it('el retiro manda el payload minimo (sin snapshot ni cantidad): paridad RN', () => {
    const payload = buildVoidPayload({
      context: CTX,
      entry: ENTRY,
      reason: 'lo registre por error',
      idempotencyKey: 'void-abcdefgh12',
    })
    const parsed = NutritionIntakeVoidSchema.parse(payload)
    expect(parsed).toEqual({
      clientId: CTX.clientId,
      entryId: ENTRY.id,
      reason: 'lo registre por error',
      idempotencyKey: 'void-abcdefgh12',
    })
    // Nada del snapshot / cantidad / franja viaja: el servidor no los necesita para retirar.
    expect(Object.keys(payload).sort()).toEqual(['clientId', 'entryId', 'idempotencyKey', 'reason'])
  })

  it('un motivo en blanco cae a un texto por defecto valido para el contrato', () => {
    const payload = buildVoidPayload({
      context: CTX,
      entry: ENTRY,
      reason: '   ',
      idempotencyKey: 'void-abcdefgh12',
    })
    expect(() => NutritionIntakeVoidSchema.parse(payload)).not.toThrow()
    expect(payload.reason.length).toBeGreaterThanOrEqual(3)
  })

  it('el deshacer de una tanda retira por id creado, sin reconstruir el intake', () => {
    const payloads = [
      buildPrescribedIntakePayload({
        context: CTX,
        slot: SLOT,
        item: ITEM,
        idempotencyKey: 'intake-abcdefgh12',
      }),
    ]
    const undo = buildBulkUndoPayloads(payloads, [ENTRY.id])

    expect(undo).toHaveLength(1)
    expect(NutritionIntakeVoidSchema.parse(undo[0])).toMatchObject({
      clientId: CTX.clientId,
      entryId: ENTRY.id,
      reason: 'Deshacer registro de la comida',
    })
  })
})

// ── Reemplazos autorizados por el coach (F-02) ───────────────────────────────────

function sub(overrides: Partial<NutritionItemSubstitutionRead> & { id: string; prescriptionItemId: string }): NutritionItemSubstitutionRead {
  return {
    foodId: null,
    recipeId: null,
    name: 'Reemplazo',
    brand: null,
    quantity: null,
    unit: null,
    macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
    ...overrides,
  }
}

describe('groupSubstitutionsByPrescriptionItem', () => {
  const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

  it('agrupa por prescriptionItemId preservando el orden de llegada', () => {
    const rows = [
      sub({ id: 's1', prescriptionItemId: ITEM_A, name: 'Pavo' }),
      sub({ id: 's2', prescriptionItemId: ITEM_B, name: 'Tofu' }),
      sub({ id: 's3', prescriptionItemId: ITEM_A, name: 'Atún' }),
    ]
    const grouped = groupSubstitutionsByPrescriptionItem(rows)
    expect(Object.keys(grouped).sort()).toEqual([ITEM_A, ITEM_B].sort())
    expect(grouped[ITEM_A].map((r) => r.name)).toEqual(['Pavo', 'Atún'])
    expect(grouped[ITEM_B].map((r) => r.name)).toEqual(['Tofu'])
  })

  it('un plan sin reemplazos produce un mapa vacio', () => {
    expect(groupSubstitutionsByPrescriptionItem([])).toEqual({})
  })
})

describe('resolveItemDisplayNote', () => {
  it('oculta el texto legado "Alternativas: …" cuando hay reemplazos estructurados', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atún', true)).toBeNull()
  })

  it('conserva el texto legado "Alternativas: …" cuando NO hay estructura (fallback)', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atún', false)).toBe('Alternativas: Pavo, Atún')
  })

  it('conserva una nota del coach que no es "Alternativas" aunque haya estructura', () => {
    expect(resolveItemDisplayNote('Cocinar a la plancha', true)).toBe('Cocinar a la plancha')
  })

  it('normaliza notas vacias o nulas a null', () => {
    expect(resolveItemDisplayNote(null, true)).toBeNull()
    expect(resolveItemDisplayNote(undefined, false)).toBeNull()
    expect(resolveItemDisplayNote('   ', false)).toBeNull()
  })
})

// ── "Hoy sin eco" (auditoría H4/H5) ───────────────────────────────────────────────

function intakeEntry(overrides: Partial<NutritionIntakeReadItem> & { id: string }): NutritionIntakeReadItem {
  return {
    foodId: null,
    customName: 'Registro',
    quantity: 1,
    unit: 'un',
    mealSlot: 'lunch',
    source: 'offplan',
    captureMethod: 'manual',
    occurredAt: '2026-07-29T16:04:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: null,
    snapshot: {
      name: 'Registro',
      brand: null,
      calories: 100,
      proteinG: 5,
      carbsG: 10,
      fatsG: 2,
      fiberG: null,
      servingSize: 1,
      servingUnit: 'un',
    },
    totals: { calories: 100, proteinG: 5, carbsG: 10, fatsG: 2, fiberG: 0 },
    ...overrides,
  }
}

describe('isPortionMarkEntry', () => {
  it('una marca sintetica de porcion trae grupo + porciones > 0', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e1', exchangeGroupCode: 'C', exchangePortions: 1.5 }))).toBe(true)
  })

  it('un alimento libre normal (sin grupo) no es marca de porcion', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e2' }))).toBe(false)
  })

  it('una correctora fantasma de 0 kcal (exchangePortions null) tampoco cuenta como marca', () => {
    expect(isPortionMarkEntry(intakeEntry({ id: 'e3', exchangeGroupCode: 'C', exchangePortions: null }))).toBe(false)
  })
})

describe('consumedEntryForItem / slotFreeEntries / slotPortionMarksTotal', () => {
  const prescribed = intakeEntry({ id: 'p1', prescriptionItemId: ITEM.id, customName: null, foodId: ITEM.foodId })
  const free = intakeEntry({ id: 'f1', prescriptionItemId: null })
  const orphan = intakeEntry({ id: 'o1', prescriptionItemId: 'no-existe-ya' })
  const portionMark = intakeEntry({ id: 'm1', exchangeGroupCode: 'C', exchangePortions: 1.5 })
  const slot: NutritionMealSlotRead = {
    ...SLOT,
    prescriptionItems: [ITEM],
    intakeItems: [prescribed, free, orphan, portionMark],
  }

  it('encuentra el registro del item prescrito por prescriptionItemId', () => {
    expect(consumedEntryForItem(slot, ITEM.id)?.id).toBe('p1')
    expect(consumedEntryForItem(slot, 'otro-item')).toBeNull()
  })

  it('lo libre + lo huerfano entran a "Fuera del plan" de la franja; la marca de porcion NO (se resume aparte)', () => {
    const ids = slotFreeEntries(slot).map((entry) => entry.id)
    expect(ids.sort()).toEqual(['f1', 'o1'])
  })

  it('suma todas las porciones marcadas de la franja en un solo numero', () => {
    expect(slotPortionMarksTotal(slot)).toBe(1.5)
    expect(slotPortionMarksTotal({ ...SLOT, intakeItems: [free] })).toBe(0)
  })
})

describe('outOfPlanEntries', () => {
  function today(overrides: Partial<NutritionTodayReadModel>): NutritionTodayReadModel {
    return {
      schemaVersion: 1,
      generatedAt: '2026-07-29T00:00:00.000Z',
      localDate: '2026-07-29',
      timezone: 'America/Santiago',
      snapshotId: null,
      plan: null,
      targets: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
      remaining: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      mealSlots: [],
      unassignedIntake: [],
      syncToken: 'token',
      ...overrides,
    }
  }

  it('junta lo sin franja con lo de franjas que no se renderizan (nunca desaparece un registro)', () => {
    const strandedSlotEntry = intakeEntry({ id: 's1', mealSlot: 'snack', occurredAt: '2026-07-29T10:00:00.000Z' })
    const strandedSlot: NutritionMealSlotRead = { ...SLOT, id: 'snack-id', code: 'snack', intakeItems: [strandedSlotEntry] }
    const unassigned = intakeEntry({ id: 'u1', mealSlot: null, occurredAt: '2026-07-29T08:00:00.000Z' })
    const model = today({ mealSlots: [strandedSlot], unassignedIntake: [unassigned] })

    // "lunch" SI se renderiza (tiene card); "snack" NO ⇒ sus registros caen a "Fuera del plan".
    const out = outOfPlanEntries(model, new Set(['lunch']))
    expect(out.map((entry) => entry.id)).toEqual(['u1', 's1'])
  })

  it('una franja renderizada no aporta nada a "Fuera del plan"', () => {
    const model = today({ mealSlots: [{ ...SLOT, intakeItems: [intakeEntry({ id: 'p1' })] }] })
    expect(outOfPlanEntries(model, new Set(['lunch']))).toHaveLength(0)
  })
})

describe('formatIntakeClock', () => {
  it('formatea la hora en la zona indicada (UTC, deterministico)', () => {
    expect(formatIntakeClock('2026-07-29T13:04:00.000Z', 'UTC')).toBe('13:04')
  })

  it('fecha invalida ⇒ cadena vacia (nunca revienta el render)', () => {
    expect(formatIntakeClock('no-es-fecha', 'UTC')).toBe('')
  })
})

// ── Capa optimista del Hoy (F7 · H2) ─────────────────────────────────────────────

describe('applyTodayOptimistic', () => {
  function optimisticToday(overrides: Partial<NutritionTodayReadModel> = {}): NutritionTodayReadModel {
    return {
      schemaVersion: 1,
      generatedAt: '2026-08-10T00:00:00.000Z',
      localDate: '2026-08-10',
      timezone: 'America/Santiago',
      snapshotId: null,
      plan: null,
      targets: { calories: 2000, proteinG: 150, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null },
      consumed: { calories: 500, proteinG: 40, carbsG: 50, fatsG: 10, fiberG: 5, entryCount: 2 },
      remaining: { calories: 1500, proteinG: 110, carbsG: null, fatsG: null, fiberG: null, sodiumMg: 1000, waterMl: null },
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      mealSlots: [{ ...SLOT, intakeItems: [] }],
      unassignedIntake: [],
      syncToken: 'token',
      ...overrides,
    }
  }

  const added = intakeEntry({
    id: 'nuevo',
    totals: { calories: 100, proteinG: 5, carbsG: 10, fatsG: 2, fiberG: 0 },
  })

  it('add: la entry aparece en su franja y consumido/restante se mueven al tiro', () => {
    const next = applyTodayOptimistic(optimisticToday(), { kind: 'add', slotCode: 'lunch', entry: added })
    expect(next.mealSlots[0].intakeItems.map((entry) => entry.id)).toEqual(['nuevo'])
    expect(next.consumed).toEqual({ calories: 600, proteinG: 45, carbsG: 60, fatsG: 12, fiberG: 5, entryCount: 3 })
    // remaining se recalcula SOLO donde hay target; sodio/agua (no viven en consumed) se conservan.
    expect(next.remaining.calories).toBe(1400)
    expect(next.remaining.proteinG).toBe(105)
    expect(next.remaining.carbsG).toBeNull()
    expect(next.remaining.sodiumMg).toBe(1000)
  })

  it('add sin franja (o con una que no existe) ⇒ cae a unassignedIntake, nunca desaparece', () => {
    const next = applyTodayOptimistic(optimisticToday(), { kind: 'add', slotCode: 'no-existe', entry: added })
    expect(next.unassignedIntake.map((entry) => entry.id)).toEqual(['nuevo'])
  })

  it('void: la entry se va y sus totales se restan; un id desconocido no toca nada', () => {
    const base = applyTodayOptimistic(optimisticToday(), { kind: 'add', slotCode: 'lunch', entry: added })
    const next = applyTodayOptimistic(base, { kind: 'void', entryId: 'nuevo' })
    expect(next.mealSlots[0].intakeItems).toHaveLength(0)
    expect(next.consumed).toEqual(optimisticToday().consumed)
    expect(applyTodayOptimistic(base, { kind: 'void', entryId: 'fantasma' })).toBe(base)
  })

  it('edit: escala cantidad y totales linealmente y ajusta el consumido por el neto', () => {
    const base = applyTodayOptimistic(optimisticToday(), { kind: 'add', slotCode: 'lunch', entry: added })
    const next = applyTodayOptimistic(base, { kind: 'edit', entryId: 'nuevo', quantity: 2 })
    const edited = next.mealSlots[0].intakeItems[0]
    expect(edited.quantity).toBe(2)
    expect(edited.totals.calories).toBe(200)
    expect(next.consumed.calories).toBe(700)
    expect(next.consumed.entryCount).toBe(3)
  })

  it('sustituir: remueve la entry activa del item y pone la nueva — nunca conviven dos', () => {
    const prescriptionItemId = ITEM.id
    const previous = intakeEntry({
      id: 'vieja',
      prescriptionItemId,
      totals: { calories: 300, proteinG: 30, carbsG: 0, fatsG: 5, fiberG: 0 },
    })
    const replacement = intakeEntry({
      id: 'reemplazo',
      prescriptionItemId,
      totals: { calories: 280, proteinG: 25, carbsG: 5, fatsG: 4, fiberG: 0 },
    })
    const base = optimisticToday({ mealSlots: [{ ...SLOT, intakeItems: [previous] }] })
    const next = applyTodayOptimistic(base, {
      kind: 'substitute',
      prescriptionItemId,
      slotCode: 'lunch',
      entry: replacement,
    })
    expect(next.mealSlots[0].intakeItems.map((entry) => entry.id)).toEqual(['reemplazo'])
    expect(next.consumed.calories).toBe(500 - 300 + 280)
    expect(next.consumed.entryCount).toBe(2)
  })

  it('sustituir un item AUN no registrado solo agrega (el conteo sube)', () => {
    const next = applyTodayOptimistic(optimisticToday(), {
      kind: 'substitute',
      prescriptionItemId: ITEM.id,
      slotCode: 'lunch',
      entry: intakeEntry({ id: 'reemplazo', prescriptionItemId: ITEM.id }),
    })
    expect(next.mealSlots[0].intakeItems).toHaveLength(1)
    expect(next.consumed.entryCount).toBe(3)
  })
})

describe('buildOptimisticIntakeEntry / buildOptimisticSubstitutionEntry', () => {
  it('la entry optimista de "Lo comi" congela el MISMO snapshot del payload y los macros prescritos', () => {
    const payload = buildPrescribedIntakePayload({
      context: CTX,
      slot: SLOT,
      item: ITEM,
      idempotencyKey: 'intake-test-0001',
    })
    const entry = buildOptimisticIntakeEntry({
      payload,
      totals: { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7.2, fiberG: 0 },
    })
    expect(entry.prescriptionItemId).toBe(ITEM.id)
    expect(entry.mealSlot).toBe(SLOT.code)
    expect(entry.status).toBe('active')
    expect(entry.snapshot.name).toBe(payload.snapshot.name)
    expect(entry.totals).toEqual({ calories: 330, proteinG: 62, carbsG: 0, fatsG: 7.2, fiberG: 0 })
  })

  it('la entry optimista de sustitucion escala los totales si el alumno confirmo otra cantidad', () => {
    const equivalence = {
      kind: 'calorie-equivalent' as const,
      quantity: 100,
      unit: 'g' as const,
      totals: { calories: 200, proteinG: 10, carbsG: 20, fatsG: 4, fiberG: 2 },
      snapshot: {
        name: 'Arroz',
        brand: null,
        calories: 200,
        proteinG: 10,
        carbsG: 20,
        fatsG: 4,
        fiberG: 2,
        servingSize: 100,
        servingUnit: 'g',
      },
      targetCalories: 200,
      requiresConfirmation: false,
    }
    const entry = buildOptimisticSubstitutionEntry({
      prescriptionItemId: ITEM.id,
      mealSlot: 'lunch',
      foodId: null,
      equivalence,
      quantity: 50,
      occurredAt: '2026-08-10T20:00:00.000Z',
    })
    expect(entry.source).toBe('substitution')
    expect(entry.quantity).toBe(50)
    expect(entry.totals).toEqual({ calories: 100, proteinG: 5, carbsG: 10, fatsG: 2, fiberG: 1 })
  })

  it('sin cantidad confirmada usa la de la equivalencia tal cual', () => {
    const entry = buildOptimisticSubstitutionEntry({
      prescriptionItemId: ITEM.id,
      mealSlot: null,
      foodId: null,
      equivalence: {
        kind: 'explicit',
        quantity: 715,
        unit: 'g',
        totals: { calories: 165, proteinG: 21.5, carbsG: 28.6, fatsG: 0, fiberG: 0 },
        snapshot: {
          name: 'Espinaca',
          brand: null,
          calories: 23,
          proteinG: 3,
          carbsG: 4,
          fatsG: 0,
          fiberG: 2,
          servingSize: 100,
          servingUnit: 'g',
        },
        targetCalories: 165,
        requiresConfirmation: false,
      },
      quantity: null,
      occurredAt: '2026-08-10T20:00:00.000Z',
    })
    expect(entry.quantity).toBe(715)
    expect(entry.mealSlot).toBeNull()
    expect(entry.totals.calories).toBe(165)
  })
})
