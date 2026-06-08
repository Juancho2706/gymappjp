/**
 * Sistema de motion del cliente (Ola 0). Re-exporta los tokens compartidos de
 * @eva/brand-kit y agrega helpers Reanimated + el hook useEvaMotion() que
 * respeta reduce-motion de forma global. Único lugar para duraciones/curvas.
 */
import { Easing, useReducedMotion } from 'react-native-reanimated'
import { DURATION, EASING, SPRING, type DurationToken, type SpringToken } from '@eva/brand-kit'

export { DURATION, EASING, SPRING }
export type { DurationToken, SpringToken }

/** Curvas Easing de Reanimated derivadas de los tokens Bézier compartidos. */
export const EASE = {
  standard: Easing.bezier(EASING.standard[0], EASING.standard[1], EASING.standard[2], EASING.standard[3]),
  decelerate: Easing.bezier(EASING.decelerate[0], EASING.decelerate[1], EASING.decelerate[2], EASING.decelerate[3]),
  accelerate: Easing.bezier(EASING.accelerate[0], EASING.accelerate[1], EASING.accelerate[2], EASING.accelerate[3]),
}

/**
 * Hook central de motion. Si el usuario activó "reducir movimiento" en el SO,
 * colapsa duraciones a 0 (sin movimiento espacial) manteniendo la UI usable.
 * Usar en vez de duraciones inline para consistencia + accesibilidad de una vez.
 */
export function useEvaMotion() {
  const reduced = useReducedMotion()
  return {
    reduced,
    /** Duración (ms) de un token; 0 si reduce-motion. */
    duration: (token: DurationToken = 'base') => (reduced ? 0 : DURATION[token]),
    /** Config de withTiming({duration, easing}). */
    timing: (token: DurationToken = 'base', ease: keyof typeof EASE = 'standard') => ({
      duration: reduced ? 0 : DURATION[token],
      easing: EASE[ease],
    }),
    /** Config de withSpring(...). En reduce-motion devuelve un spring instantáneo. */
    spring: (token: SpringToken = 'ui') => (reduced ? { ...SPRING[token], duration: 1 } : SPRING[token]),
  }
}
