/**
 * @eva/brand-kit/motion — tokens de MOVIMIENTO compartidos web↔RN.
 * Pure TypeScript, sin imports de React/RN/DOM (igual que el motor de color).
 * Fuente única de duraciones/easings/springs para que "animado" sea consistente
 * y no una decisión ad-hoc por archivo. Reanimated/Moti los consumen en mobile.
 */

/** Duraciones en ms — mirror 1:1 de web globals.css `--dur-*` (instant 80 / fast 140 /
 * base 220 / slow 320 / slower 480). micro-feedback=instant/fast, estado=base/slow,
 * celebración=slower. `expressive` se conserva como alias legacy de `slower`. */
export const DURATION = {
  instant: 80,
  fast: 140,
  base: 220,
  slow: 320,
  slower: 480,
  /** @deprecated alias legacy de `slower` (nombre pre-paridad). */
  expressive: 480,
} as const
export type DurationToken = keyof typeof DURATION

/** Puntos de control Bézier (x1,y1,x2,y2).
 * out/inOut/spring/emphasis = mirror 1:1 de web globals.css `--ease-out/-in-out/
 * -spring/-emphasis`. standard/decelerate/accelerate = curvas Material legacy
 * (consumidores existentes; migrar a las DS en la limpieza de motion). */
export const EASING = {
  // EVA DS (web parity)
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  spring: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
  emphasis: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  // Legacy (Material)
  standard: [0.2, 0, 0, 1] as [number, number, number, number],
  decelerate: [0, 0, 0, 1] as [number, number, number, number],
  accelerate: [0.3, 0, 1, 1] as [number, number, number, number],
} as const
export type EasingToken = keyof typeof EASING

/** Configs de resorte (Reanimated withSpring). ui=snappy para tap; bouncy=gestos. */
export const SPRING = {
  ui: { damping: 18, stiffness: 220, mass: 1 },
  bouncy: { damping: 12, stiffness: 180, mass: 1 },
} as const
export type SpringToken = keyof typeof SPRING
