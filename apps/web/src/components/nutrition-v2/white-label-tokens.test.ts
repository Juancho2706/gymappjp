import { describe, expect, it } from 'vitest'
import {
  NUTRITION_MACROS,
  NUTRITION_NATIVE_TONE_CLASSES,
  NUTRITION_WEB_TONE_CLASSES,
} from '@eva/nutrition-v2'

// White-label guard: el acento de Nutricion V2 (tono `nutrition`) debe resolver al
// primary del coach (`--theme-primary` via utilidades `*-primary`), NUNCA al naranja
// fijo `ember`. Los colores de macro (categorical data-viz) SI conservan ember/sport/aqua.
describe('nutrition v2 white-label tokens', () => {
  it('el tono nutrition usa el primary del tema, no ember (web)', () => {
    expect(NUTRITION_WEB_TONE_CLASSES.nutrition).toContain('primary')
    expect(NUTRITION_WEB_TONE_CLASSES.nutrition).not.toContain('ember')
  })

  it('el tono nutrition usa el primary del tema, no ember (native)', () => {
    expect(NUTRITION_NATIVE_TONE_CLASSES.nutrition).toContain('primary')
    expect(NUTRITION_NATIVE_TONE_CLASSES.nutrition).not.toContain('ember')
  })

  it('la paleta categorical de macros se mantiene distinta (no colapsa a primary)', () => {
    // protein/carbs/fats deben seguir siendo 3 hues distintos (data-viz), no la marca.
    const bars = [
      NUTRITION_MACROS.protein.webBarClass,
      NUTRITION_MACROS.carbs.webBarClass,
      NUTRITION_MACROS.fats.webBarClass,
    ]
    expect(new Set(bars).size).toBe(3)
  })
})
