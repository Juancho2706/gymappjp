import { describe, it, expect } from 'vitest'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  foodCatalogItemToCardModel,
  foodCatalogItemToDetail,
  resolveFoodMediaUrl,
} from './food-catalog-card'

const BASE = 'https://proj.supabase.co'

function makeItem(overrides: Partial<FoodCatalogItem> = {}): FoodCatalogItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    catalogKey: 'cl-yogurt',
    gtin: '7801234567894',
    name: 'Yogurt natural',
    brand: 'Soprole',
    category: 'lacteo',
    countryCode: 'CL',
    servingSize: 100,
    servingUnit: 'g',
    calories: 61,
    proteinG: 3.5,
    carbsG: 4.7,
    fatsG: 3.3,
    fiberG: 0,
    sodiumMg: 46,
    sugarG: 4.7,
    saturatedFatG: 2.1,
    packageQuantity: 500,
    packageUnit: 'ml',
    source: 'open_food_facts',
    sourceRef: 'off:7801234567894',
    verificationStatus: 'community',
    media: {
      id: '22222222-2222-4222-8222-222222222222',
      kind: 'product_photo',
      bucket: 'food-media',
      objectPath: 'cl/yogurt natural.webp',
      version: 3,
      width: 200,
      height: 200,
      mimeType: 'image/webp',
      blurhash: null,
      license: 'cc_by_sa',
      sourceUrl: null,
      attribution: null,
      updatedAt: '2026-07-14T00:00:00.000Z',
    },
    ...overrides,
  }
}

describe('resolveFoodMediaUrl', () => {
  it('builds a public URL with encoded path and version', () => {
    const item = makeItem()
    expect(resolveFoodMediaUrl(item.media, BASE)).toBe(
      'https://proj.supabase.co/storage/v1/object/public/food-media/cl/yogurt%20natural.webp?v=3',
    )
  })

  it('strips a trailing slash from the base', () => {
    expect(resolveFoodMediaUrl(makeItem().media, 'https://proj.supabase.co/')).toContain(
      'https://proj.supabase.co/storage/v1/object/public/',
    )
  })

  it('returns null when there is no media', () => {
    expect(resolveFoodMediaUrl(null, BASE)).toBeNull()
  })

  it('returns null when the base is missing', () => {
    expect(resolveFoodMediaUrl(makeItem().media, null)).toBeNull()
  })
})

describe('foodCatalogItemToCardModel', () => {
  it('maps names, brand, envase and compact macros', () => {
    const card = foodCatalogItemToCardModel(makeItem(), BASE)
    expect(card.name).toBe('Yogurt natural')
    expect(card.brand).toBe('Soprole')
    expect(card.packageLabel).toBe('500 ml')
    expect(card.calories).toBe('61')
    expect(card.proteinG).toBe('3.5')
    expect(card.carbsG).toBe('4.7')
    expect(card.fatsG).toBe('3.3')
    expect(card.basisLabel).toBe('por 100 g')
  })

  it('derives the source label and verification badge tone', () => {
    const card = foodCatalogItemToCardModel(makeItem(), BASE)
    expect(card.sourceLabel).toBe('Open Food Facts')
    expect(card.verificationLabel).toBe('Verificado por la comunidad')
    expect(card.verificationTone).toBe('community')
  })

  it('formats integer macros without decimals', () => {
    const card = foodCatalogItemToCardModel(
      makeItem({ calories: 100, proteinG: 20, carbsG: 0, fatsG: 5 }),
      BASE,
    )
    expect(card.calories).toBe('100')
    expect(card.proteinG).toBe('20')
    expect(card.carbsG).toBe('0')
    expect(card.fatsG).toBe('5')
  })

  it('uses a 100 ml basis for liquids and null envase when unset', () => {
    const card = foodCatalogItemToCardModel(
      makeItem({ servingUnit: 'ml', packageQuantity: null, packageUnit: null }),
      BASE,
    )
    expect(card.basisLabel).toBe('por 100 ml')
    expect(card.packageLabel).toBeNull()
  })

  it('resolves a null thumbnail when there is no media', () => {
    const card = foodCatalogItemToCardModel(makeItem({ media: null }), BASE)
    expect(card.thumbnailUrl).toBeNull()
  })

  it('exposes a category icon fallback for the known category', () => {
    const card = foodCatalogItemToCardModel(makeItem({ category: 'lacteo' }), BASE)
    expect(card.categoryIconUrl).toBe('/food-icons/lacteo.webp')
  })

  it('falls back to the generic icon for an unknown category', () => {
    const card = foodCatalogItemToCardModel(makeItem({ category: 'no-existe' }), BASE)
    expect(card.categoryIconUrl).toBe('/food-icons/otro.webp')
  })
})

describe('foodCatalogItemToDetail', () => {
  it('maps gtin to barcode and preserves macros/micros', () => {
    const detail = foodCatalogItemToDetail(makeItem())
    expect(detail.barcode).toBe('7801234567894')
    expect(detail.proteinG).toBe(3.5)
    expect(detail.sodiumMg).toBe(46)
    expect(detail.saturatedFatG).toBe(2.1)
    expect(detail.source).toBe('open_food_facts')
    expect(detail.verificationStatus).toBe('community')
  })

  it('maps media objectPath/sourceUrl to imagePath/imageSourceUrl', () => {
    const detail = foodCatalogItemToDetail(makeItem())
    expect(detail.imagePath).toBe('cl/yogurt natural.webp')
    expect(detail.imageSourceUrl).toBeNull()
    const withSource = foodCatalogItemToDetail(
      makeItem({ media: { ...makeItem().media!, sourceUrl: 'https://world.openfoodfacts.org/product/x' } }),
    )
    expect(withSource.imageSourceUrl).toBe('https://world.openfoodfacts.org/product/x')
  })

  it('nulls image fields when there is no media', () => {
    const detail = foodCatalogItemToDetail(makeItem({ media: null }))
    expect(detail.imagePath).toBeNull()
    expect(detail.imageSourceUrl).toBeNull()
  })

  it('derives isLiquid from the serving unit and nulls household fields', () => {
    expect(foodCatalogItemToDetail(makeItem({ servingUnit: 'ml' })).isLiquid).toBe(true)
    const detail = foodCatalogItemToDetail(makeItem({ servingUnit: 'g' }))
    expect(detail.isLiquid).toBe(false)
    expect(detail.householdGrams).toBeNull()
    expect(detail.householdLabel).toBeNull()
  })
})
