import { describe, it, expect } from 'vitest'
import {
  FoodCatalogItemSchema,
  type CoachFoodOverrideValues,
  type FoodCatalogItem,
} from '@eva/nutrition-v2'
import {
  foodRowToCatalogItem,
  filterCoachEditedFoods,
  isCoachEditedFood,
  matchesFoodQuery,
  type CatalogFoodRow,
} from './edited-foods'

function makeRow(overrides: Partial<CatalogFoodRow> = {}): CatalogFoodRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    catalog_key: 'cl-yogurt',
    barcode: '7801234567894',
    name: 'Yogurt natural',
    brand: 'Soprole',
    category: 'lacteo',
    country_code: 'CL',
    serving_size: 100,
    serving_unit: 'g',
    calories: 61,
    protein_g: 3.5,
    carbs_g: 4.7,
    fats_g: 3.3,
    fiber_g: 0,
    macros_basis: 'per_100',
    household_label: null,
    household_grams: null,
    sodium_mg: 46,
    sugar_g: 4.7,
    saturated_fat_g: 2.1,
    package_quantity: 500,
    package_unit: 'ml',
    catalog_source: 'open_food_facts',
    source_ref: 'off:7801234567894',
    verification_status: 'community',
    coach_id: null,
    org_id: null,
    ...overrides,
  }
}

function makeOverride(overrides: Partial<CoachFoodOverrideValues> = {}): CoachFoodOverrideValues {
  return {
    calories: 80,
    proteinG: 9,
    carbsG: 5,
    fatsG: 2,
    fiberG: 1,
    macrosBasis: 'per_100',
    householdLabel: null,
    householdGrams: null,
    ...overrides,
  }
}

/** Item del catalogo tal como lo emite la RPC de busqueda (para el predicado del filtro). */
function makeItem(overrides: Partial<FoodCatalogItem> = {}): FoodCatalogItem {
  return { ...foodRowToCatalogItem(makeRow(), makeOverride()), ...overrides }
}

describe('foodRowToCatalogItem', () => {
  it('produce un item que cumple el contrato del catalogo', () => {
    const item = foodRowToCatalogItem(makeRow(), makeOverride())
    expect(FoodCatalogItemSchema.safeParse(item).success).toBe(true)
  })

  it('traduce identidad y presentacion con los nombres del read model', () => {
    const item = foodRowToCatalogItem(makeRow(), makeOverride())
    expect(item.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(item.catalogKey).toBe('cl-yogurt')
    // `barcode` de la tabla viaja como `gtin` en el contrato, igual que en el JSON de la RPC.
    expect(item.gtin).toBe('7801234567894')
    expect(item.name).toBe('Yogurt natural')
    expect(item.brand).toBe('Soprole')
    expect(item.countryCode).toBe('CL')
    expect(item.packageQuantity).toBe(500)
    expect(item.packageUnit).toBe('ml')
    expect(item.source).toBe('open_food_facts')
    expect(item.sourceRef).toBe('off:7801234567894')
    expect(item.verificationStatus).toBe('community')
  })

  it('reemplaza los CINCO macros con los del override y conserva los originales', () => {
    const item = foodRowToCatalogItem(makeRow(), makeOverride())
    expect(item.calories).toBe(80)
    expect(item.proteinG).toBe(9)
    expect(item.carbsG).toBe(5)
    expect(item.fatsG).toBe(2)
    expect(item.fiberG).toBe(1)
    expect(item.hasOverride).toBe(true)
    expect(item.original).toEqual({
      calories: 61,
      proteinG: 3.5,
      carbsG: 4.7,
      fatsG: 3.3,
      fiberG: 0,
    })
  })

  it('toma la base de macros del override, no la del catalogo', () => {
    const item = foodRowToCatalogItem(
      makeRow({ macros_basis: 'per_100' }),
      makeOverride({ macrosBasis: 'per_serving' }),
    )
    expect(item.macrosBasis).toBe('per_serving')
  })

  it('reporta base nula cuando la fila trae un valor fuera del vocabulario', () => {
    // La base la manda el override; el punto es que el mapper no invente `per_100` desde la fila.
    const item = foodRowToCatalogItem(makeRow({ macros_basis: 'basura' }), makeOverride())
    expect(item.macrosBasis).toBe('per_100')
    const sinOverrideBasis = foodRowToCatalogItem(
      makeRow({ macros_basis: null }),
      makeOverride({ macrosBasis: 'per_serving' }),
    )
    expect(sinOverrideBasis.macrosBasis).toBe('per_serving')
  })

  it('conserva la medida casera del catalogo cuando el override no trae una', () => {
    const item = foodRowToCatalogItem(
      makeRow({ household_label: '1 taza', household_grams: 240 }),
      makeOverride(),
    )
    expect(item.householdLabel).toBe('1 taza')
    expect(item.householdGrams).toBe(240)
  })

  it('la medida casera del override gana como PAR, sin mezclar fuentes', () => {
    const item = foodRowToCatalogItem(
      makeRow({ household_label: '1 taza', household_grams: 240 }),
      makeOverride({ householdLabel: '1 pote', householdGrams: 125 }),
    )
    expect(item.householdLabel).toBe('1 pote')
    expect(item.householdGrams).toBe(125)
  })

  it('cae a gramos cuando la fila no declara unidad y deja media en null', () => {
    const item = foodRowToCatalogItem(makeRow({ serving_unit: null }), makeOverride())
    expect(item.servingUnit).toBe('g')
    // La foto exigiria un tercer round-trip a food_media: la card usa el icono de categoria.
    expect(item.media).toBeNull()
  })

  it('preserva la fibra nula del catalogo como original (null no es cero)', () => {
    const item = foodRowToCatalogItem(makeRow({ fiber_g: null }), makeOverride())
    expect(item.original?.fiberG).toBeNull()
    expect(item.fiberG).toBe(1)
  })

  // T2.3 F4.5: el browse lista alimentos que el coach nunca corrigio. Sin override el item tiene
  // que quedar identico al que emite la RPC para esa misma fila — si no, el mismo alimento
  // mostraria numeros distintos segun si el coach llego navegando o buscando.
  it('sin override devuelve los macros del catalogo, sin marcar correccion', () => {
    const item = foodRowToCatalogItem(makeRow(), null)
    expect(FoodCatalogItemSchema.safeParse(item).success).toBe(true)
    expect(item.calories).toBe(61)
    expect(item.proteinG).toBe(3.5)
    expect(item.carbsG).toBe(4.7)
    expect(item.fatsG).toBe(3.3)
    expect(item.fiberG).toBe(0)
    expect(item.macrosBasis).toBe('per_100')
    expect(item.hasOverride).toBe(false)
    expect(item.original).toBeNull()
  })

  it('sin override conserva la medida casera del catalogo', () => {
    const item = foodRowToCatalogItem(
      makeRow({ household_label: '1 taza', household_grams: 240 }),
      null,
    )
    expect(item.householdLabel).toBe('1 taza')
    expect(item.householdGrams).toBe(240)
  })

  it('sin override reporta base nula cuando la fila trae un valor fuera del vocabulario', () => {
    // Aca si importa el guard del mapper: no hay override que aporte la base, y `per_100` no se
    // inventa (la card imprimiria "por 100 g" sobre macros que podrian ser de la porcion).
    const item = foodRowToCatalogItem(makeRow({ macros_basis: 'basura' }), null)
    expect(item.macrosBasis).toBeNull()
  })

  it('marca la identidad del dueño tal cual viene de la fila', () => {
    const propio = foodRowToCatalogItem(
      makeRow({ coach_id: '22222222-2222-4222-8222-222222222222' }),
      null,
    )
    expect(propio.coachId).toBe('22222222-2222-4222-8222-222222222222')
    expect(foodRowToCatalogItem(makeRow(), null).coachId).toBeNull()
  })
})

describe('isCoachEditedFood / filterCoachEditedFoods', () => {
  it('deja pasar solo los alimentos con override del coach activo', () => {
    const catalogo = [
      makeItem({ id: 'a', hasOverride: true }),
      makeItem({ id: 'b', hasOverride: false }),
      makeItem({ id: 'c', hasOverride: null }),
      makeItem({ id: 'd', hasOverride: undefined }),
      makeItem({ id: 'e', hasOverride: true }),
    ]
    expect(filterCoachEditedFoods(catalogo).map((item) => item.id)).toEqual(['a', 'e'])
  })

  it('trata ausente/nulo como "sin merge aplicado", nunca como override', () => {
    // `hasOverride` es nullable en el contrato: una build vieja o un actor sin coach emiten el
    // item sin la clave. Eso NO significa que el coach lo haya corregido.
    expect(isCoachEditedFood({ hasOverride: undefined })).toBe(false)
    expect(isCoachEditedFood({ hasOverride: null })).toBe(false)
    expect(isCoachEditedFood({ hasOverride: false })).toBe(false)
    expect(isCoachEditedFood({ hasOverride: true })).toBe(true)
  })

  it('devuelve lista vacia sin alimentos', () => {
    expect(filterCoachEditedFoods([])).toEqual([])
  })
})

describe('matchesFoodQuery', () => {
  const item = { name: 'Plátano maduro', brand: 'Del Monte' }

  it('sin consulta no filtra nada', () => {
    expect(matchesFoodQuery(item, '')).toBe(true)
    expect(matchesFoodQuery(item, '   ')).toBe(true)
  })

  it('ignora acentos y mayusculas en los dos sentidos', () => {
    expect(matchesFoodQuery(item, 'platano')).toBe(true)
    expect(matchesFoodQuery(item, 'PLÁTANO')).toBe(true)
    expect(matchesFoodQuery({ name: 'Platano', brand: null }, 'plátano')).toBe(true)
  })

  it('busca tambien por marca y respeta las coincidencias parciales', () => {
    expect(matchesFoodQuery(item, 'monte')).toBe(true)
    expect(matchesFoodQuery(item, 'maduro')).toBe(true)
    expect(matchesFoodQuery(item, 'kiwi')).toBe(false)
  })

  it('no revienta con marca nula', () => {
    expect(matchesFoodQuery({ name: 'Arroz', brand: null }, 'monte')).toBe(false)
  })
})
