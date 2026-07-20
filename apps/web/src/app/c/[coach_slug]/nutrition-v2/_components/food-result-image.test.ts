import { describe, expect, it } from 'vitest'
import type { FoodCatalogItem, FoodMediaRead } from '@eva/nutrition-v2'
import { foodResultImage, resolveFoodImageUrl } from './food-result-image'
import { foodCategoryIconUrl, foodCategoryIconUrlFromName } from '@/lib/food-image'

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

// Fila del alumno (plan / consumo del dia): la miniatura la resuelven el caller
// (`imageUrl = resolveFoodImageUrl(item.media ?? null, base)`) y `NutritionFoodRow`
// (`iconUrl = category ? foodCategoryIconUrl(category) : foodCategoryIconUrlFromName(name)`).
// `media` y `category` son aditivos/opcionales en el read model del dia/plan: los tests
// cubren las tres ramas tolerando que aun no lleguen (deploy web antes o despues de la
// migracion SQL). `rowThumb` es el ESPEJO exacto de esas dos lineas de produccion.
describe('miniatura de la fila del alumno desde el read model del dia/plan', () => {
  const rowThumb = (item: { name: string; media?: FoodMediaRead | null; category?: string | null }) => ({
    imageUrl: resolveFoodImageUrl(item.media ?? null, BASE),
    iconUrl: item.category ? foodCategoryIconUrl(item.category) : foodCategoryIconUrlFromName(item.name),
  })

  it('item CON media: pinta la ilustracion real del producto (paridad con el coach)', () => {
    const thumb = rowThumb({ name: 'Pepino pelado crudo', media: MEDIA, category: 'verdura' })
    expect(thumb.imageUrl).toBe(
      'https://proj.supabase.co/storage/v1/object/public/food-media/off/3/012/345%20678/front.jpg?v=4',
    )
  })

  it('item SIN media pero CON category: cae al icono de esa categoria (no al del nombre)', () => {
    // Pepino con category='verdura' ya NO cae a "otro": la categoria del catalogo manda.
    const thumb = rowThumb({ name: 'Pepino pelado crudo', media: null, category: 'verdura' })
    expect(thumb.imageUrl).toBeNull()
    expect(thumb.iconUrl).toBe('/food-icons/verdura.webp')
  })

  it('item SIN media ni category: respaldo derivado del nombre (comportamiento actual)', () => {
    // "pollo" ⇒ proteina; un nombre sin keyword ("Pepino…") ⇒ "otro" (el generico reportado).
    expect(rowThumb({ name: 'Cubitos de pollo' }).iconUrl).toBe('/food-icons/proteina.webp')
    const generic = rowThumb({ name: 'Pepino pelado crudo' })
    expect(generic.imageUrl).toBeNull()
    expect(generic.iconUrl).toBe('/food-icons/otro.webp')
  })
})
