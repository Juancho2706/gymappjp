/**
 * Tokens de MOTION del ejecutor v3 — lenguaje de movimiento compartido web↔RN (Reanimated/Moti en
 * mobile, Framer/CSS en web). TypeScript PURO: sin React / RN / DOM.
 *
 * Taxonomía Material 3 Expressive: springs "spatial" (mueven algo en el espacio → rebote leve) vs
 * "effect" (color/opacidad/escala sutil → sin rebote). El ejecutor define su propia escala de
 * duraciones/springs (más generosa que la app-wide `@eva/brand-kit/motion`) porque el ejecutor es una
 * superficie inmersiva de pantalla completa; NO reemplaza los tokens de brand-kit (DURATION/SPRING),
 * convive con ellos. Si el equipo decide unificar ambas escalas, este archivo es el punto de reconcilia.
 */

/** Nombre de una duración de transición. */
export type MotionDurationToken = 'instant' | 'fast' | 'base' | 'slow'

/**
 * Duraciones en milisegundos.
 * - `instant` (100): micro-feedback (check de serie, tick de rest).
 * - `fast` (200): entradas/salidas cortas, cross-fades.
 * - `base` (300): transición estándar de estado.
 * - `slow` (450): transiciones expresivas (overlay de resumen, celebración).
 */
export const MOTION_DURATION_MS: Record<MotionDurationToken, number> = {
    instant: 100,
    fast: 200,
    base: 300,
    slow: 450,
}

/** Config de resorte (mirror del shape que consume Reanimated `withSpring`). */
export interface SpringSpec {
    damping: number
    stiffness: number
    mass: number
}

/**
 * Spring ESPACIAL: se usa cuando algo se mueve/aparece en el espacio (avance de paso, entrada de
 * tarjeta, snap de carrusel). Sub-amortiguado a propósito → rebote leve (damping ratio < 1).
 */
export const SPRING_SPATIAL: SpringSpec = { damping: 18, stiffness: 160, mass: 1 }

/**
 * Spring de EFECTO: color, opacidad, escala sutil, progreso. Amortiguado por sobre el crítico →
 * asienta sin rebote (damping ratio >= 1), evita el "wobble" en cambios de estado no espaciales.
 */
export const SPRING_EFFECT: SpringSpec = { damping: 32, stiffness: 210, mass: 1 }

/**
 * Damping ratio ζ = c / (2·√(k·m)) de un spring (m = mass, k = stiffness, c = damping).
 * ζ < 1 sub-amortiguado (rebota) · ζ = 1 crítico · ζ > 1 sobre-amortiguado (sin rebote).
 * Puro y determinista: deja verificable que `SPRING_SPATIAL` rebota y `SPRING_EFFECT` no.
 */
export function springDampingRatio(spec: SpringSpec): number {
    return spec.damping / (2 * Math.sqrt(spec.stiffness * spec.mass))
}

/** ¿El spring rebota (sub-amortiguado)? ζ < 1. */
export function springHasBounce(spec: SpringSpec): boolean {
    return springDampingRatio(spec) < 1
}

/** Contexto de accesibilidad de motion (RN `AccessibilityInfo.isReduceMotionEnabled` / web `prefers-reduced-motion`). */
export interface ReducedMotionContext {
    reducedMotion: boolean
}

/**
 * Motion resuelto para una animación concreta: un spring, o un fade con duración (degradación de
 * accesibilidad). La capa de UI mapea `spring` a `withSpring` y `fade` a `withTiming`/opacidad.
 */
export type ResolvedMotion =
    | { kind: 'spring'; spring: SpringSpec }
    | { kind: 'fade'; durationMs: number }

/**
 * Degrada un spring a un fade cuando el usuario pidió movimiento reducido — contrato único para que
 * "reduced motion" no sea una decisión ad-hoc por pantalla. Con `reducedMotion` el spring se
 * reemplaza por un cross-fade corto (`fadeToken`, default `fast`); sin él, el spring pasa tal cual.
 */
export function resolveSpring(
    spring: SpringSpec,
    ctx: ReducedMotionContext,
    fadeToken: MotionDurationToken = 'fast',
): ResolvedMotion {
    if (ctx.reducedMotion) return { kind: 'fade', durationMs: MOTION_DURATION_MS[fadeToken] }
    return { kind: 'spring', spring }
}
