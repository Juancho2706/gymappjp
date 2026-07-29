// Helpers PUROS del registro libre del alumno RN (apps/mobile/lib/nutrition-v2-add-food.logic.ts):
//  - `resolveCatalogSearchState` (NUT-020): el fallo del catálogo NO puede presentarse como
//    "Sin resultados en el catálogo local" — el alumno concluye que EVA no tiene el alimento.
//  - `unitOptionsFor` (NUT-017): unidades CANÓNICAS (g|ml según magnitud + un), paritarias con
//    el scanner y con la web. Antes eran `[servingUnit,'g','ml','porción','unidad']` y dejar 100
//    en el campo con unidad `unidad` persistía 100 × macros.
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

describe('NUT-017 — unidades ofrecidas', () => {
  it('son canónicas y no incluyen "unidad" libre ni "porción"', () => {
    expect(addFood.unitOptionsFor({ servingUnit: 'g' })).toEqual(['g', 'un'])
    expect(addFood.unitOptionsFor({ servingUnit: 'ml' })).toEqual(['ml', 'un'])
    expect(addFood.unitOptionsFor({ servingUnit: 'taza' })).toEqual(['g', 'un'])
  })

  it('el buscador y el scanner ofrecen EXACTAMENTE lo mismo (paridad de superficies)', () => {
    for (const servingUnit of ['g', 'ml', 'un', 'taza']) {
      expect(scanner.scannedFoodUnitOptions({ servingUnit })).toEqual(addFood.unitOptionsFor({ servingUnit }))
    }
  })
})
