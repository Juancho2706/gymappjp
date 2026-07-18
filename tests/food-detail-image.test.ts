import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveFoodDetailImage, type FoodDetailData } from '@/lib/food-detail'

const BASE = 'https://proj.supabase.co'
const MEDIA = BASE + '/storage/v1/object/public/food-media'

function makeDetail(over: Partial<FoodDetailData> = {}): FoodDetailData {
  return {
    id: 'f1',
    name: 'Yogurt natural',
    brand: 'Marca',
    category: 'lacteo',
    calories: 60,
    proteinG: 3.5,
    carbsG: 5,
    fatsG: 2,
    fiberG: null,
    sodiumMg: null,
    sugarG: null,
    saturatedFatG: null,
    isLiquid: false,
    servingSize: 100,
    servingUnit: 'g',
    householdGrams: null,
    householdLabel: null,
    packageQuantity: null,
    packageUnit: null,
    barcode: null,
    countryCode: 'CL',
    source: 'open_food_facts',
    verificationStatus: 'community',
    imagePath: null,
    imageSourceUrl: null,
    ...over,
  }
}

describe('resolveFoodDetailImage', () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
  })
  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prev
  })

  it('resuelve foto de producto OFF con variante 512 para el lightbox', () => {
    const img = resolveFoodDetailImage(
      makeDetail({
        imagePath: 'off/3/012/345/front.jpg',
        category: 'snack',
        imageSourceUrl: 'https://world.openfoodfacts.org/product/x',
      }),
    )
    expect(img.hasPhoto).toBe(true)
    expect(img.headerUrl).toBe(MEDIA + '/off/3/012/345/front.jpg')
    expect(img.lightboxUrl).toBe(MEDIA + '/off/512/front.jpg')
    expect(img.fallbackUrl).toBe(img.headerUrl)
    expect(img.iconUrl).toBe('/food-icons/snack.webp')
    expect(img.sourceUrl).toBe('https://world.openfoodfacts.org/product/x')
  })

  it('sin foto: cae al icono de categoria y no expone URLs de imagen', () => {
    const img = resolveFoodDetailImage(makeDetail({ imagePath: null, category: 'proteina' }))
    expect(img.hasPhoto).toBe(false)
    expect(img.headerUrl).toBeNull()
    expect(img.lightboxUrl).toBeNull()
    expect(img.fallbackUrl).toBeNull()
    expect(img.iconUrl).toBe('/food-icons/proteina.webp')
    expect(img.sourceUrl).toBeNull()
  })

  it('categoria desconocida o nula cae al icono "otro"', () => {
    expect(resolveFoodDetailImage(makeDetail({ category: 'xyz' })).iconUrl).toBe('/food-icons/otro.webp')
    expect(resolveFoodDetailImage(makeDetail({ category: null })).iconUrl).toBe('/food-icons/otro.webp')
  })

  it('path que no es de OFF usa la misma imagen para el lightbox (sin swap 512)', () => {
    const img = resolveFoodDetailImage(makeDetail({ imagePath: 'cl/yogurt natural.webp' }))
    expect(img.headerUrl).toBe(MEDIA + '/cl/yogurt%20natural.webp')
    expect(img.lightboxUrl).toBe(MEDIA + '/cl/yogurt%20natural.webp')
  })

  it('sin base publica (env ausente) no hay foto aunque haya imagePath', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const img = resolveFoodDetailImage(makeDetail({ imagePath: 'off/3/012/345/front.jpg' }))
    expect(img.hasPhoto).toBe(false)
    expect(img.headerUrl).toBeNull()
    expect(img.lightboxUrl).toBeNull()
    // El icono de categoria siempre esta disponible (asset estatico).
    expect(img.iconUrl).toBe('/food-icons/lacteo.webp')
  })
})
