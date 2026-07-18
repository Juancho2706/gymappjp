import { describe, expect, it } from 'vitest'
import {
  dayTotals,
  expandComposedGroups,
  macrosForTargets,
  type ExchangeGroup,
} from '@eva/nutrition-engine'
import {
  NutritionTodayReadModelSchema,
  computePortionCoverage,
  countDraftChanges,
  portionCoverageKey,
  reconstructExchangeGroups,
  readModelToDraft,
  type NutritionDayCoverageRead,
  type NutritionPlanReadModel,
  type NutritionSlotExchangeTargetRead,
  type PortionCoverageIntake,
} from './index'
import {
  mapV1PlanToV2Conversion,
  type ConversionBundle,
  type ConversionExchangeGroup,
  type V1MealRow,
  type V1PlanTree,
} from './conversion'

/**
 * Matriz Q de integración (SPEC §Hallazgos Q1-Q14 · TASKS T5.1). Cubre en vitest PURO
 * lo que las olas 0-3 NO cubrieron: Q6 (LEG congelado end-to-end), Q7 (grupo sin foods
 * clasificados), Q8 (grandfathering — porciones NUNCA gated en el paquete), Q10
 * (republish same-day sin duplicar intakes), Q11 (exceso "+n" por celda independiente),
 * Q14 (fidelidad de conversión, caso combinado custom+LEG+media+dow-NULL).
 *
 * Sin apps/web (frontera del paquete): la lógica de UI (`portion-marks.logic`,
 * `buildExchangeTargetInsertRow`) se ejerce por su ESPEJO productivo en el paquete
 * (`conversion.ts` congela con la misma mecánica que el builder) o replicando su
 * contrato con un fixture del snapshot, según indica TASKS T5.1.
 */

// ===========================================================================
// Fábricas de dominio compartidas
// ===========================================================================

function makeIdFactory(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

// Refs por porción (INTA/UDD-like). LEG = compuesto 1P + 1C; SHK = custom del coach.
const GROUP_C: ConversionExchangeGroup = {
  id: 'grp-c', code: 'C', name: 'Cereales', refCalories: 70, refProteinG: 2, refCarbsG: 15, refFatsG: 0,
  composedOf: null, macrosConfirmed: true, isSystem: true,
}
const GROUP_P: ConversionExchangeGroup = {
  id: 'grp-p', code: 'P', name: 'Proteinas', refCalories: 75, refProteinG: 7, refCarbsG: 0, refFatsG: 5,
  composedOf: null, macrosConfirmed: true, isSystem: true,
}
const GROUP_F: ConversionExchangeGroup = {
  id: 'grp-f', code: 'F', name: 'Frutas', refCalories: 60, refProteinG: 0, refCarbsG: 15, refFatsG: 0,
  composedOf: null, macrosConfirmed: true, isSystem: true,
}
const GROUP_LEG: ConversionExchangeGroup = {
  id: 'grp-leg', code: 'LEG', name: 'Leguminosas', refCalories: 0, refProteinG: 0, refCarbsG: 0, refFatsG: 0,
  composedOf: [{ code: 'P', portions: 1 }, { code: 'C', portions: 1 }], macrosConfirmed: false, isSystem: true,
}
const GROUP_SHK: ConversionExchangeGroup = {
  id: 'grp-shk', code: 'SHK', name: 'Batido del coach', refCalories: 120, refProteinG: 20, refCarbsG: 5, refFatsG: 2,
  composedOf: null, macrosConfirmed: false, isSystem: false,
}
const ALL_GROUPS: ConversionExchangeGroup[] = [GROUP_C, GROUP_P, GROUP_F, GROUP_LEG, GROUP_SHK]

/** ConversionExchangeGroup -> ExchangeGroup del engine (para paridad de macros). */
function toEngineGroup(g: ConversionExchangeGroup, sortOrder: number): ExchangeGroup {
  return {
    id: g.id, slug: g.code.toLowerCase(), code: g.code, name: g.name,
    coachId: g.isSystem ? null : 'coach-1', teamId: null, isSystem: g.isSystem,
    refCalories: g.refCalories, refProteinG: g.refProteinG, refCarbsG: g.refCarbsG, refFatsG: g.refFatsG,
    color: null, sortOrder, composedOf: g.composedOf, macrosConfirmed: g.macrosConfirmed,
  }
}
const ENGINE_GROUPS: ExchangeGroup[] = ALL_GROUPS.map((g, i) => toEngineGroup(g, i))

function planRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1', client_id: 'client-1', coach_id: 'coach-1', org_id: null, team_id: null,
    name: 'Plan exchanges', plan_mode: 'exchanges', daily_calories: 2000, protein_g: 150,
    carbs_g: 200, fats_g: 60, instructions: null, updated_at: '2026-07-17T12:00:00Z', ...overrides,
  }
}

let xtSeq = 0
function xtarget(group: ConversionExchangeGroup, portions: number, notes: string | null = null) {
  return { id: `xt-${++xtSeq}`, exchange_group_id: group.id, portions, notes }
}

function meal(overrides: Partial<V1MealRow> & Pick<V1MealRow, 'id'>): V1MealRow {
  return { name: 'Comida', description: null, order_index: 0, day_of_week: null, items: [], ...overrides }
}

function convert(meals: V1MealRow[], groups = ALL_GROUPS): ConversionBundle {
  const tree: V1PlanTree = { plan: planRow() as never, meals }
  const result = mapV1PlanToV2Conversion(tree, {
    newId: makeIdFactory(), versionNumber: 1, effectiveFromLocalDate: '2026-07-17', exchangeGroups: groups,
  })
  if (!result.ok) throw new Error(`expected bundle, got skip: ${result.reason}`)
  return result
}

/**
 * Fila de snapshot congelado (salida de conversión / builder) -> target del read-model,
 * la forma que consume `reconstructExchangeGroups`. Reúne el ESPEJO productivo del freeze.
 */
function snapshotRowToReadTarget(
  row: Record<string, unknown>,
): Pick<
  NutritionSlotExchangeTargetRead,
  'exchangeGroupId' | 'groupCode' | 'groupName' | 'color' | 'ref' | 'composedOf' | 'macrosConfirmed'
> {
  return {
    exchangeGroupId: row.exchange_group_id as string,
    groupCode: row.snapshot_group_code as string,
    groupName: row.snapshot_group_name as string,
    color: null,
    ref: {
      calories: row.snapshot_ref_calories as number,
      proteinG: row.snapshot_ref_protein_g as number,
      carbsG: row.snapshot_ref_carbs_g as number,
      fatsG: row.snapshot_ref_fats_g as number,
    },
    composedOf: row.snapshot_composed_of as NutritionSlotExchangeTargetRead['composedOf'],
    macrosConfirmed: row.snapshot_macros_confirmed as boolean,
  }
}

// ===========================================================================
// Q6 — LEG congelado end-to-end (SPEC criterio 2 / R2 / R3 / A2)
// ===========================================================================

describe('Q6 — LEG congelado end-to-end (snapshot vs catálogo vivo)', () => {
  it('reconstruct + expand + macros usan los ref_* CONGELADOS de P y C, nunca el catálogo vivo', () => {
    // Freeze REAL vía el mapper de conversión (espejo productivo de buildExchangeTargetInsertRow).
    const bundle = convert([meal({ id: 'm0', items: [], exchangeTargets: [xtarget(GROUP_LEG, 2)] })])
    const legRow = bundle.exchangeTargetRows[0]
    expect(legRow.snapshot_group_code).toBe('LEG')
    // El snapshot ENRIQUECIDO llevó P{75,7,0,5} y C{70,2,15,0} congelados por VALOR.
    expect(legRow.snapshot_composed_of).toEqual([
      { code: 'P', portions: 1, ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ])

    // Reconstrucción del diccionario desde SOLO el snapshot + expansión del engine.
    const dict = reconstructExchangeGroups([snapshotRowToReadTarget(legRow)])
    const expanded = expandComposedGroups([{ exchangeGroupId: GROUP_LEG.id, portions: 2 }], dict)
    expect(expanded.map((e) => e.group.code).sort()).toEqual(['C', 'P'])
    const frozenMacros = macrosForTargets([{ exchangeGroupId: GROUP_LEG.id, portions: 2 }], dict)
    // 2×(P{75,7,0,5} + C{70,2,15,0}) = {290,18,30,10}.
    expect(frozenMacros).toEqual({ calories: 290, proteinG: 18, carbsG: 30, fatsG: 10 })

    // Un "catálogo vivo" con P/C EDITADOS produce macros distintos: el snapshot NO se mueve.
    const liveGroups: ExchangeGroup[] = [
      toEngineGroup(GROUP_LEG, 0),
      { ...toEngineGroup(GROUP_P, 1), refCalories: 999, refProteinG: 99, refCarbsG: 9, refFatsG: 9 },
      { ...toEngineGroup(GROUP_C, 2), refCalories: 888, refProteinG: 88, refCarbsG: 8, refFatsG: 8 },
    ]
    const liveMacros = macrosForTargets([{ exchangeGroupId: GROUP_LEG.id, portions: 2 }], liveGroups)
    expect(liveMacros).not.toEqual(frozenMacros)
    // El diccionario reconstruido desde el snapshot es INDIFERENTE al catálogo vivo.
    expect(macrosForTargets([{ exchangeGroupId: GROUP_LEG.id, portions: 2 }], dict)).toEqual(frozenMacros)
  })

  it('builder->draft congela ref_* de P y C por VALOR: mutar el grupo base tras emitir NO cambia la fila', () => {
    // Fixture mutable del catálogo (replica el contrato de buildExchangeTargetInsertRow: el freeze
    // copia primitivos por valor). Emitimos la fila y luego mutamos el grupo base P/C.
    const mutableP: ConversionExchangeGroup = { ...GROUP_P }
    const mutableC: ConversionExchangeGroup = { ...GROUP_C }
    const mutableLeg: ConversionExchangeGroup = { ...GROUP_LEG }
    const groups = [mutableC, mutableP, GROUP_F, mutableLeg, GROUP_SHK]

    const bundle = convert([meal({ id: 'm0', items: [], exchangeTargets: [xtarget(GROUP_LEG, 1)] })], groups)
    const row = bundle.exchangeTargetRows[0]
    const frozenRef = JSON.parse(JSON.stringify(row.snapshot_composed_of))

    // Editar los ref_* de P y C DESPUÉS de emitir (o soft-borrarlos) no toca la fila congelada.
    mutableP.refCalories = 1
    mutableP.refProteinG = 1
    mutableC.refCalories = 2
    mutableC.refCarbsG = 2
    expect(row.snapshot_composed_of).toEqual(frozenRef)
    expect(row.snapshot_composed_of).toEqual([
      { code: 'P', portions: 1, ref: { calories: 75, proteinG: 7, carbsG: 0, fatsG: 5 } },
      { code: 'C', portions: 1, ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 } },
    ])
  })
})

// ===========================================================================
// Q7 — grupo sin foods clasificados (SPEC UX-c / estado vacío)
// ===========================================================================

describe('Q7 — grupo sin foods clasificados: cobertura solo-marcadas, sheet vacío, nada revienta', () => {
  it('computePortionCoverage con cero intakes derivables aporta SOLO marcadas', () => {
    const intakes: PortionCoverageIntake[] = [
      // marcar-porción (sintético): sí cuenta.
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 0.5 },
      // alimento real de un grupo NO clacificado (sin exchange_portion_grams): NO aporta cobertura.
      { status: 'active', mealSlotCode: 'lunch', foodExchangeGroupCode: 'C', quantityGrams: 80, exchangePortionGrams: null },
      // alimento real sin grupo (catálogo sin clasificar): tampoco aporta.
      { status: 'active', mealSlotCode: 'lunch', quantityGrams: 120, exchangePortionGrams: 40 },
    ]
    const coverage = computePortionCoverage(intakes)
    expect(coverage.get(portionCoverageKey('lunch', 'C'))).toEqual({ marcadas: 1.5, derivadas: 0, coverage: 1.5 })
    // No se crea celda para el alimento sin grupo.
    expect([...coverage.keys()]).toEqual([portionCoverageKey('lunch', 'C')])
  })

  it('Today con exchangeFoods vacío y target presente parsea sin romper (sheet-data vacía)', () => {
    const parsed = NutritionTodayReadModelSchema.parse(
      todayPayload({
        exchangeFoods: [],
        dayCoverage: [
          { groupCode: 'C', groupName: 'Cereales', color: null, prescribed: 2, marcadas: 1.5, derivadas: 0, coverage: 1.5 },
        ],
      }),
    )
    expect(parsed.exchangeFoods).toEqual([])
    expect(parsed.dayCoverage?.[0].coverage).toBe(1.5)
    expect(parsed.mealSlots[0].exchangeTargets?.[0].groupCode).toBe('C')
  })
})

// ===========================================================================
// Q8 — grandfathering: porciones NUNCA condicionadas a un entitlement en el paquete
// ===========================================================================

describe('Q8 — grandfathering: el read-model de un plan con targets opera IGUAL sin importar flags del coach', () => {
  // Dos planes idénticos salvo strategy + canRegisterFreely (simulan un coach que "bajó de plan":
  // NINGÚN gate de entitlement en contratos/read-models condiciona las porciones).
  function slotTargetFixture() {
    return {
      id: '44444444-4444-4444-8444-444444444444',
      exchangeGroupId: '55555555-5555-4555-8555-555555555555',
      groupCode: 'C', groupName: 'Cereales', color: null, portions: 2, notes: null, orderIndex: 0,
      ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }, composedOf: null, macrosConfirmed: true,
    }
  }

  it('parsea y reconstruye idéntico con strategy structured (estricto) y hybrid (registro libre)', () => {
    const strict = NutritionTodayReadModelSchema.parse(
      todayPayload({ permissionsOverride: { canRegisterFreely: false }, strategyPlan: 'structured' }),
    )
    const free = NutritionTodayReadModelSchema.parse(
      todayPayload({ permissionsOverride: { canRegisterFreely: true }, strategyPlan: 'hybrid' }),
    )
    // Los targets de porciones sobreviven idénticos: la capa no depende del flag del coach.
    expect(strict.mealSlots[0].exchangeTargets).toEqual(free.mealSlots[0].exchangeTargets)

    const dictStrict = reconstructExchangeGroups(strict.mealSlots[0].exchangeTargets ?? [])
    const dictFree = reconstructExchangeGroups(free.mealSlots[0].exchangeTargets ?? [])
    expect(dictStrict).toEqual(dictFree)
  })

  it('reconstructExchangeGroups y computePortionCoverage son funciones PURAS de los datos (sin arg de entitlement)', () => {
    // El único input es el target/intake; no hay parámetro de módulo/gate/plan-de-coach.
    const dict = reconstructExchangeGroups([slotTargetFixture()])
    expect(dict).toHaveLength(1)
    expect(dict[0].code).toBe('C')
    const cov = computePortionCoverage([
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
    ])
    expect(cov.get(portionCoverageKey('lunch', 'C'))?.coverage).toBe(1)
    // Firmas de aridad 1: ninguna acepta un flag de entitlement como 2º/3º argumento.
    expect(reconstructExchangeGroups.length).toBe(1)
    expect(computePortionCoverage.length).toBe(1)
  })
})

// ===========================================================================
// Q10 — republish same-day: re-deriva targets sin duplicar intakes
// ===========================================================================

describe('Q10 — republish same-day: draft estable + intakes intactos', () => {
  it('readModelToDraft -> countDraftChanges 0 sobre el MISMO plan con porciones', () => {
    const model = planReadModelWithPortions()
    const baseline = readModelToDraft(model, CLIENT_UUID)!
    const current = readModelToDraft(model, CLIENT_UUID)!
    expect(countDraftChanges(baseline, current)).toBe(0)
  })

  it('el draft re-hidratado conserva exchangeGroupId + portions (republish emite fila nueva, target equivalente)', () => {
    const draft = readModelToDraft(planReadModelWithPortions(), CLIENT_UUID)!
    const targets = draft.dayVariants[0].mealSlots[0].exchangeTargets!
    expect(targets).toHaveLength(2)
    expect(targets.map((t) => ({ exchangeGroupId: t.exchangeGroupId, portions: t.portions }))).toEqual([
      { exchangeGroupId: '55555555-5555-4555-8555-555555555555', portions: 2 },
      { exchangeGroupId: '66666666-6666-4666-8666-666666666666', portions: 1.5 },
    ])
  })

  it('republish NO duplica intakes: computePortionCoverage es invariante ante un snapshot NUEVO', () => {
    // Los intakes viven APARTE del snapshot del target. computePortionCoverage no recibe el
    // snapshot: sea la versión vieja o la recién republicada, la cobertura sobre los MISMOS
    // intakes es idéntica (republicar no puede inflar ni duplicar el consumido).
    const intakes: PortionCoverageIntake[] = [
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      { status: 'active', mealSlotCode: 'lunch', foodExchangeGroupCode: 'C', quantityGrams: 100, exchangePortionGrams: 50 },
    ]
    const before = computePortionCoverage(intakes)
    const after = computePortionCoverage(intakes) // tras "republish": mismos intakes, snapshot nuevo
    expect(after).toEqual(before)
    expect(after.get(portionCoverageKey('lunch', 'C'))).toEqual({ marcadas: 1, derivadas: 2, coverage: 3 })
  })
})

// ===========================================================================
// Q11 — exceso "+n": por celda independiente, sin restar a otros grupos
// ===========================================================================

/** Espejo de `extraPortionsValue` (apps/web portion-marks.logic, testeado allá): +n del exceso. */
function extraPortionsValue(prescribed: number, coverage: number): number {
  const over = coverage - prescribed
  return over > 0 ? Math.round(over * 10) / 10 : 0
}

describe('Q11 — exceso: el desglose reporta coverage-prescribed sin descontar a otros grupos', () => {
  it('cobertura > prescrito en un grupo NO reduce la cobertura de otro (celdas independientes)', () => {
    const coverage = computePortionCoverage([
      // C/lunch: 3 marcadas (prescrito 2 => exceso 1).
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'C', exchangePortions: 1 },
      // V/lunch: 1 marcada (prescrito 2 => sin exceso).
      { status: 'active', mealSlotCode: 'lunch', exchangeGroupCode: 'V', exchangePortions: 1 },
    ])
    const c = coverage.get(portionCoverageKey('lunch', 'C'))!
    const v = coverage.get(portionCoverageKey('lunch', 'V'))!
    expect(c.coverage).toBe(3)
    expect(v.coverage).toBe(1) // intacto: el exceso de C no le robó cobertura
    expect(extraPortionsValue(2, c.coverage)).toBe(1)
    expect(extraPortionsValue(2, v.coverage)).toBe(0)
  })

  it('el exceso derivado-de-alimento también se refleja como "+n" (media porción incluida)', () => {
    // Sobre el read-model del día: prescribed 2, coverage 3,5 => "+1,5".
    const row: NutritionDayCoverageRead = {
      groupCode: 'C', groupName: 'Cereales', color: null, prescribed: 2, marcadas: 1.5, derivadas: 2, coverage: 3.5,
    }
    expect(extraPortionsValue(row.prescribed, row.coverage)).toBe(1.5)
    // prescribed 0 (grupo aparece solo por cobertura derivada de un alimento no prescrito) => todo es exceso.
    expect(extraPortionsValue(0, 1)).toBe(1)
  })
})

// ===========================================================================
// Q14 — fidelidad de conversión: caso combinado custom + LEG + media + dow-NULL
// ===========================================================================

describe('Q14 — fidelidad conversión: custom + LEG + media porción + dow-NULL replicado (in==out)', () => {
  it('emite fan-out por variante, cuenta por fuente sin doble conteo y espeja los macros del engine', () => {
    // Comida base (dow-NULL) con LEG 1,5 + SHK custom 0,5; comida de Lunes con C 2.
    const meals = [
      meal({
        id: 'mnull', name: 'Base', day_of_week: null, order_index: 0, items: [],
        exchangeTargets: [xtarget(GROUP_LEG, 1.5), xtarget(GROUP_SHK, 0.5)],
      }),
      meal({
        id: 'mmon', name: 'Lunes', day_of_week: 1, order_index: 1, items: [],
        exchangeTargets: [xtarget(GROUP_C, 2)],
      }),
    ]
    const bundle = convert(meals)

    // 2 variantes: default (mnull) + dow-1 (mnull + mmon).
    expect(bundle.variantRows.map((v) => v.variant_key)).toEqual(['default', 'dow-1'])
    // Filas EMITIDAS: default -> 2 (LEG, SHK); dow-1 -> 3 (LEG, SHK + C) = 5.
    expect(bundle.exchangeTargetRows).toHaveLength(5)
    // Conteo POR FUENTE (dedup del fan-out dow-NULL): 3 targets fuente.
    expect(bundle.fidelity.exchangeTargetCount).toBe(3)
    // porciones-in por grupo (sin doble conteo de mnull replicado).
    expect(bundle.fidelity.exchangeGroupPortions).toEqual({ LEG: 1.5, SHK: 0.5, C: 2 })
    // Custom sin confirmar y LEG sin confirmar quedan resueltos (nada unmapped).
    expect(bundle.fidelity.unmappedExchangeTargets).toEqual([])
    expect(bundle.fidelity.strategy).toBe('structured')

    // Paridad con el motor: mismos targets -> mismos macros (expansión LEG con ref frozen, medias).
    const engineMeals = meals.map((m) => ({
      targets: (m.exchangeTargets ?? []).map((t) => ({ exchangeGroupId: t.exchange_group_id, portions: t.portions })),
      dayVariantId: null,
    }))
    expect(bundle.fidelity.exchangeDerivedMacros).toEqual(dayTotals(engineMeals, ENGINE_GROUPS))

    // in==out POR COMIDA/GRUPO: las porciones emitidas en la variante default (solo mnull) por grupo
    // coinciden con las porciones-in de esa comida (LEG 1,5 + SHK 0,5); C solo aparece en dow-1.
    const defaultSlotIds = new Set(
      bundle.slotRows.filter((s) => s.day_variant_id === bundle.variantRows[0].id).map((s) => s.id as string),
    )
    const outDefault: Record<string, number> = {}
    for (const r of bundle.exchangeTargetRows) {
      if (!defaultSlotIds.has(r.meal_slot_id as string)) continue
      const code = r.snapshot_group_code as string
      outDefault[code] = (outDefault[code] ?? 0) + (r.portions as number)
    }
    expect(outDefault).toEqual({ LEG: 1.5, SHK: 0.5 })

    // Y la variante dow-1 replica mnull + agrega C: LEG 1,5 + SHK 0,5 + C 2.
    const monSlotIds = new Set(
      bundle.slotRows.filter((s) => s.day_variant_id === bundle.variantRows[1].id).map((s) => s.id as string),
    )
    const outMon: Record<string, number> = {}
    for (const r of bundle.exchangeTargetRows) {
      if (!monSlotIds.has(r.meal_slot_id as string)) continue
      const code = r.snapshot_group_code as string
      outMon[code] = (outMon[code] ?? 0) + (r.portions as number)
    }
    expect(outMon).toEqual({ LEG: 1.5, SHK: 0.5, C: 2 })
  })
})

// ===========================================================================
// Fixtures de read-model (Today / Plan) reutilizados arriba
// ===========================================================================

const CLIENT_UUID = '33333333-3333-4333-8333-333333333333'

const EMPTY_TARGETS = {
  calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null, sodiumMg: null, waterMl: null,
}
const PERMISSIONS = {
  canRegisterFreely: true, canAdjustPrescribedQuantity: true, quantityAdjustmentPercent: null,
  canSubstitute: false, canMoveMealSlot: false, canSkipOptionalItems: true,
}

function todayPayload(
  opts: {
    exchangeFoods?: unknown[]
    dayCoverage?: unknown[]
    permissionsOverride?: Partial<typeof PERMISSIONS>
    strategyPlan?: 'structured' | 'hybrid'
  } = {},
): Record<string, unknown> {
  const target = {
    id: '44444444-4444-4444-8444-444444444444',
    exchangeGroupId: '55555555-5555-4555-8555-555555555555',
    groupCode: 'C', groupName: 'Cereales', color: null, portions: 2, notes: null, orderIndex: 0,
    ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }, composedOf: null, macrosConfirmed: true,
  }
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-18T18:00:00-04:00',
    localDate: '2026-07-18',
    timezone: 'America/Santiago',
    snapshotId: null,
    plan: opts.strategyPlan
      ? {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Plan porciones',
          strategy: opts.strategyPlan,
          versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          versionNumber: 1,
          status: 'published',
          effectiveFrom: '2026-07-01',
          effectiveTo: null,
        }
      : null,
    targets: EMPTY_TARGETS,
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
    remaining: EMPTY_TARGETS,
    permissions: { ...PERMISSIONS, ...(opts.permissionsOverride ?? {}) },
    mealSlots: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        code: 'lunch', name: 'Almuerzo', startTime: null, endTime: null, mode: 'anchor',
        required: false, instructions: null, targets: {}, prescriptionItems: [], intakeItems: [],
        exchangeTargets: [target],
      },
    ],
    unassignedIntake: [],
    ...(opts.dayCoverage ? { dayCoverage: opts.dayCoverage } : {}),
    ...(opts.exchangeFoods ? { exchangeFoods: opts.exchangeFoods } : {}),
    syncToken: 'v:2026-07-18',
  }
}

/** Plan read-model con 2 targets de porciones en la primera franja (para Q10 quick-edit). */
function planReadModelWithPortions(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-18T18:00:00-04:00',
    asOfDate: '2026-07-18',
    timezone: 'America/Santiago',
    plan: {
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Plan porciones',
      strategy: 'hybrid',
      versionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      versionNumber: 1,
      status: 'published',
      effectiveFrom: '2026-07-01',
      effectiveTo: null,
    },
    visibleNotes: null,
    protocolNotes: null,
    permissions: PERMISSIONS,
    dayVariants: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        key: 'default',
        label: 'Base',
        dayOfWeek: null,
        isDefault: true,
        targets: EMPTY_TARGETS,
        mealSlots: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            code: 'lunch', name: 'Almuerzo', startTime: null, endTime: null, mode: 'anchor',
            required: false, instructions: null, targets: {}, prescriptionItems: [],
            exchangeTargets: [
              {
                id: '44444444-4444-4444-8444-444444444444',
                exchangeGroupId: '55555555-5555-4555-8555-555555555555',
                groupCode: 'C', groupName: 'Cereales', color: null, portions: 2, notes: null, orderIndex: 0,
                ref: { calories: 70, proteinG: 2, carbsG: 15, fatsG: 0 }, composedOf: null, macrosConfirmed: true,
              },
              {
                id: '77777777-7777-4777-8777-777777777777',
                exchangeGroupId: '66666666-6666-4666-8666-666666666666',
                groupCode: 'V', groupName: 'Verduras', color: null, portions: 1.5, notes: null, orderIndex: 1,
                ref: { calories: 25, proteinG: 2, carbsG: 5, fatsG: 0 }, composedOf: null, macrosConfirmed: true,
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'v:2026-07-18',
  } as NutritionPlanReadModel
}
