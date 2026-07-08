/**
 * @eva/nutrition-engine — motor PURO de nutrición (macros + adherencia).
 *
 * Fuente de verdad única reutilizada por web (@eva/web) y mobile (apps/mobile).
 * Sin Next.js / Supabase / React / RN ni date-utils. La convención día-de-semana
 * se inyecta en computeNutritionAdherence vía dayOfWeekResolver/mealAppliesOn.
 */

export * from './macros'
export * from './adherence'
export * from './micros'
export * from './tdee'
export * from './bodycomp'
export * from './nutrition-sync'
