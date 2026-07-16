import { describe, expect, it } from 'vitest'
import {
  NUTRITION_ILLUSTRATIONS,
  nutritionIllustrationSource,
  resolveNutritionIllustration,
  type NutritionEmptyState,
  type NutritionIllustration,
} from './state-illustration'

const ALL_STATES: NutritionEmptyState[] = [
  'no-plan',
  'day-complete',
  'offline',
  'no-results',
  'empty-catalog',
  'no-clients',
  'empty-history',
  'error',
]

describe('resolveNutritionIllustration', () => {
  it('mapea cada estado semántico a su ilustración canónica', () => {
    expect(resolveNutritionIllustration('no-plan')).toBe('sin-plan')
    expect(resolveNutritionIllustration('day-complete')).toBe('dia-completado')
    expect(resolveNutritionIllustration('offline')).toBe('sin-conexion')
    expect(resolveNutritionIllustration('no-results')).toBe('sin-resultados')
    expect(resolveNutritionIllustration('empty-catalog')).toBe('catalogo-vacio')
    expect(resolveNutritionIllustration('no-clients')).toBe('sin-alumnos')
    expect(resolveNutritionIllustration('empty-history')).toBe('historial-vacio')
    expect(resolveNutritionIllustration('error')).toBe('error-amable')
  })

  it('siempre devuelve una ilustración declarada (total, sin undefined)', () => {
    for (const state of ALL_STATES) {
      const illustration = resolveNutritionIllustration(state)
      expect(NUTRITION_ILLUSTRATIONS).toContain(illustration)
    }
  })

  it('es una biyección: 8 estados → 8 ilustraciones distintas', () => {
    const mapped = ALL_STATES.map(resolveNutritionIllustration)
    expect(new Set(mapped).size).toBe(ALL_STATES.length)
    expect(ALL_STATES.length).toBe(NUTRITION_ILLUSTRATIONS.length)
  })
})

describe('nutritionIllustrationSource', () => {
  it('construye la ruta 1x y el srcSet @2x desde /illustrations/', () => {
    expect(nutritionIllustrationSource('sin-plan')).toEqual({
      src: '/illustrations/sin-plan.webp',
      srcSet: '/illustrations/sin-plan.webp 1x, /illustrations/sin-plan@2x.webp 2x',
    })
  })

  it('genera rutas válidas y consistentes para todas las ilustraciones', () => {
    for (const key of NUTRITION_ILLUSTRATIONS as readonly NutritionIllustration[]) {
      const { src, srcSet } = nutritionIllustrationSource(key)
      expect(src).toBe(`/illustrations/${key}.webp`)
      expect(srcSet).toContain(`/illustrations/${key}@2x.webp 2x`)
      expect(srcSet.startsWith(`${src} 1x`)).toBe(true)
    }
  })
})
