import { describe, expect, it } from 'vitest'
import {
  buildCoachDayIntakeRows,
  buildCoachDayIntakeSummary,
  consumedRatioChipLabel,
} from './coach-day-entries'
import type { NutritionIntakeReadItem, NutritionMealSlotRead, NutritionTodayReadModel } from './read-models'

// Fixtures del read model portados de `today-entries.test.ts` (misma forma, mismos ids): el panel
// del coach lee EXACTAMENTE lo que el Hoy del alumno, así que los casos tienen que ser comparables.
const ITEM_ID = '22222222-2222-4222-8222-222222222222'

function slot(overrides: Partial<NutritionMealSlotRead> & { code: string }): NutritionMealSlotRead {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Almuerzo',
    startTime: '13:00',
    endTime: null,
    mode: 'anchor',
    required: true,
    instructions: null,
    targets: {},
    prescriptionItems: [],
    intakeItems: [],
    ...overrides,
  }
}

function intakeEntry(
  overrides: Partial<NutritionIntakeReadItem> & { id: string },
): NutritionIntakeReadItem {
  return {
    foodId: null,
    customName: 'Registro',
    quantity: 1,
    unit: 'un',
    mealSlot: 'lunch',
    source: 'offplan',
    captureMethod: 'manual',
    occurredAt: '2026-09-06T16:04:00.000Z',
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: null,
    snapshot: {
      name: 'Pan pita',
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

function todayModel(overrides: Partial<NutritionTodayReadModel>): NutritionTodayReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-06T00:00:00.000Z',
    localDate: '2026-09-06',
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

describe('buildCoachDayIntakeRows', () => {
  it('junta franjas y "fuera del plan" ordenados por hora, con el nombre de la franja', () => {
    const rows = buildCoachDayIntakeRows(
      todayModel({
        mealSlots: [
          slot({
            code: 'lunch',
            intakeItems: [intakeEntry({ id: 'e2', occurredAt: '2026-09-06T18:00:00.000Z' })],
          }),
        ],
        unassignedIntake: [
          intakeEntry({ id: 'e1', mealSlot: null, occurredAt: '2026-09-06T12:00:00.000Z' }),
        ],
      }),
    )
    expect(rows.map((row) => row.entry.id)).toEqual(['e1', 'e2'])
    expect(rows[0].slotName).toBeNull()
    expect(rows[1].slotName).toBe('Almuerzo')
  })

  it('descarta marcas de porción y registros no activos', () => {
    const rows = buildCoachDayIntakeRows(
      todayModel({
        mealSlots: [
          slot({
            code: 'lunch',
            intakeItems: [
              intakeEntry({ id: 'marca', exchangeGroupCode: 'C', exchangePortions: 1.5 }),
              intakeEntry({ id: 'retirado', status: 'voided' }),
              intakeEntry({ id: 'corregido', status: 'corrected' }),
              intakeEntry({ id: 'vivo' }),
            ],
          }),
        ],
      }),
    )
    expect(rows.map((row) => row.entry.id)).toEqual(['vivo'])
  })

  it('rotula la cantidad con la medida casera y copia los totales del registro', () => {
    const [row] = buildCoachDayIntakeRows(
      todayModel({
        unassignedIntake: [
          intakeEntry({
            id: 'e1',
            mealSlot: null,
            quantity: 122,
            unit: 'g',
            householdLabel: 'huevo',
            householdGrams: 61,
            totals: { calories: 180, proteinG: 12, carbsG: 1, fatsG: 13, fiberG: 0 },
          }),
        ],
      }),
    )
    expect(row.row).toMatchObject({
      id: 'e1',
      name: 'Pan pita',
      quantityLabel: '2 huevos (122 g)',
      calories: 180,
      proteinG: 12,
      carbsG: 1,
      fatsG: 13,
      // La miniatura la resuelve cada app con su helper de media, no el paquete.
      thumbnailUrl: null,
    })
  })

  it('la hora sale en la zona del alumno', () => {
    const [row] = buildCoachDayIntakeRows(
      todayModel({
        unassignedIntake: [
          intakeEntry({ id: 'e1', mealSlot: null, occurredAt: '2026-09-06T16:04:00.000Z' }),
        ],
      }),
    )
    // 16:04 UTC = 13:04 en Santiago (UTC-3 en septiembre, con horario de verano vigente).
    expect(row.clock).toBe('13:04')
  })

  it('marca "versión anterior" al registro huérfano y al que trae el linaje de W3.1', () => {
    const rows = buildCoachDayIntakeRows(
      todayModel({
        mealSlots: [
          slot({
            code: 'lunch',
            prescriptionItems: [],
            intakeItems: [
              intakeEntry({ id: 'huerfano', prescriptionItemId: ITEM_ID }),
              intakeEntry({
                id: 'linaje',
                prescriptionItemId: null,
                originalPrescriptionItemId: ITEM_ID,
              }),
              intakeEntry({ id: 'libre' }),
            ],
          }),
        ],
      }),
    )
    expect(rows.find((row) => row.entry.id === 'huerfano')?.priorVersion).toBe(true)
    expect(rows.find((row) => row.entry.id === 'linaje')?.priorVersion).toBe(true)
    expect(rows.find((row) => row.entry.id === 'libre')?.priorVersion).toBe(false)
  })

  it('un ítem que solo CAMBIÓ de franja no es de una versión anterior', () => {
    const rows = buildCoachDayIntakeRows(
      todayModel({
        mealSlots: [
          slot({
            code: 'lunch',
            intakeItems: [intakeEntry({ id: 'movido', prescriptionItemId: ITEM_ID })],
          }),
          slot({
            id: '33333333-3333-4333-8333-333333333333',
            code: 'dinner',
            name: 'Cena',
            prescriptionItems: [
              {
                id: ITEM_ID,
                foodId: null,
                recipeId: null,
                name: 'Pan pita',
                brand: null,
                quantity: 1,
                unit: 'un',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 100, proteinG: 5, carbsG: 10, fatsG: 2, fiberG: null },
              },
            ],
          }),
        ],
      }),
    )
    expect(rows.find((row) => row.entry.id === 'movido')?.priorVersion).toBe(false)
  })

  it('un día sin registros no produce filas', () => {
    expect(buildCoachDayIntakeRows(todayModel({}))).toEqual([])
  })
})

describe('buildCoachDayIntakeSummary', () => {
  it('cuenta franjas DISTINTAS con registro y toma el entryCount del read model', () => {
    expect(
      buildCoachDayIntakeSummary(
        todayModel({
          consumed: { calories: 300, proteinG: 15, carbsG: 30, fatsG: 6, fiberG: 0, entryCount: 3 },
          mealSlots: [
            slot({
              code: 'lunch',
              intakeItems: [intakeEntry({ id: 'e1' }), intakeEntry({ id: 'e2' })],
            }),
            slot({ id: '33333333-3333-4333-8333-333333333333', code: 'dinner', name: 'Cena', intakeItems: [] }),
          ],
          unassignedIntake: [intakeEntry({ id: 'e3', mealSlot: null })],
        }),
      ),
    ).toEqual({ entryCount: 3, slotCount: 1 })
  })

  it('un día sin registros queda en cero', () => {
    expect(buildCoachDayIntakeSummary(todayModel({}))).toEqual({ entryCount: 0, slotCount: 0 })
  })
})

describe('consumedRatioChipLabel', () => {
  it('avisa desde 2× la meta, con coma decimal es-CL', () => {
    expect(consumedRatioChipLabel({ consumedCalories: 5637, targetCalories: 1556 })).toBe('3,6× la meta')
    expect(consumedRatioChipLabel({ consumedCalories: 3112, targetCalories: 1556 })).toBe('2× la meta')
  })

  it('bajo el umbral, sin meta o sin consumo no hay chip', () => {
    expect(consumedRatioChipLabel({ consumedCalories: 2000, targetCalories: 1556 })).toBeNull()
    expect(consumedRatioChipLabel({ consumedCalories: 5637, targetCalories: null })).toBeNull()
    expect(consumedRatioChipLabel({ consumedCalories: 0, targetCalories: 1556 })).toBeNull()
  })
})
