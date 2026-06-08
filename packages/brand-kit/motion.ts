/**
 * @eva/brand-kit/motion — tokens de MOVIMIENTO compartidos web↔RN.
 * Pure TypeScript, sin imports de React/RN/DOM (igual que el motor de color).
 * Fuente única de duraciones/easings/springs para que "animado" sea consistente
 * y no una decisión ad-hoc por archivo. Reanimated/Moti los consumen en mobile.
 */

/** Duraciones en ms. micro-feedback=instant/fast, estado=base/slow, celebración=expressive. */
export const DURATION = {
  instant: 90,
  fast: 160,
  base: 220,
  slow: 320,
  expressive: 480,
} as const
export type DurationToken = keyof typeof DURATION

/** Puntos de control Bézier (x1,y1,x2,y2) — curvas estándar tipo Material. */
export const EASING = {
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
