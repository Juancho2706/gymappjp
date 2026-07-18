/**
 * Macros de nutrición — re-export del motor canónico @eva/nutrition-engine.
 *
 * Las funciones puras de macros (calculateFoodItemMacros, sumMealMacros,
 * calculateConsumedMacros*, normalizeMealForMacros, swap helpers + tipos) viven
 * en `packages/nutrition-engine` (fuente de verdad única reutilizada por web +
 * mobile). Este archivo las re-exporta para que los importadores mobile
 * existentes (`../lib/nutrition-utils`) sigan compilando sin cambios. Mismo
 * patrón que `apps/web/src/lib/nutrition-utils.ts`.
 */

export * from '@eva/nutrition-engine'
