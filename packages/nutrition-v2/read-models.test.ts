import { describe, expect, it } from 'vitest'
import {
  FoodBarcodeLookupReadModelSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionHistoryDaySchema,
  NutritionTodayReadModelSchema,
  describeLegacyHistoryDay,
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

  it('reaches the mobileCoach surface via a client-only canary (drift A)', () => {
    const config = {
      mode: 'canary',
      clientIds: [clientId],
      coachIds: [],
      teamIds: [],
      orgIds: [],
      surfaces: {
        webStudent: false,
        webCoach: false,
        mobileStudent: false,
        mobileCoach: true,
      },
    }

    // Con el clientId de la ficha en el contexto, un canary acotado solo por alumno alcanza al coach.
    expect(resolveNutritionV2Rollout(config, { surface: 'mobileCoach', coachId, clientId })).toEqual({
      enabled: true,
      mode: 'canary',
      reason: 'client_canary',
    })
    // Sin el clientId (roster global del coach) el alumno no entra al canary del coach => queda en V1.
    expect(resolveNutritionV2Rollout(config, { surface: 'mobileCoach', coachId }).reason).toBe('not_in_canary')
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

describe('nutrition V2 history day contract', () => {
  const baseDay = {
    localDate: '2026-05-10',
    snapshotId: null,
    planVersionId: null,
    strategy: null,
    targets: {
      calories: null,
      proteinG: null,
      carbsG: null,
      fatsG: null,
      fiberG: null,
      sodiumMg: null,
      waterMl: null,
    },
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
    activeEntryCount: 0,
    correctionCount: 0,
    legacyCompletionCount: 3,
    legacyDisclosure: 'legacy_completion_without_food_detail' as const,
    lastRecordedAt: null,
  }

  it('parses a cached day payload without the additive legacy fields', () => {
    const parsed = NutritionHistoryDaySchema.parse(baseDay)
    expect(parsed.legacyEntryCount).toBeUndefined()
    expect(parsed.legacyConsumed).toBeUndefined()
    expect(parsed.legacyMeals).toBeUndefined()
  })

  it('parses a day carrying legacy macros and completed meal names', () => {
    const parsed = NutritionHistoryDaySchema.parse({
      ...baseDay,
      legacyEntryCount: 4,
      legacyConsumed: { calories: 1820, proteinG: 130, carbsG: 190, fatsG: 60 },
      legacyMeals: ['Desayuno', 'Almuerzo', 'Cena'],
    })
    expect(parsed.legacyConsumed?.calories).toBe(1820)
    expect(parsed.legacyMeals).toEqual(['Desayuno', 'Almuerzo', 'Cena'])
  })

  it('keeps a legacy day with no macros explicit (null legacyConsumed)', () => {
    const parsed = NutritionHistoryDaySchema.parse({
      ...baseDay,
      legacyEntryCount: 0,
      legacyConsumed: null,
      legacyMeals: null,
    })
    expect(parsed.legacyConsumed).toBeNull()
    expect(parsed.legacyMeals).toBeNull()
  })
})

describe('describeLegacyHistoryDay', () => {
  it('surfaces legacy macros for a legacy-only day', () => {
    const view = describeLegacyHistoryDay({
      activeEntryCount: 0,
      legacyDisclosure: 'legacy_completion_without_food_detail',
      legacyCompletionCount: 3,
      legacyEntryCount: 4,
      legacyConsumed: { calories: 1820, proteinG: 130, carbsG: 190, fatsG: 60 },
      legacyMeals: ['Desayuno', 'Almuerzo'],
    })
    expect(view.isLegacy).toBe(true)
    expect(view.legacyOnly).toBe(true)
    expect(view.hasMacros).toBe(true)
    expect(view.mealsLabel).toBe('Desayuno · Almuerzo')
  })

  it('labels completions without macros and pluralizes correctly', () => {
    const many = describeLegacyHistoryDay({
      activeEntryCount: 0,
      legacyDisclosure: 'legacy_completion_without_food_detail',
      legacyCompletionCount: 3,
      legacyEntryCount: 0,
      legacyConsumed: null,
      legacyMeals: null,
    })
    expect(many.hasMacros).toBe(false)
    expect(many.completionsLabel).toBe('3 comidas completadas')

    const one = describeLegacyHistoryDay({
      activeEntryCount: 0,
      legacyDisclosure: 'legacy_completion_without_food_detail',
      legacyCompletionCount: 1,
      legacyEntryCount: 0,
      legacyConsumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
      legacyMeals: [],
    })
    expect(one.completionsLabel).toBe('1 comida completada')
    expect(one.mealsLabel).toBeNull()
  })

  it('treats a day with new records plus legacy data as mixed (secondary line)', () => {
    const view = describeLegacyHistoryDay({
      activeEntryCount: 5,
      legacyDisclosure: 'legacy_completion_without_food_detail',
      legacyCompletionCount: 2,
      legacyEntryCount: 3,
      legacyConsumed: { calories: 900, proteinG: 40, carbsG: 90, fatsG: 30 },
      legacyMeals: ['Colación'],
    })
    expect(view.legacyOnly).toBe(false)
    expect(view.secondaryLabel).toBe('Sistema anterior · 900 kcal')
  })

  it('is inert when there is no legacy data (cached payload without fields)', () => {
    const view = describeLegacyHistoryDay({
      activeEntryCount: 4,
      legacyDisclosure: null,
      legacyCompletionCount: 0,
      legacyEntryCount: undefined,
      legacyConsumed: undefined,
      legacyMeals: undefined,
    })
    expect(view.isLegacy).toBe(false)
    expect(view.legacyOnly).toBe(false)
    expect(view.secondaryLabel).toBeNull()
    expect(view.mealsLabel).toBeNull()
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
