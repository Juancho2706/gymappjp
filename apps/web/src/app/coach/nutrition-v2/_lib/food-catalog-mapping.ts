/**
 * Item del catalogo (buscador) → `BuilderFood`. Es la traduccion que hacen TODAS las superficies
 * de autoria al elegir un alimento: el picker del editor, su paleta lateral y el wizard.
 *
 * RETIRO DEL PAR VIEJO (2026-08-16): vivia en el view-model del wizard
 * (`[clientId]/builder/_lib/builder-view-model.ts`), la carpeta que muere con el. Movido
 * VERBATIM; el view-model lo re-exporta para sus consumidores historicos.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'
import type { BuilderFood } from '@eva/nutrition-v2'

export function mapCatalogItemToFood(item: FoodCatalogItem): BuilderFood {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatsG: item.fatsG,
    fiberG: item.fiberG,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    category: item.category,
    /**
     * Base declarada (NUT-001). El catálogo la emite desde T2.1 y el builder la respeta: sin
     * ella, un alimento con macros POR PORCIÓN ("Arepa": 1 unidad = 240 kcal) se previsualiza
     * y se congela como 2,4. El dato quedó auditado en `20260807230000` — solo 10 filas del
     * catálogo son realmente `per_serving`; las otras 50 estaban mal etiquetadas y volvieron a
     * `per_100`. Ausente en una respuesta vieja ⇒ `null` y rige la fórmula histórica.
     */
    macrosBasis: item.macrosBasis ?? null,
    // Corrección del coach ya aplicada por el catálogo (T2.1): los macros de arriba son los
    // corregidos; esto solo alimenta el badge ✎ y el valor tachado.
    hasOverride: item.hasOverride ?? false,
    originalMacros: item.original ?? null,
    media: item.media,
  }
}
