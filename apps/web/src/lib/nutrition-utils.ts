/**
 * Macros de nutrición — re-export del motor canónico @eva/nutrition-engine.
 *
 * Las funciones puras de macros (calculateFoodItemMacros, sumMealMacros,
 * calculateConsumedMacros*, normalizeMealForMacros, swap helpers + tipos) se
 * MOVIERON VERBATIM a `packages/nutrition-engine` (fuente de verdad única
 * reutilizada por web + mobile). Este archivo las re-exporta para que todos los
 * importadores existentes (`@/lib/nutrition-utils`) sigan compilando sin cambios.
 */

export * from '@eva/nutrition-engine'
