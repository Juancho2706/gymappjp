import { describe, expect, it } from 'vitest'
import {
  FoodBarcodeLookupReadModelSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionTodayReadModelSchema,
  resolveNutritionV2Rollout,
} from './index'

const clientId = '11111111-1111-4111-8111-111111111111'
const coachId = '22222222-2222-4222-8222-222222222222'

describe('nutrition V2 rollout', () => {
  it('fails closed on invalid or absent config', () => {
    expect(resolveNutritionV2Rollout(undefined, { surface: 'webStudent', clientId })).toEqual({
      enabled: false,
      mode: 'off',
      reason: 'invalid_config',
    })
  })

  it('enables only an allowed canary surface and subject', () => {
    const config = {
      mode: 'canary',
      clientIds: [clientId],
      coachIds: [],
      teamIds: [],
      orgIds: [],
      surfaces: {
        webStudent: true,
        webCoach: false,
        mobileStudent: true,
        mobileCoach: false,
      },
    }

    expect(resolveNutritionV2Rollout(config, { surface: 'webStudent', clientId }).enabled).toBe(true)
    expect(resolveNutritionV2Rollout(config, { surface: 'webCoach', coachId }).reason).toBe('surface_off')
  })
})

describe('nutrition V2 read contracts', () => {
  it('accepts an empty today response without inventing a plan', () => {
    const parsed = NutritionTodayReadModelSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-07-14T18:00:00-04:00',
      localDate: '2026-07-14',
      timezone: 'America/Santiago',
      snapshotId: null,
      plan: null,
      targets: {
        calories: null,
        proteinG: null,
        carbsG: null,
        fatsG: null,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      consumed: {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatsG: 0,
        fiberG: 0,
        entryCount: 0,
      },
      remaining: {
        calories: null,
        proteinG: null,
        carbsG: null,
        fatsG: null,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
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
      syncToken: 'empty:2026-07-14',
    })

    expect(parsed.plan).toBeNull()
    expect(parsed.consumed.entryCount).toBe(0)
  })
})

describe('nutrition V2 catalog contracts', () => {
  it('accepts an empty paginated search', () => {
    expect(
      FoodCatalogSearchReadModelSchema.parse({
        schemaVersion: 1,
        generatedAt: '2026-07-14T18:00:00-04:00',
        query: 'yogur',
        countryCode: 'CL',
        items: [],
        nextCursor: null,
        hasMore: false,
      }).items,
    ).toEqual([])
  })

  it('keeps not-found barcode results explicit', () => {
    const parsed = FoodBarcodeLookupReadModelSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-07-14T18:00:00-04:00',
      status: 'not_found',
      gtin: '7801234567895',
      missingReportId: null,
    })
    expect(parsed.status).toBe('not_found')
  })
})
