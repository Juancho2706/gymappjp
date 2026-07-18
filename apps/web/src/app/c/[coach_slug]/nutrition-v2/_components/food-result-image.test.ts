import { describe, expect, it } from 'vitest'
import type { FoodCatalogItem, FoodMediaRead } from '@eva/nutrition-v2'
import { foodResultImage, resolveFoodImageUrl } from './food-result-image'

const BASE = 'https://proj.supabase.co'

const MEDIA: FoodMediaRead = {
  id: '99999999-9999-4999-8999-999999999999',
  kind: 'product_photo',
  bucket: 'food-media',
  objectPath: 'off/3/012/345 678/front.jpg',
  version: 4,
  width: 400,
  height: 400,
  mimeType: 'image/jpeg',
  blurhash: null,
  license: 'public_domain',
  sourceUrl: null,
  attribution: null,
  updatedAt: '2026-07-15T00:00:00.000Z',
}

describe('resolveFoodImageUrl', () => {
  it('arma la URL publica codificando el path segmento a segmento y con cache-busting (?v=)', () => {
    const url = resolveFoodImageUrl(MEDIA, BASE)
    // Cada segmento se encodea (el espacio en "345 678" -> %20); el bucket tambien.
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/food-media/off/3/012/345%20678/front.jpg?v=4',
    )
  })

  it('devuelve null si no hay media', () => {
    expect(resolveFoodImageUrl(null, BASE)).toBeNull()
  })

  it('devuelve null si falta la base (NEXT_PUBLIC_SUPABASE_URL ausente)', () => {
    expect(resolveFoodImageUrl(MEDIA, null)).toBeNull()
    expect(resolveFoodImageUrl(MEDIA, undefined)).toBeNull()
  })
})

describe('foodResultImage', () => {
  const baseFood: Pick<FoodCatalogItem, 'name' | 'category' | 'media'> = {
    name: 'Arroz',
    category: 'carbohidrato',
    media: null,
  }

  it('con media: expone la foto real del producto y ademas el icono de respaldo', () => {
    const image = foodResultImage({ ...baseFood, media: MEDIA }, BASE)
    expect(image.imageUrl).toContain('/storage/v1/object/public/food-media/')
    expect(image.iconUrl).toBe('/food-icons/carbohidrato.webp')
    expect(image.alt).toBe('Arroz')
  })

  it('sin media: imageUrl null y el icono sale de la categoria del read model', () => {
    const image = foodResultImage(baseFood, BASE)
    expect(image.imageUrl).toBeNull()
    expect(image.iconUrl).toBe('/food-icons/carbohidrato.webp')
  })

  it('categoria desconocida/null cae al icono generico (nunca queda sin imagen)', () => {
    const image = foodResultImage({ name: 'X', category: null, media: null }, BASE)
    expect(image.imageUrl).toBeNull()
    expect(image.iconUrl).toBe('/food-icons/otro.webp')
  })
})
