import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FOOD_MEDIA_BUCKET,
  foodMediaBaseUrl,
  foodMediaThumbnailUrl,
  foodMediaThumbnailUrlFromPath,
} from '../apps/mobile/lib/nutrition-v2-food-media'
// El gemelo WEB se importa aca —y no al reves— porque este test vive en el raiz, que ya cruza
// `apps/mobile` con `apps/web/src` (ver tests/mobile-nutrition-v2-intake.test.ts). Importarlo desde
// el test de la web meteria `apps/mobile` en el programa de TS del typecheck web.
import { foodMediaThumbnailUrlFromPath as webFoodMediaThumbnailUrlFromPath } from '../apps/web/src/lib/food-image'

// Los helpers de este modulo se testeaban dentro de tests/mobile-nutrition-v2-parity-helpers.test.ts
// (describe «nutrition-v2-food-media thumbnails»). Este archivo NUEVO cubre solo lo que agrega W5.6
// —la URL desde el PATH suelto que emite `get_nutrition_today_v2`— sin tocar aquellos casos.

const BASE = 'https://proj.supabase.co'
const PUBLIC = `${BASE}/storage/v1/object/public/food-media`

describe('foodMediaThumbnailUrlFromPath (W5.6, sheet de equivalencias del alumno)', () => {
  it('arma la URL publica con el bucket food-media fijo y el ?v= de cache-busting', () => {
    expect(
      foodMediaThumbnailUrlFromPath({ objectPath: 'off/3/012/345/front.jpg', version: 2 }, BASE),
    ).toBe(`${PUBLIC}/off/3/012/345/front.jpg?v=2`)
  })

  it('encodea segmento a segmento y preserva los separadores', () => {
    expect(
      foodMediaThumbnailUrlFromPath({ objectPath: 'coach/mi foto & co.png', version: 7 }, BASE),
    ).toBe(`${PUBLIC}/coach/mi%20foto%20%26%20co.png?v=7`)
  })

  it('devuelve null sin base y sin path (alimento sin foto / env sin cargar)', () => {
    expect(foodMediaThumbnailUrlFromPath({ objectPath: 'x.jpg', version: 1 }, null)).toBeNull()
    expect(foodMediaThumbnailUrlFromPath({ objectPath: null, version: 1 }, BASE)).toBeNull()
    expect(foodMediaThumbnailUrlFromPath({ objectPath: undefined, version: 1 }, BASE)).toBeNull()
    expect(foodMediaThumbnailUrlFromPath({ objectPath: '', version: 1 }, BASE)).toBeNull()
    expect(foodMediaThumbnailUrlFromPath(null, BASE)).toBeNull()
    expect(foodMediaThumbnailUrlFromPath(undefined, BASE)).toBeNull()
  })

  it('cae a ?v=0 cuando la version no viene, en vez de emitir ?v=undefined', () => {
    const url = foodMediaThumbnailUrlFromPath({ objectPath: 'off/a.jpg', version: null }, BASE)
    expect(url).toBe(`${PUBLIC}/off/a.jpg?v=0`)
    expect(url).not.toContain('undefined')
  })

  it('PARIDAD byte a byte con foodMediaThumbnailUrl para el mismo media', () => {
    for (const objectPath of ['off/3/012/345/front.jpg', 'coach/mi foto & co.png', 'a/b/c/d.webp']) {
      const version = 3
      expect(foodMediaThumbnailUrlFromPath({ objectPath, version }, BASE)).toBe(
        foodMediaThumbnailUrl({ bucket: FOOD_MEDIA_BUCKET, objectPath, version }, BASE),
      )
    }
  })

  it('el bucket es el mismo literal que ya hardcodea el resto del catalogo', () => {
    expect(FOOD_MEDIA_BUCKET).toBe('food-media')
    expect(foodMediaBaseUrl(`${BASE}/`)).toBe(BASE)
  })
})

// El sheet «1 porcion equivale a» pinta la misma foto en las dos superficies, asi que la URL tiene
// que ser identica byte a byte. Si un helper drifta (otro encode, otro bucket, sin `?v=`), se cae
// aca y no en el device del alumno. Cada superficie lee SU env, por eso se setean las dos.
describe('paridad web/RN de la miniatura del sheet (W5.6)', () => {
  const prevNext = process.env.NEXT_PUBLIC_SUPABASE_URL
  const prevExpo = process.env.EXPO_PUBLIC_SUPABASE_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE
    process.env.EXPO_PUBLIC_SUPABASE_URL = BASE
  })

  afterEach(() => {
    if (prevNext === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevNext
    if (prevExpo === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL
    else process.env.EXPO_PUBLIC_SUPABASE_URL = prevExpo
  })

  it('PARIDAD byte a byte: el helper web y foodMediaThumbnailUrl de RN dan la MISMA URL', () => {
    for (const objectPath of ['off/3/012/345/front.jpg', 'coach/mi foto & co.png', 'a/b/c/d.webp']) {
      const version = 3
      expect(webFoodMediaThumbnailUrlFromPath({ objectPath, version })).toBe(
        foodMediaThumbnailUrl({ bucket: FOOD_MEDIA_BUCKET, objectPath, version }),
      )
    }
  })

  it('PARIDAD tambien en los bordes: sin path y sin version', () => {
    expect(webFoodMediaThumbnailUrlFromPath({ objectPath: null, version: 1 })).toBe(
      foodMediaThumbnailUrlFromPath({ objectPath: null, version: 1 }),
    )
    expect(webFoodMediaThumbnailUrlFromPath({ objectPath: 'off/a.jpg', version: null })).toBe(
      foodMediaThumbnailUrlFromPath({ objectPath: 'off/a.jpg', version: null }),
    )
  })
})
