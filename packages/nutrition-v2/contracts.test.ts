import { describe, expect, it } from 'vitest'
import {
  NutritionIntakeMutationSchema,
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  clampNutritionProgress,
  nutritionProgressPercent,
  resolveMacroProgressState,
} from './index'

describe('nutrition V2 design helpers', () => {
  it('clamps progress without hiding small overshoots', () => {
    expect(clampNutritionProgress(110, 100)).toBe(1.1)
    expect(clampNutritionProgress(200, 100)).toBe(1.15)
    expect(clampNutritionProgress(10, 0)).toBe(0)
    expect(nutritionProgressPercent(125, 100)).toBe(100)
  })

  it('resolves explicit macro states', () => {
    expect(resolveMacroProgressState(0, 100)).toBe('empty')
    expect(resolveMacroProgressState(80, 100, 5)).toBe('under')
    expect(resolveMacroProgressState(98, 100, 5)).toBe('in-range')
    expect(resolveMacroProgressState(108, 100, 5)).toBe('over')
  })
})

describe('nutrition V2 product contracts', () => {
  it('accepts a flexible plan with one day variant', () => {
    const result = NutritionPlanDraftSchema.safeParse({
      clientId: '8b5e5cdd-6ef2-4818-a6df-cc2a4dc35312',
      name: 'Macros flexibles',
      strategy: 'flexible',
      timezone: 'America/Santiago',
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: true,
        canSkipOptionalItems: true,
      },
      dayVariants: [
        {
          key: 'default',
          label: 'Día base',
          default: true,
          targets: {
            calories: 2100,
            proteinG: 160,
            carbsG: 230,
            fatsG: 65,
            fiberG: null,
            sodiumMg: null,
            waterMl: 2500,
          },
          mealSlots: [],
        },
      ],
    })

    expect(result.success).toBe(true)
  })

  it('rejects intake without a food or custom name', () => {
    const result = NutritionIntakeMutationSchema.safeParse({
      clientId: '8b5e5cdd-6ef2-4818-a6df-cc2a4dc35312',
      localDate: '2026-07-14',
      occurredAt: '2026-07-14T14:00:00-04:00',
      timezone: 'America/Santiago',
      quantity: 100,
      unit: 'g',
      source: 'offplan',
      captureMethod: 'search',
      idempotencyKey: 'intake:client:device:operation',
      snapshot: {
        name: 'Alimento',
        calories: 100,
        proteinG: 10,
        carbsG: 10,
        fatsG: 2,
      },
    })

    expect(result.success).toBe(false)
  })

  it('builds stable idempotency keys', () => {
    expect(
      buildNutritionIdempotencyKey({
        kind: 'intake',
        clientId: 'CLIENT-1',
        deviceId: 'PHONE A',
        operationId: 'OP 42',
      }),
    ).toBe('intake:client-1:phone-a:op-42')
  })
})
