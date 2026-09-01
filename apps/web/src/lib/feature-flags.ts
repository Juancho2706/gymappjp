/**
 * Client-safe feature flags (`NEXT_PUBLIC_*` inlined at build).
 */

function envIsNotFalse(key: string): boolean {
  return process.env[key] !== 'false'
}

export const featureFlags = {
  /**
   * Eventos custom de nutrición hacia Vercel Analytics (`track`).
   * Desactivar con `NEXT_PUBLIC_FF_NUTRITION_ANALYTICS=false` (p. ej. staging sin WA).
   */
  nutritionAnalytics: envIsNotFalse('NEXT_PUBLIC_FF_NUTRITION_ANALYTICS'),
} as const

export type FeatureFlags = typeof featureFlags
