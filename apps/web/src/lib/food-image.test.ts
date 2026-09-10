import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  FOOD_ICON_CATEGORIES,
  foodImageUrl,
  foodCategoryIconUrl,
  foodLightboxUrl,
  foodMediaThumbnailUrlFromPath,
} from './food-image'

const BASE = 'https://proj.supabase.co'
const PUBLIC = `${BASE}/storage/v1/object/public/food-media`

describe('foodImageUrl', () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev
  })

  it('builds the public URL for an object path', () => {
    expect(foodImageUrl('off/3/012/345/front.jpg')).toBe(
      `${PUBLIC}/off/3/012/345/front.jpg`,
    )
  })

  it('strips leading slashes and trailing slash on base', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = `${BASE}/`
    expect(foodImageUrl('/coach/abc.webp')).toBe(`${PUBLIC}/coach/abc.webp`)
  })

  it('encodes each path segment but preserves slashes', () => {
    expect(foodImageUrl('coach/mi foto & co.png')).toBe(
      `${PUBLIC}/coach/mi%20foto%20%26%20co.png`,
    )
  })

  it('returns null for null/undefined/empty/whitespace', () => {
    expect(foodImageUrl(null)).toBeNull()
    expect(foodImageUrl(undefined)).toBeNull()
    expect(foodImageUrl('')).toBeNull()
    expect(foodImageUrl('   ')).toBeNull()
  })

  it('returns null when the env is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(foodImageUrl('coach/abc.webp')).toBeNull()
  })
})

describe('foodCategoryIconUrl', () => {
  it('maps every known category to its own static webp', () => {
    for (const cat of FOOD_ICON_CATEGORIES) {
      expect(foodCategoryIconUrl(cat)).toBe(`/food-icons/${cat}.webp`)
    }
  })

  it('falls back to otro for unknown/null/empty', () => {
    expect(foodCategoryIconUrl('desconocida')).toBe('/food-icons/otro.webp')
    expect(foodCategoryIconUrl(null)).toBe('/food-icons/otro.webp')
    expect(foodCategoryIconUrl(undefined)).toBe('/food-icons/otro.webp')
    expect(foodCategoryIconUrl('')).toBe('/food-icons/otro.webp')
  })

  it('covers all 10 documented categories', () => {
    expect(FOOD_ICON_CATEGORIES).toHaveLength(10)
  })
})

describe('foodLightboxUrl', () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev
  })

  it('rewrites an off/* path to the 512px variant by filename', () => {
    expect(foodLightboxUrl('off/3/012/345/front.jpg')).toBe(
      `${PUBLIC}/off/512/front.jpg`,
    )
  })

  it('handles an off/ path that is already a single file', () => {
    expect(foodLightboxUrl('off/front.jpg')).toBe(`${PUBLIC}/off/512/front.jpg`)
  })

  it('leaves non-off paths as the plain public URL', () => {
    expect(foodLightboxUrl('coach/abc.webp')).toBe(`${PUBLIC}/coach/abc.webp`)
  })

  it('returns null for null/undefined/empty', () => {
    expect(foodLightboxUrl(null)).toBeNull()
    expect(foodLightboxUrl(undefined)).toBeNull()
    expect(foodLightboxUrl('  ')).toBeNull()
  })

  it('returns null when the env is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(foodLightboxUrl('off/3/front.jpg')).toBeNull()
  })
})

describe('foodMediaThumbnailUrlFromPath (W5.6, gemelo web del helper de RN)', () => {
  const prev = process.env.NEXT_PUBLIC_SUPABASE_URL
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
  })
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev
  })

  it('arma la URL publica con el ?v= del cache-busting', () => {
    expect(
      foodMediaThumbnailUrlFromPath({ objectPath: 'off/3/012/345/front.jpg', version: 2 }),
    ).toBe(`${PUBLIC}/off/3/012/345/front.jpg?v=2`)
  })

  it('encodea segmento a segmento y preserva los separadores', () => {
    expect(foodMediaThumbnailUrlFromPath({ objectPath: 'coach/mi foto & co.png', version: 7 })).toBe(
      `${PUBLIC}/coach/mi%20foto%20%26%20co.png?v=7`,
    )
  })

  it('devuelve null sin path (alimento sin foto) y sin la env', () => {
    expect(foodMediaThumbnailUrlFromPath({ objectPath: null, version: 1 })).toBeNull()
    expect(foodMediaThumbnailUrlFromPath({ objectPath: undefined, version: 1 })).toBeNull()
    expect(foodMediaThumbnailUrlFromPath({ objectPath: '   ', version: 1 })).toBeNull()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(foodMediaThumbnailUrlFromPath({ objectPath: 'off/a.jpg', version: 1 })).toBeNull()
  })

  it('cae a ?v=0 cuando la version no viene, en vez de emitir ?v=undefined', () => {
    expect(foodMediaThumbnailUrlFromPath({ objectPath: 'off/a.jpg', version: null })).toBe(
      `${PUBLIC}/off/a.jpg?v=0`,
    )
  })

  // La PARIDAD byte a byte contra el helper de RN vive en tests/mobile-nutrition-v2-food-media.test.ts
  // (test del raiz): ahi las dos superficies se pueden importar juntas sin meter `apps/mobile` en el
  // programa de TS de la web.
})
