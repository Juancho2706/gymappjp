/**
 * Alimento del editor de planes + calculo de macros por item (R1, extraccion T3.x).
 *
 * Vivian en `apps/web/.../builder/_lib/draft-builder.ts` (wizard web) desde la Ola 0; el
 * editor unico (`editor-state.ts`, este paquete) los necesita y un paquete no puede importar
 * de `apps/web`. Movidos VERBATIM — `computeItemMacros` congela planes y no puede cambiar de
 * resultado por un refactor. El wizard web los re-exporta desde su ruta historica.
 */

import { calculateFoodItemMacros, type FoodMacrosRow } from '@eva/nutrition-engine'
import { intakeEntryFactor, type NutritionMacrosBasis } from './intake-normalize'
import type { FoodMacroSet } from './food-overrides'

/** Tope de reemplazos autorizados por item prescrito (F-02, limite legado V1 = 8). */
export const MAX_ITEM_SUBSTITUTIONS = 8

export interface BuilderFood {
  id: string
  name: string
  brand: string | null
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
  servingSize: number
  servingUnit: string
  category: string | null
  media: { bucket: string; objectPath: string; version: number } | null
  /**
   * Base declarada de los macros de arriba (NUT-001). OPCIONAL a proposito: ausente =
   * "no declarada" y rige la formula historica por 100 g/ml, que es lo que asume todo el
   * catalogo importado. Solo el seed de intercambios y los overrides de coach
   * (specs/nutrition-food-overrides) traen `per_serving`.
   */
  macrosBasis?: NutritionMacrosBasis | null
  /**
   * El coach corrigió los macros de este alimento (T2.2). Los macros de arriba YA son los
   * corregidos: esto solo marca la fila con ✎ y guarda el valor del catálogo para mostrarlo
   * tachado. Ausente = sin corrección (o respuesta anterior a T2.1).
   */
  hasOverride?: boolean
  originalMacros?: FoodMacroSet | null
}

/**
 * Lo que cambia de un alimento cuando el coach guarda (o restaura) su corrección. Es un
 * subconjunto de `BuilderFood` a propósito: nombre, marca, foto y porción NO se tocan — la
 * corrección es de los macros, no del alimento.
 */
export type BuilderFoodMacrosPatch = Pick<
  BuilderFood,
  'calories' | 'proteinG' | 'carbsG' | 'fatsG' | 'fiberG' | 'macrosBasis' | 'hasOverride' | 'originalMacros'
>

/**
 * Nombre normalizado de franja para EMPAREJAR al copiar entre dias (P0-4 y copy semana):
 * copiar sobre un dia que ya la tiene reemplaza su contenido en vez de duplicarla.
 * Solo empareja: el nombre que queda escrito es SIEMPRE el del origen.
 *
 * Compartido por el wizard web y el editor unico para que las superficies mezclen igual.
 */
export function slotMergeName(name: string): string {
  return name.trim().toLowerCase()
}

export interface ItemMacros {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
}

const ZERO_MACROS: ItemMacros = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 }

function round1(value: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}

/**
 * Macros de un item prescrito para una cantidad/unidad. Reutiliza EXACTAMENTE el
 * motor compartido (calculateFoodItemMacros): el mismo calculo que vera el alumno.
 *
 * Rama `per_serving`: el catalogo tiene DOS convenciones vivas y el motor canonico solo
 * conoce la de por-100. Un alimento con macros POR PORCION (seed de intercambios, override
 * de coach) escalado con la formula por-100 se congela con numeros equivocados, y el error
 * solo aparece cuando el alumno mira su plan — el snapshot ya es inmutable para entonces.
 * El factor sale de `intakeEntryFactor`, espejo byte a byte de
 * `private.nutrition_v2_entry_factor`: misma matematica en el freeze y en el registro.
 *
 * Sin base declarada (el 100% del catalogo importado) el camino queda BYTE-IDENTICO al
 * anterior: esta funcion congela planes y no puede cambiar de resultado por un refactor.
 */
export function computeItemMacros(food: BuilderFood, quantity: number, unit: string): ItemMacros {
  if (!Number.isFinite(quantity) || quantity <= 0) return ZERO_MACROS
  if (food.macrosBasis === 'per_serving') {
    const factor = intakeEntryFactor({
      quantity,
      unit,
      servingSize: food.servingSize,
      basis: 'per_serving',
    })
    return {
      calories: round1(food.calories * factor),
      proteinG: round1(food.proteinG * factor),
      carbsG: round1(food.carbsG * factor),
      fatsG: round1(food.fatsG * factor),
      fiberG: food.fiberG == null ? 0 : round1(food.fiberG * factor),
    }
  }
  const foodsRow: FoodMacrosRow = {
    name: food.name,
    calories: food.calories,
    protein_g: food.proteinG,
    carbs_g: food.carbsG,
    fats_g: food.fatsG,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
  }
  const m = calculateFoodItemMacros({ quantity, unit, foods: foodsRow })
  const unitLower = (unit || 'g').toLowerCase()
  const isDirect = unitLower === 'g' || unitLower === 'ml'
  const factor = isDirect ? quantity / 100 : (quantity * (food.servingSize || 0)) / 100
  const fiber = food.fiberG == null ? 0 : Math.round(food.fiberG * factor * 10) / 10
  return { calories: m.calories, proteinG: m.protein, carbsG: m.carbs, fatsG: m.fats, fiberG: fiber }
}
