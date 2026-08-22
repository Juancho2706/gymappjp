import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  EVA_FIGURE_RATIO,
  SPLASH_COACH_GREETING_LINE_HEIGHT,
  SPLASH_COACH_GREETING_MARGIN_TOP,
  SPLASH_COACH_NAME_LINE_HEIGHT,
  SPLASH_COACH_NAME_MARGIN_TOP,
  SPLASH_COACH_TILE,
  SPLASH_FIGURE_HEIGHT,
  SPLASH_FIGURE_SIZE,
  SPLASH_SIGNATURE_SLOT_OFFSET,
  evaFigureHeight,
  splashCoachSourceCenterY,
  splashFigureCenterY,
} from '../apps/mobile/components/entry/splash-geometry'

/**
 * Guard de PARIDAD con el splash nativo. La leccion del QA 19-08: la replica JS pinto la
 * figura a 150 pt durante meses mientras `app.json` decia `imageWidth: 180` — el logo se
 * achicaba un 20% y saltaba en cada handoff, y ningun gate lo cazaba. Este test ata los dos
 * lados: cambiar cualquiera sin el otro ROMPE CI, que es exactamente la intencion.
 */
describe('paridad con el splash nativo', () => {
  it('SPLASH_FIGURE_SIZE es EXACTAMENTE el imageWidth de expo-splash-screen en app.json', () => {
    const appJson = JSON.parse(
      readFileSync(join(__dirname, '../apps/mobile/app.json'), 'utf-8'),
    ) as { expo: { plugins: unknown[] } }
    const splashPlugin = appJson.expo.plugins.find(
      (p): p is [string, { imageWidth?: number }] => Array.isArray(p) && p[0] === 'expo-splash-screen',
    )
    expect(splashPlugin, 'app.json debe declarar el plugin expo-splash-screen').toBeDefined()
    expect(splashPlugin?.[1].imageWidth).toBe(SPLASH_FIGURE_SIZE)
  })

  it('la figura se centra en el centro REAL de la pantalla, como el nativo', () => {
    expect(splashFigureCenterY(844)).toBe(422)
    expect(splashFigureCenterY(568)).toBe(284)
  })
})

describe('geometria de la figura y la firma', () => {
  it('el alto deriva del aspecto real del asset (585:526)', () => {
    expect(EVA_FIGURE_RATIO).toBeCloseTo(585 / 526, 12)
    expect(SPLASH_FIGURE_HEIGHT).toBe(evaFigureHeight(SPLASH_FIGURE_SIZE))
    expect(SPLASH_FIGURE_HEIGHT).toBe(162)
    // El resto de la familia de entrada (lockup 30, navbar 22) usa la misma formula.
    expect(evaFigureHeight(30)).toBe(27)
    expect(evaFigureHeight(22)).toBe(20)
  })

  it('el slot de la firma cuelga de media figura + 16 pt: cambiar el tamano sin el slot despega la firma', () => {
    expect(SPLASH_SIGNATURE_SLOT_OFFSET).toBe(SPLASH_FIGURE_HEIGHT / 2 + 16)
    expect(SPLASH_SIGNATURE_SLOT_OFFSET).toBe(97)
  })
})

describe('ancla de la luz del canal coach', () => {
  it('apunta al centro optico del tile (h/2 − 38), no al de la figura EVA', () => {
    // Bloque coach: tile 144 + nombre (22 + 30) + saludo (8 + 16) = 220 de alto, centrado
    // como stack ⇒ centro del tile = h/2 − 220/2 + 72. Con el ancla en h/2 la fuente de luz
    // quedaba debajo del logo tras el crossfade (revision adversarial 19-08; eran 31 con el
    // tile de 96).
    const stack =
      SPLASH_COACH_TILE +
      SPLASH_COACH_NAME_MARGIN_TOP +
      SPLASH_COACH_NAME_LINE_HEIGHT +
      SPLASH_COACH_GREETING_MARGIN_TOP +
      SPLASH_COACH_GREETING_LINE_HEIGHT
    expect(stack).toBe(220)
    expect(splashCoachSourceCenterY(844)).toBe(422 - 38)
    expect(splashCoachSourceCenterY(844) - splashFigureCenterY(844)).toBe(-(stack / 2 - SPLASH_COACH_TILE / 2))
  })

  it('el tile del coach mide lo que la figura EVA nativa pinta de alto (~140 de 180), no la caja', () => {
    // Owner 22-08 (video del cold start): «que este del tamaño del icono del splash».
    expect(SPLASH_COACH_TILE).toBe(144)
    expect(SPLASH_COACH_TILE).toBeLessThan(SPLASH_FIGURE_SIZE)
    expect(SPLASH_COACH_TILE).toBeGreaterThan(SPLASH_FIGURE_HEIGHT * 0.85)
  })
})
