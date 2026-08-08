/**
 * Piezas PURAS (sin React) compartidas por los componentes del wizard del builder V2: el tipo
 * del `dispatch` del reducer, el contrato de "copiar franja a otros dias" y los helpers que
 * antes vivian inline en PlanBuilderClient.tsx.
 */

import type { FoodCatalogItem } from '@eva/nutrition-v2'
import type { BuilderAction, BuilderFood, BuilderState } from './draft-builder'

export type Dispatch = (action: BuilderAction) => void

export function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'k-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

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
     * PARQUEADO a propósito (T2.1 F3, hallazgo 2026-08-07). El catálogo YA emite
     * `macrosBasis`, pero `public.foods.macros_basis` NO es confiable: el backfill marcó
     * `per_serving` toda fila con `exchange_group_id`, y 60 de ellas llevan macros que en
     * realidad son por 100 g ("Aceite vegetal": 884 kcal / 100 g de grasa con
     * `serving_size = 5`). Propagar la base aquí cambiaría el preview del coach a números
     * PEORES para esas filas — y mejores para las que sí son por porción ("Arepa": 1 un =
     * 240 kcal, que hoy se calcula como 2,4). Mientras el dato esté mixto, el builder
     * mantiene la fórmula histórica por 100 g/ml. Se enciende cuando esas 60 filas estén
     * auditadas (TASKS F4.2).
     */
    macrosBasis: null,
    media: item.media,
  }
}

export function numOr0(value: string): number {
  const n = Number(String(value).trim())
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Copia de UNA franja a otros días: lo que el menú de la franja le pide al wizard (P0-4). */
export interface SlotCopyRequest {
  sourceVariantKey: string
  slotKey: string
  targetVariantKeys: string[]
}

/**
 * Errores de validación agrupados POR DÍA (P2-1). `validateStep` valida TODOS los días, pero
 * sus claves son de franja/item: sin este mapeo el coach veía "Cantidad invalida" sin saber en
 * qué día está. Devuelve el PRIMER problema de cada día, que es lo que se pinta en el chip y
 * en el aviso con enlace al día.
 */
export function variantErrorsOf(state: BuilderState, errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  if (Object.keys(errors).length === 0) return out
  for (const variant of state.variants) {
    const missingSlots = errors['variant.' + variant.key + '.slots']
    if (missingSlots) {
      out[variant.key] = missingSlots
      continue
    }
    for (const slot of variant.slots) {
      const slotError = errors['slot.' + slot.key + '.name'] ?? errors['slot.' + slot.key + '.startTime']
      if (slotError) {
        out[variant.key] = slotError
        break
      }
      const itemError = slot.items
        .map((item) => errors['item.' + item.key + '.food'] ?? errors['item.' + item.key + '.quantity'])
        .find((message) => Boolean(message))
      if (itemError) {
        out[variant.key] = itemError
        break
      }
    }
  }
  return out
}
