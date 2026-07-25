import { describe, expect, it } from 'vitest'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  USDA_FDC_URL,
  formatBarcode,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
} from '../apps/mobile/lib/food-detail'

// Port puro RN (4B-06) de `apps/web/src/lib/food-detail.ts:62-175`. Cada caso debe
// coincidir CARÁCTER a carácter con la web: la ficha web/PWA y la RN muestran el mismo
// texto de fuente, verificación y código de barras.

describe('mobile food-detail · fuente / atribución (4B-06)', () => {
  it('Open Food Facts: etiqueta + línea ODbL + link + requiere atribución', () => {
    expect(getFoodSourceAttribution('open_food_facts')).toEqual({
      label: 'Open Food Facts',
      attributionLine: 'Datos de productos: Open Food Facts (ODbL)',
      href: OPEN_FOOD_FACTS_URL,
      requiresAttribution: true,
    })
  })

  it('USDA: link a FoodData Central, sin obligación de atribución', () => {
    expect(getFoodSourceAttribution('usda')).toEqual({
      label: 'USDA FoodData Central',
      attributionLine: 'Fuente: USDA FoodData Central',
      href: USDA_FDC_URL,
      requiresAttribution: false,
    })
  })

  it('fuentes internas (eva / coach / team / import): sin link', () => {
    expect(getFoodSourceAttribution('eva')).toEqual({
      label: 'Catálogo EVA',
      attributionLine: 'Fuente: catálogo EVA',
      href: null,
      requiresAttribution: false,
    })
    expect(getFoodSourceAttribution('coach')).toEqual({
      label: 'Alimento del coach',
      attributionLine: 'Fuente: creado por tu coach',
      href: null,
      requiresAttribution: false,
    })
    expect(getFoodSourceAttribution('team')).toEqual({
      label: 'Alimento del equipo',
      attributionLine: 'Fuente: catálogo del equipo',
      href: null,
      requiresAttribution: false,
    })
    expect(getFoodSourceAttribution('import')).toEqual({
      label: 'Importado',
      attributionLine: 'Fuente: importación de catálogo',
      href: null,
      requiresAttribution: false,
    })
  })

  it('fuente desconocida / null / undefined caen en "Otra fuente" (nunca lanza)', () => {
    const other = {
      label: 'Otra fuente',
      attributionLine: 'Fuente: otra',
      href: null,
      requiresAttribution: false,
    }
    expect(getFoodSourceAttribution('cualquier_cosa')).toEqual(other)
    expect(getFoodSourceAttribution(null)).toEqual(other)
    expect(getFoodSourceAttribution(undefined)).toEqual(other)
  })

  it('el pie genérico ODbL usa el copy verbatim de la web', () => {
    expect(OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION).toBe(
      'Parte de los datos de productos proviene de Open Food Facts, disponible bajo licencia ODbL.',
    )
    expect(OPEN_FOOD_FACTS_URL).toBe('https://world.openfoodfacts.org')
  })
})

describe('mobile food-detail · verificación (4B-06)', () => {
  it('mapea cada estado a su etiqueta + tono', () => {
    expect(getFoodVerificationLabel('eva_verified')).toEqual({ label: 'Verificado por EVA', tone: 'verified' })
    expect(getFoodVerificationLabel('coach_verified')).toEqual({
      label: 'Verificado por tu coach',
      tone: 'verified',
    })
    expect(getFoodVerificationLabel('community')).toEqual({
      label: 'Verificado por la comunidad',
      tone: 'community',
    })
    expect(getFoodVerificationLabel('rejected')).toEqual({ label: 'Rechazado', tone: 'danger' })
  })

  it('unverified / desconocido / null caen en "Sin verificar" neutral', () => {
    const neutral = { label: 'Sin verificar', tone: 'neutral' as const }
    expect(getFoodVerificationLabel('unverified')).toEqual(neutral)
    expect(getFoodVerificationLabel('lo_que_sea')).toEqual(neutral)
    expect(getFoodVerificationLabel(null)).toEqual(neutral)
    expect(getFoodVerificationLabel(undefined)).toEqual(neutral)
  })
})

describe('mobile food-detail · formatBarcode (4B-06)', () => {
  it('agrupa dígitos de a 4 (EAN-13)', () => {
    expect(formatBarcode('7801234567890')).toBe('7801 2345 6789 0')
  })

  it('grupo exacto de 4 sin espacio final (EAN-8)', () => {
    expect(formatBarcode('78012345')).toBe('7801 2345')
  })

  it('descarta separadores no numéricos antes de agrupar', () => {
    expect(formatBarcode('7-801 234')).toBe('7801 234')
  })

  it('null / vacío / sin dígitos → guion largo', () => {
    expect(formatBarcode(null)).toBe('—')
    expect(formatBarcode(undefined)).toBe('—')
    expect(formatBarcode('')).toBe('—')
    expect(formatBarcode('abc')).toBe('—')
  })
})
