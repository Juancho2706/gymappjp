// Helpers PUROS del registro libre del alumno RN (apps/mobile/lib/nutrition-v2-add-food.logic.ts):
//  - `resolveCatalogSearchState` (NUT-020): el fallo del catálogo NO puede presentarse como
//    "Sin resultados en el catálogo local" — el alumno concluye que EVA no tiene el alimento.
//  - `unitOptionsFor` (NUT-017 → W2.1): unidades del ALIMENTO (magnitud + medida casera rotulada
//    + `un` solo si es contable), paritarias con el scanner y con la web. Antes eran
//    `[servingUnit,'g','ml','porción','unidad']` y dejar 100 en el campo persistía 100 × macros.
//  - `catalogIntakeDefaults` / `catalogIntakeSubmission` (SPEC §5.3): la medida casera es
//    interfaz; lo que se persiste son gramos.
//
// Gotcha de resolución (mismo de mobile-nutrition-v2-portions.test.ts): el módulo arrastra
// `nutrition-v2-portions` → `@react-native-async-storage/async-storage`, que no resuelve desde la
// raíz (shamefully-hoist=false). Se mockea por PATH ABSOLUTO con `vi.doMock` + import() dinámico.
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')

function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    multiRemove: vi.fn(async () => undefined),
    getAllKeys: vi.fn(async () => [] as string[]),
  },
}))
vi.doMock(resolveMobileDep('@react-native-community/netinfo'), () => ({
  default: { fetch: vi.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}))

class MockApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
vi.mock('../apps/mobile/lib/api', () => ({ ApiError: MockApiError }))
vi.mock('../apps/mobile/lib/nutrition-v2.api', () => ({
  recordNutritionIntakeV2: vi.fn(),
  correctNutritionIntakeV2: vi.fn(),
}))

const addFood = await import('../apps/mobile/lib/nutrition-v2-add-food.logic')
const scanner = await import('../apps/mobile/lib/nutrition-v2-scanner.logic')

describe('NUT-020 — estado del buscador del catálogo', () => {
  it('término corto ⇒ hint (aunque haya un error viejo colgando)', () => {
    expect(
      addFood.resolveCatalogSearchState({ termLength: 1, searching: false, error: true, resultCount: 0 }),
    ).toBe('hint')
  })

  it('buscando gana sobre el error anterior (un reintento en vuelo no muestra el fallo viejo)', () => {
    expect(
      addFood.resolveCatalogSearchState({ termLength: 5, searching: true, error: true, resultCount: 0 }),
    ).toBe('searching')
  })

  it('error del fetch ⇒ estado propio, NUNCA "empty"', () => {
    expect(
      addFood.resolveCatalogSearchState({ termLength: 5, searching: false, error: true, resultCount: 0 }),
    ).toBe('error')
  })

  it('sin error y sin resultados ⇒ empty; con resultados ⇒ results', () => {
    expect(
      addFood.resolveCatalogSearchState({ termLength: 5, searching: false, error: false, resultCount: 0 }),
    ).toBe('empty')
    expect(
      addFood.resolveCatalogSearchState({ termLength: 5, searching: false, error: false, resultCount: 3 }),
    ).toBe('results')
  })
})

/**
 * W2.1 «Cantidades honestas» (SPEC §5.2): las unidades salen del ALIMENTO, no del vocabulario.
 * `un` solo si es realmente contable — antes se ofrecía a todo el catálogo y «1 un» era una
 * porción de 100 g que nadie decía (el caso Jean de 5.637 kcal).
 */
describe('W2.1 — unidades ofrecidas por alimento', () => {
  const HUEVO = { servingUnit: 'g', servingSize: 100, householdGrams: 61, householdLabel: 'huevo' }

  it('un alimento de 100 g sin medida casera solo ofrece su magnitud (ya NO ofrece `un`)', () => {
    expect(addFood.unitOptionsFor({ servingUnit: 'g', servingSize: 100 }).map((o) => o.code)).toEqual(['g'])
    expect(addFood.unitOptionsFor({ servingUnit: 'ml', servingSize: 100 }).map((o) => o.code)).toEqual(['ml'])
    expect(addFood.unitOptionsFor({ servingUnit: 'taza', servingSize: 100 }).map((o) => o.code)).toEqual(['g'])
  })

  it('con medida casera la ofrece rotulada con sus gramos («huevo · 61 g»)', () => {
    expect(addFood.unitOptionsFor(HUEVO)).toEqual([
      { code: 'g', label: 'g', grams: null },
      { code: 'casera', label: 'huevo · 61 g', grams: 61 },
    ])
  })

  it('conserva la unidad VIGENTE aunque el alimento ya no la ofrezca (no deja al alumno atrapado)', () => {
    expect(addFood.unitOptionsFor(HUEVO, 'un').map((o) => o.code)).toEqual(['g', 'casera', 'un'])
  })

  it('el buscador y el scanner ofrecen EXACTAMENTE lo mismo (paridad de superficies)', () => {
    for (const servingUnit of ['g', 'ml', 'un', 'taza']) {
      const food = { servingUnit, servingSize: 60, householdGrams: 61, householdLabel: 'huevo' }
      expect(scanner.scannedFoodUnitOptions(food)).toEqual(addFood.unitOptionsFor(food))
    }
  })
})

describe('W2.1 — cantidad y unidad iniciales', () => {
  it('con medida casera arranca en «1 medida», NUNCA en la porción del catálogo', () => {
    // Precargar `servingSize` con unidad casera diría «100 huevos» apenas se elige el alimento.
    expect(
      addFood.catalogIntakeDefaults({ servingUnit: 'g', servingSize: 100, householdGrams: 61, householdLabel: 'huevo' }),
    ).toEqual({ quantity: 1, unit: 'casera' })
  })

  it('en un alimento contable nativo sin medida arranca en 1 un (no en los gramos de la porción)', () => {
    expect(addFood.catalogIntakeDefaults({ servingUnit: 'un', servingSize: 58 })).toEqual({ quantity: 1, unit: 'un' })
  })

  it('sin medida casera ni unidad contable, la porción del catálogo sí es honesta', () => {
    expect(addFood.catalogIntakeDefaults({ servingUnit: 'g', servingSize: 100 })).toEqual({ quantity: 100, unit: 'g' })
  })
})

/**
 * SPEC §5.3 / AUDIT W2.0 c3-c4: `casera` jamás se persiste. Al enviar se traduce a gramos con la
 * magnitud real del alimento; el contrato de intake (`NutritionIntakeUnitSchema`) no cambia (c6).
 */
describe('W2.1 — traducción de la medida casera a gramos al enviar', () => {
  it('«2 huevos» se persisten como 122 g', () => {
    expect(
      addFood.catalogIntakeSubmission({
        food: { servingUnit: 'g', servingSize: 100, householdGrams: 61, householdLabel: 'huevo' },
        quantity: 2,
        unit: 'casera',
      }),
    ).toEqual({ quantity: 122, unit: 'g' })
  })

  it('un líquido persiste en ml (la magnitud sale del alimento, no de la etiqueta)', () => {
    expect(
      addFood.catalogIntakeSubmission({
        food: { servingUnit: 'ml', servingSize: 200, householdGrams: 240, householdLabel: 'taza' },
        quantity: 0.5,
        unit: 'casera',
      }),
    ).toEqual({ quantity: 120, unit: 'ml' })
  })

  it('sin gramaje casero devuelve null (no hay nada honesto que persistir)', () => {
    expect(
      addFood.catalogIntakeSubmission({ food: { servingUnit: 'g', servingSize: 100 }, quantity: 2, unit: 'casera' }),
    ).toBeNull()
  })

  it('cualquier otra unidad pasa TAL CUAL (g, ml y `un` no se tocan: los 233 ítems «un» siguen igual)', () => {
    const food = { servingUnit: 'un', servingSize: 58, householdGrams: 61, householdLabel: 'huevo' }
    expect(addFood.catalogIntakeSubmission({ food, quantity: 3, unit: 'un' })).toEqual({ quantity: 3, unit: 'un' })
    expect(addFood.catalogIntakeSubmission({ food, quantity: 150, unit: 'g' })).toEqual({ quantity: 150, unit: 'g' })
  })
})
