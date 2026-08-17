import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BRAND_HEX,
  READABLE_DARK_INK,
  READABLE_LIGHT_INK,
  normalizeBrandHex,
  readableInkOn,
} from '../apps/mobile/lib/color-contrast'

/**
 * Contraste de la «Familia N» en el móvil (T3.v Cabina).
 *
 * Los tres casos son los mismos que verifica el test web de `AddActionButton`: si esta suite y
 * aquella no coinciden, el mismo coach vería el botón con tinta blanca en una plataforma y oscura
 * en la otra. Es lógica pura — no monta nada de React Native.
 */
describe('readableInkOn', () => {
  it('elige tinta oscura sobre un color de marca claro', () => {
    // #F5D90A (amarillo): gana negro por lejos (ratio ~14.8 vs ~1.4).
    expect(readableInkOn('#F5D90A')).toBe(READABLE_DARK_INK)
  })

  it('elige tinta blanca sobre un color de marca oscuro', () => {
    // #1D4ED8 (azul 700): gana blanco (ratio ~6.7 vs ~3.1).
    expect(readableInkOn('#1D4ED8')).toBe(READABLE_LIGHT_INK)
  })

  it('sin marca cae al primary de EVA y devuelve blanco', () => {
    expect(DEFAULT_BRAND_HEX).toBe('#2563EB')
    expect(readableInkOn(undefined)).toBe(READABLE_LIGHT_INK)
    expect(readableInkOn(null)).toBe(READABLE_LIGHT_INK)
    expect(readableInkOn(DEFAULT_BRAND_HEX)).toBe(READABLE_LIGHT_INK)
  })

  it('la tinta oscura no es negro puro (se ve duro sobre saturados)', () => {
    expect(READABLE_DARK_INK).not.toBe('#000000')
  })
})

describe('normalizeBrandHex', () => {
  it('acepta hex de 6 dígitos con y sin #', () => {
    expect(normalizeBrandHex('#F5D90A')).toBe('#f5d90a')
    expect(normalizeBrandHex('f5d90a')).toBe('#f5d90a')
    expect(normalizeBrandHex('  #1D4ED8  ')).toBe('#1d4ed8')
  })

  it('expande la forma corta de 3 dígitos', () => {
    expect(normalizeBrandHex('#0af')).toBe('#00aaff')
  })

  it('cae al primary de EVA ante basura, vacío o null', () => {
    expect(normalizeBrandHex('rojo')).toBe(DEFAULT_BRAND_HEX)
    expect(normalizeBrandHex('#12345')).toBe(DEFAULT_BRAND_HEX)
    expect(normalizeBrandHex('')).toBe(DEFAULT_BRAND_HEX)
    expect(normalizeBrandHex(null)).toBe(DEFAULT_BRAND_HEX)
  })

  it('un hex roto nunca produce tinta indefinida', () => {
    // Sin normalizar, `parseInt('ro', 16)` sería NaN y la luminancia inválida.
    expect(readableInkOn('rojo')).toBe(READABLE_LIGHT_INK)
  })
})
