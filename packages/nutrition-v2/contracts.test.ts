import { describe, expect, it } from 'vitest'
import {
  NutritionExchangeTargetSchema,
  NutritionIntakeMutationSchema,
  NutritionMealSlotSchema,
  NutritionPlanDraftSchema,
  buildNutritionIdempotencyKey,
  buildNutritionPortionIntakeKey,
  clampNutritionProgress,
  nutritionPortionOperationId,
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

describe('nutrition V2 exchange target contract (SPEC R1/R2)', () => {
  const slotBase = {
    code: 'lunch',
    name: 'Almuerzo',
    items: [],
  }

  it('leaves exchangeTargets absent on a slot without portions (layer is opt-in)', () => {
    const parsed = NutritionMealSlotSchema.parse(slotBase)
    // `.optional()` (ver nota en contracts.ts): ausente = sin porciones; consumidor usa `?? []`.
    expect(parsed.exchangeTargets).toBeUndefined()
  })

  it('accepts half-portion targets in 0,5 steps', () => {
    for (const portions of [0.5, 1, 1.5, 2, 99]) {
      expect(
        NutritionExchangeTargetSchema.safeParse({
          exchangeGroupId: '8b5e5cdd-6ef2-4818-a6df-cc2a4dc35312',
          portions,
        }).success,
      ).toBe(true)
    }
  })

  it('rejects non-half-step, zero, negative or over-99 portions', () => {
    for (const portions of [0, -1, 0.3, 1.25, 100]) {
      expect(
        NutritionExchangeTargetSchema.safeParse({
          exchangeGroupId: '8b5e5cdd-6ef2-4818-a6df-cc2a4dc35312',
          portions,
        }).success,
      ).toBe(false)
    }
  })

  it('carries targets through a meal slot with items AND portions at once', () => {
    const parsed = NutritionMealSlotSchema.parse({
      ...slotBase,
      exchangeTargets: [
        { exchangeGroupId: '8b5e5cdd-6ef2-4818-a6df-cc2a4dc35312', portions: 2 },
        { exchangeGroupId: '9c6e5cdd-6ef2-4818-a6df-cc2a4dc35313', portions: 1.5 },
      ],
    })
    expect(parsed.exchangeTargets).toHaveLength(2)
    expect(parsed.exchangeTargets[0].notes).toBeNull()
    expect(parsed.exchangeTargets[0].orderIndex).toBe(0)
  })
})

describe('nutrition V2 portion idempotency key (SPEC R4; Q5)', () => {
  const base = {
    clientId: 'client-1',
    deviceId: 'phone-a',
    localDate: '2026-07-18',
    slotCode: 'lunch',
    groupCode: 'C',
    ordinal: 0,
  }

  it('builds the canonical operationId "{fecha}-{slot}-{grupo}-{ordinal}-a{attempt}"', () => {
    expect(
      nutritionPortionOperationId({
        localDate: '2026-07-18',
        slotCode: 'lunch',
        groupCode: 'C',
        ordinal: 2,
        attempt: 1,
      }),
    ).toBe('2026-07-18-lunch-C-2-a1')
  })

  it('validates ordinal (>=0 int) and attempt (>=1 int)', () => {
    expect(() =>
      nutritionPortionOperationId({ ...base, ordinal: -1, attempt: 1 }),
    ).toThrow()
    expect(() =>
      nutritionPortionOperationId({ ...base, ordinal: 1.5, attempt: 1 }),
    ).toThrow()
    expect(() =>
      nutritionPortionOperationId({ ...base, ordinal: 0, attempt: 0 }),
    ).toThrow()
  })

  it('re-marking after undo produces a NEW key that never collides with the voided intake', () => {
    const firstMark = buildNutritionPortionIntakeKey({ ...base, attempt: 1 })
    const afterUndoReMark = buildNutritionPortionIntakeKey({ ...base, attempt: 2 })
    expect(afterUndoReMark).not.toBe(firstMark)
    expect(firstMark).toBe('intake:client-1:phone-a:2026-07-18-lunch-c-0-a1')
    expect(afterUndoReMark).toBe('intake:client-1:phone-a:2026-07-18-lunch-c-0-a2')
  })

  it('replaying the SAME mark (same attempt) keeps a stable key (offline dedup)', () => {
    expect(buildNutritionPortionIntakeKey({ ...base, attempt: 1 })).toBe(
      buildNutritionPortionIntakeKey({ ...base, attempt: 1 }),
    )
  })

  it('distinct ordinals of the same group/slot/day never collide', () => {
    expect(buildNutritionPortionIntakeKey({ ...base, ordinal: 0, attempt: 1 })).not.toBe(
      buildNutritionPortionIntakeKey({ ...base, ordinal: 1, attempt: 1 }),
    )
  })
})
