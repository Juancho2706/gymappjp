import { describe, expect, it } from 'vitest'
import { expandComposedGroups, macrosForTargets, type ExchangeGroup } from '@eva/nutrition-engine'
import {
  FoodBarcodeLookupReadModelSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionExchangeGroupReadSchema,
  NutritionHistoryDaySchema,
  NutritionSlotExchangeTargetReadSchema,
  NutritionTodayReadModelSchema,
  computePortionCoverage,
  describeLegacyHistoryDay,
  portionCoverageKey,
  reconstructExchangeGroups,
  resolveNutritionV2Rollout,
  type NutritionSlotExchangeTargetRead,
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

describe('nutrition V2 portions — cache compatibility (criterio 8 / Q12)', () => {
  const emptyTargets = {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatsG: null,
    fiberG: null,
    sodiumMg: null,
    waterMl: null,
  }

  it('parses a Today payload from BEFORE portions (no exchangeGroups, no slot.exchangeTargets)', () => {
    const parsed = NutritionTodayReadModelSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-07-18T18:00:00-04:00',
      localDate: '2026-07-18',
      timezone: 'America/Santiago',
      snapshotId: null,
      plan: null,
      targets: emptyTargets,
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
      remaining: emptyTargets,
      permissions: {
        canRegisterFreely: true,
        canAdjustPrescribedQuantity: true,
        quantityAdjustmentPercent: null,
        canSubstitute: false,
        canMoveMealSlot: false,
        canSkipOptionalItems: true,
      },
      mealSlots: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          code: 'lunch',
          name: 'Almuerzo',
          startTime: null,
          endTime: null,
          mode: 'anchor',
          required: false,
          instructions: null,
          targets: {},
          prescriptionItems: [],
          intakeItems: [],
        },
      ],
      unassignedIntake: [],
      syncToken: 'v:2026-07-18',
    })
    expect(parsed.exchangeGroups).toBeUndefined()
    expect(parsed.mealSlots[0].exchangeTargets).toBeUndefined()
    expect(parsed.schemaVersion).toBe(1)
  })

  it('accepts a slot exchange target with and without coverage split', () => {
    const withCoverage = NutritionSlotExchangeTargetReadSchema.parse({
      id: '44444444-4444-4444-8444-444444444444',
      exchangeGroupId: '55555555-5555-4555-8555-555555555555',
      groupCode: 'C',
      groupName: 'Cereales',
      color: '#F59E0B',
      portions: 2,
      notes: null,
      orderIndex: 0,
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
      composedOf: null,
      macrosConfirmed: true,
      marcadas: 1.5,
      derivadas: 0.5,
      coverage: 2,
    })
    expect(withCoverage.coverage).toBe(2)

    const withoutCoverage = NutritionSlotExchangeTargetReadSchema.parse({
      id: '44444444-4444-4444-8444-444444444444',
      exchangeGroupId: '55555555-5555-4555-8555-555555555555',
      groupCode: 'C',
      groupName: 'Cereales',
      color: null,
      portions: 0.5,
      notes: null,
      orderIndex: 1,
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 },
      composedOf: null,
      macrosConfirmed: false,
    })
    expect(withoutCoverage.marcadas).toBeUndefined()
    expect(withoutCoverage.derivadas).toBeUndefined()
  })
})

describe('nutrition V2 portions — exchangeGroups reconstruction (SPEC R2/R3/A2/A4)', () => {
  // LEG con composed_of ENRIQUECIDO: refs de P y C CONGELADOS distintos del ref (stale)
  // del propio LEG. Prueba que la expansión usa los valores congelados, no el catálogo.
  const legTarget: Pick<
    NutritionSlotExchangeTargetRead,
    'exchangeGroupId' | 'groupCode' | 'groupName' | 'color' | 'ref' | 'composedOf' | 'macrosConfirmed'
  > = {
    exchangeGroupId: '66666666-6666-4666-8666-666666666666',
    groupCode: 'LEG',
    groupName: 'Leguminosas',
    color: '#22C55E',
    ref: { calories: 999, proteinG: 999, carbsG: 999, fatsG: 999 },
    composedOf: [
      { code: 'P', portions: 1, ref: { calories: 120, proteinG: 12, carbsG: 4, fatsG: 6 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ],
    macrosConfirmed: true,
  }

  it('synthesizes base groups (P, C) from composed_of when not prescribed directly', () => {
    const dict = reconstructExchangeGroups([legTarget])
    const codes = dict.map((g) => g.code).sort()
    expect(codes).toEqual(['C', 'LEG', 'P'])
    const p = dict.find((g) => g.code === 'P')!
    expect(p.id).toBe('snapshot-base:P')
    expect(p.isSystem).toBe(true)
    expect(p.refCalories).toBe(120)
  })

  it('the reconstructed dict is assignable to the engine ExchangeGroup shape (A4 both edges)', () => {
    const dict = reconstructExchangeGroups([legTarget])
    // Contrato de forma en AMBOS bordes: el dict del read-model encaja en el tipo del engine…
    const engineDict: ExchangeGroup[] = dict
    // …y cada entrada valida contra el schema del read-model.
    for (const group of engineDict) {
      expect(NutritionExchangeGroupReadSchema.safeParse(group).success).toBe(true)
    }
  })

  it('expands LEG against the FROZEN P/C refs, never the live/stale LEG ref (Q6)', () => {
    const dict = reconstructExchangeGroups([legTarget])
    const legId = legTarget.exchangeGroupId
    const expanded = expandComposedGroups([{ exchangeGroupId: legId, portions: 2 }], dict)
    expect(expanded.map((e) => e.group.code).sort()).toEqual(['C', 'P'])
    // 2× (P{120,12,4,6} + C{70,2,15,0}) — NO el ref stale 999 del LEG.
    const macros = macrosForTargets([{ exchangeGroupId: legId, portions: 2 }], dict)
    expect(macros).toEqual({ calories: 380, proteinG: 28, carbsG: 38, fatsG: 12 })
  })

  it('prefers a directly-prescribed group over a composed_of base of the same code', () => {
    const directP: typeof legTarget = {
      exchangeGroupId: '77777777-7777-4777-8777-777777777777',
      groupCode: 'P',
      groupName: 'Proteínas',
      color: '#3B82F6',
      ref: { calories: 100, proteinG: 20, carbsG: 0, fatsG: 2 },
      composedOf: null,
      macrosConfirmed: true,
    }
    const dict = reconstructExchangeGroups([directP, legTarget])
    const p = dict.find((g) => g.code === 'P')!
    // El P prescrito directo (id uuid, ref propia) gana sobre el base sintetizado.
    expect(p.id).toBe(directP.exchangeGroupId)
    expect(p.refCalories).toBe(100)
  })
})

describe('nutrition V2 portions — coverage split (SPEC R5; solo cadenas activas)', () => {
  it('splits marcadas vs derivadas per (slot, group) and excludes voided/unslotted', () => {
    const coverage = computePortionCoverage([
      // marcadas C/lunch = 1 + 0,5 = 1,5
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 0.5 },
      // void neutralizado: no suma (doble cinturón B3)
      { status: 'voided', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      // derivadas C/lunch = 100/50 = 2
      {
        status: 'active',
        mealSlotCode: 'lunch',
        foodExchangeGroupCode: 'C',
        quantityGrams: 100,
        exchangePortionGrams: 50,
      },
      // food sin exchange_portion_grams: no aporta cobertura
      {
        status: 'active',
        mealSlotCode: 'lunch',
        foodExchangeGroupCode: 'C',
        quantityGrams: 30,
        exchangePortionGrams: null,
      },
      // otro grupo/franja
      { status: 'active', mealSlotCode: 'breakfast', exchangeGroupCode: 'P', exchangePortions: 1 },
      // sin franja: solo resumen del día, nunca a un chip de franja
      { status: 'active', mealSlotCode: null, exchangeGroupCode: 'C', exchangePortions: 1 },
    ])

    const lunchC = coverage.get(portionCoverageKey('lunch', 'C'))
    expect(lunchC).toEqual({ marcadas: 1.5, derivadas: 2, coverage: 3.5 })
    const breakfastP = coverage.get(portionCoverageKey('breakfast', 'P'))
    expect(breakfastP).toEqual({ marcadas: 1, derivadas: 0, coverage: 1 })
    // el intake sin franja no crea celda de franja
    expect([...coverage.keys()].sort()).toEqual([
      portionCoverageKey('breakfast', 'P'),
      portionCoverageKey('lunch', 'C'),
    ])
  })

  it('a synthetic mark and a real food are two lenses of the same coverage — no double macro count', () => {
    // marcadas + derivadas se SUMAN en cobertura, pero los macros los aporta cada intake UNA vez
    // (SPEC R5/criterio 6): aquí solo verificamos que la cobertura los combina sin descartar.
    const coverage = computePortionCoverage([
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'V', exchangePortions: 1 },
      {
        status: 'active',
        mealSlotCode: 'lunch',
        foodExchangeGroupCode: 'V',
        quantityGrams: 150,
        exchangePortionGrams: 100,
      },
    ])
    expect(coverage.get(portionCoverageKey('lunch', 'V'))).toEqual({
      marcadas: 1,
      derivadas: 1.5,
      coverage: 2.5,
    })
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
