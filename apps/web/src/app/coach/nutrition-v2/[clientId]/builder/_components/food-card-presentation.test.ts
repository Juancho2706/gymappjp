import { describe, it, expect } from 'vitest'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import {
  foodCategoryFromName,
  foodCategoryIconUrlFromName,
  resolveFoodImageUrl,
  foodCardImage,
} from './food-card-presentation'

const BASE = 'https://proj.supabase.co'

function makeMedia(overrides: Partial<NonNullable<FoodCatalogItem['media']>> = {}): NonNullable<FoodCatalogItem['media']> {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'product_photo',
    bucket: 'food-media',
    objectPath: 'cl/yogurt natural.webp',
    version: 3,
    width: 200,
    height: 200,
    mimeType: 'image/webp',
    blurhash: null,
    license: 'public_domain',
    sourceUrl: null,
    attribution: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('foodCategoryFromName', () => {
  it('maps null / empty / unknown to "otro"', () => {
    expect(foodCategoryFromName(null)).toBe('otro')
    expect(foodCategoryFromName(undefined)).toBe('otro')
    expect(foodCategoryFromName('   ')).toBe('otro')
    expect(foodCategoryFromName('cosa rara sin match')).toBe('otro')
  })

  it('is accent- and case-insensitive', () => {
    expect(foodCategoryFromName('Lácteo entero')).toBe('lacteo')
    expect(foodCategoryFromName('PLÁTANO')).toBe('fruta')
  })

  it('classifies common Spanish and English food names into the canonical enum', () => {
    expect(foodCategoryFromName('Yogurt natural')).toBe('lacteo')
    expect(foodCategoryFromName('Pollo a la plancha')).toBe('proteina')
    expect(foodCategoryFromName('Chicken breast')).toBe('proteina')
    expect(foodCategoryFromName('Arroz blanco')).toBe('carbohidrato')
    expect(foodCategoryFromName('Manzana')).toBe('fruta')
    expect(foodCategoryFromName('Verduras mixtas')).toBe('verdura')
    expect(foodCategoryFromName('Lentejas')).toBe('legumbre')
    expect(foodCategoryFromName('Aceite de oliva')).toBe('grasa')
    expect(foodCategoryFromName('Almendras')).toBe('grasa')
    expect(foodCategoryFromName('Bebida gaseosa')).toBe('bebida')
    expect(foodCategoryFromName('Galletas dulces')).toBe('snack')
    expect(foodCategoryFromName('Whey protein')).toBe('proteina')
  })

  it('prefers the more specific bucket by keyword order', () => {
    // "leche de almendras" -> lacteo (leche) gana sobre grasa (almendra)
    expect(foodCategoryFromName('Leche de almendras')).toBe('lacteo')
  })
})

describe('foodCategoryIconUrlFromName', () => {
  it('returns the static webp path for the resolved category', () => {
    expect(foodCategoryIconUrlFromName('Pollo')).toBe('/food-icons/proteina.webp')
    expect(foodCategoryIconUrlFromName('cosa sin match')).toBe('/food-icons/otro.webp')
    expect(foodCategoryIconUrlFromName(null)).toBe('/food-icons/otro.webp')
  })
})

describe('resolveFoodImageUrl', () => {
  it('returns null when there is no media', () => {
    expect(resolveFoodImageUrl(null, BASE)).toBeNull()
  })

  it('returns null when the base url is missing', () => {
    expect(resolveFoodImageUrl(makeMedia(), null)).toBeNull()
    expect(resolveFoodImageUrl(makeMedia(), '')).toBeNull()
  })

  it('builds a public url, encoding each path segment and cache-busting by version', () => {
    const url = resolveFoodImageUrl(makeMedia(), BASE)
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/food-media/cl/yogurt%20natural.webp?v=3',
    )
  })

  it('trims a trailing slash from the base', () => {
    const url = resolveFoodImageUrl(makeMedia(), BASE + '/')
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/food-media/cl/yogurt%20natural.webp?v=3',
    )
  })
})

describe('foodCardImage', () => {
  it('prefers the product photo when media exists and resolves the category icon', () => {
    const view = foodCardImage(
      { name: 'Yogurt natural', category: 'lacteo', media: makeMedia() },
      BASE,
    )
    expect(view.imageUrl).toContain('/food-media/cl/yogurt%20natural.webp')
    expect(view.iconUrl).toBe('/food-icons/lacteo.webp')
    expect(view.alt).toBe('Yogurt natural')
  })

  it('falls back to a category icon (never empty) when there is no photo', () => {
    const view = foodCardImage(
      { name: 'Pechuga de pollo', category: 'proteina', media: null },
      BASE,
    )
    expect(view.imageUrl).toBeNull()
    expect(view.iconUrl).toBe('/food-icons/proteina.webp')
  })

  it('still yields the generic icon when both photo and category are absent', () => {
    const view = foodCardImage({ name: 'Alimento libre', category: null, media: null }, BASE)
    expect(view.imageUrl).toBeNull()
    expect(view.iconUrl).toBe('/food-icons/otro.webp')
  })
})
