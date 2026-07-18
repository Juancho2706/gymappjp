import { describe, expect, it } from 'vitest'
import { confettiHuePalette, parseRgbChannels } from './aura-hero.logic'

describe('parseRgbChannels', () => {
  it('parsea comas y espacios', () => {
    expect(parseRgbChannels('38, 128, 255')).toEqual([38, 128, 255])
    expect(parseRgbChannels('38 128 255')).toEqual([38, 128, 255])
  })

  it('clamp a 0..255 y redondeo', () => {
    expect(parseRgbChannels('300, -5, 128.6')).toEqual([255, 0, 129])
  })

  it('inválido/nulo => null', () => {
    expect(parseRgbChannels('')).toBeNull()
    expect(parseRgbChannels('38, 128')).toBeNull()
    expect(parseRgbChannels(null)).toBeNull()
  })
})

describe('confettiHuePalette', () => {
  it('devuelve variaciones de luminosidad del mismo hue (no multicolor)', () => {
    const palette = confettiHuePalette('38, 128, 255')
    expect(palette).toHaveLength(4)
    expect(palette[0]).toBe('rgb(38, 128, 255)')
    // Aclarado hacia blanco: cada canal >= base.
    expect(palette[1]).toBe('rgb(114, 172, 255)')
    // Oscurecido: baja los canales respecto del base.
    expect(palette[3]).toBe('rgb(29, 96, 191)')
  })

  it('canales inválidos => vacío (caller cae al color por defecto)', () => {
    expect(confettiHuePalette(null)).toEqual([])
    expect(confettiHuePalette('nope')).toEqual([])
  })
})
