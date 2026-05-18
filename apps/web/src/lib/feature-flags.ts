/**
 * Client-safe feature flags (`NEXT_PUBLIC_*` inlined at build).
 * @see docs/ANALISIS-MODULO-NUTRICION.md §12.2
 */

function envIsTrue(key: string): boolean {
  return process.env[key] === 'true'
}

function envIsNotFalse(key: string): boolean {
  return process.env[key] !== 'false'
}

export const featureFlags = {
  /** Plan semanal en UI (día fijo vs todos); el schema ya soporta day_of_week en prod. */
  nutritionWeeklyPlan: envIsTrue('NEXT_PUBLIC_FF_WEEKLY_PLAN'),
  /** Registro detallado / porciones — reservado para experimentos futuros. */
  nutritionDetailedLogging: envIsTrue('NEXT_PUBLIC_FF_DETAILED_LOGGING'),
  /**
   * Eventos custom de nutrición hacia Vercel Analytics (`track`).
   * Desactivar con `NEXT_PUBLIC_FF_NUTRITION_ANALYTICS=false` (p. ej. staging sin WA).
   */
  nutritionAnalytics: envIsNotFalse('NEXT_PUBLIC_FF_NUTRITION_ANALYTICS'),
} as const

export type FeatureFlags = typeof featureFlags
