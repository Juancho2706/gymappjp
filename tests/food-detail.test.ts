import { describe, expect, it } from 'vitest'
import {
  formatBarcode,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  OPEN_FOOD_FACTS_URL,
  USDA_FDC_URL,
} from '@/lib/food-detail'

describe('getFoodSourceAttribution', () => {
  it('mapea open_food_facts a la atribución ODbL obligatoria con link', () => {
    const a = getFoodSourceAttribution('open_food_facts')
    expect(a.label).toBe('Open Food Facts')
    expect(a.attributionLine).toBe('Datos de productos: Open Food Facts (ODbL)')
    expect(a.href).toBe(OPEN_FOOD_FACTS_URL)
    expect(a.requiresAttribution).toBe(true)
  })

  it('mapea usda a USDA FoodData Central sin obligación de licencia', () => {
    const a = getFoodSourceAttribution('usda')
    expect(a.label).toBe('USDA FoodData Central')
    expect(a.attributionLine).toBe('Fuente: USDA FoodData Central')
    expect(a.href).toBe(USDA_FDC_URL)
    expect(a.requiresAttribution).toBe(false)
  })

  it.each([
    ['eva', 'Catálogo EVA'],
    ['coach', 'Alimento del coach'],
    ['team', 'Alimento del equipo'],
    ['import', 'Importado'],
  ])('mapea la fuente interna %s sin link ni obligación', (source, label) => {
    const a = getFoodSourceAttribution(source)
    expect(a.label).toBe(label)
    expect(a.href).toBeNull()
    expect(a.requiresAttribution).toBe(false)
  })

  it('cae en "Otra fuente" ante valores desconocidos o nulos', () => {
    for (const s of ['other', 'wat', '', null, undefined]) {
      const a = getFoodSourceAttribution(s)
      expect(a.label).toBe('Otra fuente')
      expect(a.href).toBeNull()
      expect(a.requiresAttribution).toBe(false)
    }
  })

  it('solo open_food_facts exige atribución (barrido de todos los estados)', () => {
    const sources = ['eva', 'coach', 'team', 'import', 'usda', 'open_food_facts', 'other']
    const required = sources.filter((s) => getFoodSourceAttribution(s).requiresAttribution)
    expect(required).toEqual(['open_food_facts'])
  })
})

describe('getFoodVerificationLabel', () => {
  it.each([
    ['eva_verified', 'Verificado por EVA', 'verified'],
    ['coach_verified', 'Verificado por tu coach', 'verified'],
    ['community', 'Verificado por la comunidad', 'community'],
    ['rejected', 'Rechazado', 'danger'],
    ['unverified', 'Sin verificar', 'neutral'],
  ])('mapea %s → %s (%s)', (status, label, tone) => {
    const v = getFoodVerificationLabel(status)
    expect(v.label).toBe(label)
    expect(v.tone).toBe(tone)
  })

  it('cae en "Sin verificar" ante valores desconocidos o nulos', () => {
    for (const s of ['', 'weird', null, undefined]) {
      expect(getFoodVerificationLabel(s)).toEqual({ label: 'Sin verificar', tone: 'neutral' })
    }
  })
})

describe('formatBarcode', () => {
  it('agrupa dígitos de a cuatro', () => {
    expect(formatBarcode('7801234567890')).toBe('7801 2345 6789 0')
  })

  it('devuelve guion para vacío/nulo/no numérico', () => {
    expect(formatBarcode(null)).toBe('—')
    expect(formatBarcode(undefined)).toBe('—')
    expect(formatBarcode('')).toBe('—')
    expect(formatBarcode('abc')).toBe('—')
  })

  it('conserva solo dígitos', () => {
    expect(formatBarcode('780-123')).toBe('7801 23')
  })
})
