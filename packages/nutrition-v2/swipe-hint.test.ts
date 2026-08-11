import { describe, expect, it } from 'vitest'
import {
  NUTRITION_SWIPE_HINT_PEEK_PX,
  shouldPlaySwipeHint,
  type SwipeHintDecisionInput,
} from './swipe-hint'

const base: SwipeHintDecisionInput = {
  enabled: true,
  reduceMotion: false,
  alreadySeen: false,
  claimedBySibling: false,
}

describe('shouldPlaySwipeHint', () => {
  it('la primera fila intercambiable, en un dispositivo nuevo, la reproduce', () => {
    expect(shouldPlaySwipeHint(base)).toBe(true)
  })

  it('una fila sin equivalentes no enseña un gesto que no puede hacer', () => {
    expect(shouldPlaySwipeHint({ ...base, enabled: false })).toBe(false)
  })

  it('con "reducir movimiento" no se anima nunca', () => {
    expect(shouldPlaySwipeHint({ ...base, reduceMotion: true })).toBe(false)
  })

  it('no se repite: una vez vista, nunca mas', () => {
    expect(shouldPlaySwipeHint({ ...base, alreadySeen: true })).toBe(false)
  })

  it('solo UNA fila se mueve aunque el dia tenga varias intercambiables', () => {
    expect(shouldPlaySwipeHint({ ...base, claimedBySibling: true })).toBe(false)
  })

  it('la fila que ya la reclamo no se la roba a si misma (claimedBySibling es de las OTRAS)', () => {
    // El llamador pasa `claimedBySibling: claimed && !esMia`, asi que una re-ejecucion del efecto
    // en la misma fila llega igual que la primera vez: lo que la frena es `alreadySeen`.
    expect(shouldPlaySwipeHint({ ...base, claimedBySibling: false, alreadySeen: true })).toBe(false)
  })

  it('el asomo es mas corto que el umbral del gesto: muestra el fondo, no simula el intercambio', () => {
    expect(NUTRITION_SWIPE_HINT_PEEK_PX).toBeLessThan(56)
  })
})
