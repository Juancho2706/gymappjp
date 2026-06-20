import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  buildShoppingList,
  listShoppingState,
  shoppingItemKey,
  type ShoppingAisle,
  type ShoppingPlanSource,
} from '@/services/nutrition-shopping.service'

/**
 * Lista de compras del alumno = líneas DERIVADAS del plan activo (puras) + estado
 * persistido (checks + ítems manuales). Cacheado por request (React.cache).
 *
 * Data flow: _data -> services (puro + estado) -> Supabase (vía createClient).
 */

export type ShoppingItemView = {
  key: string
  foodId: string | null
  name: string
  category: string
  quantities: { unit: string; quantity: number }[]
  isChecked: boolean
  isManual: boolean
  /** id de fila `shopping_list_items` cuando existe estado persistido (manual o check). */
  stateId: string | null
}

export type ShoppingAisleView = {
  category: string
  items: ShoppingItemView[]
}

export type ShoppingListView = {
  planId: string | null
  aisles: ShoppingAisleView[]
}

/**
 * Carga el plan activo (mismo shape que `getActiveNutritionPlan`, + foods.category /
 * serving_unit que la lista necesita) y lo fusiona con el estado guardado.
 */
export const getShoppingList = cache(
  async (clientId: string): Promise<ShoppingListView> => {
    const supabase = await createClient()

    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select(
        `
        id, client_id, is_active,
        nutrition_meals (
          id, order_index,
          food_items (
            id, quantity, unit,
            foods ( id, name, category, serving_unit )
          )
        )
      `
      )
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle()

    const planId = plan?.id ?? null
    const derived: ShoppingAisle[] = buildShoppingList(plan as ShoppingPlanSource)
    const state = await listShoppingState(supabase, clientId, planId)

    // Index estado por label normalizado para casar con líneas derivadas.
    const stateByKey = new Map(state.map((row) => [shoppingItemKey(row.label), row]))
    const consumedManualKeys = new Set<string>()

    const aisles: ShoppingAisleView[] = derived.map((aisle) => ({
      category: aisle.category,
      items: aisle.items.map((line) => {
        const row = stateByKey.get(line.key)
        return {
          key: line.key,
          foodId: line.foodId,
          name: line.name,
          category: line.category,
          quantities: line.quantities,
          isChecked: row?.is_checked ?? false,
          isManual: false,
          stateId: row?.id ?? null,
        }
      }),
    }))

    // Ítems manuales: filas is_manual que no corresponden a una línea derivada.
    const manualItems: ShoppingItemView[] = []
    for (const row of state) {
      if (!row.is_manual) continue
      const key = shoppingItemKey(row.label)
      if (consumedManualKeys.has(key)) continue
      consumedManualKeys.add(key)
      manualItems.push({
        key,
        foodId: null,
        name: row.label,
        category: (row.category ?? '').trim() || 'Manuales',
        quantities: [],
        isChecked: row.is_checked,
        isManual: true,
        stateId: row.id,
      })
    }

    if (manualItems.length > 0) {
      // Fusionar manuales en sus pasillos (o crear el pasillo) preservando orden.
      const byCategory = new Map(aisles.map((a) => [a.category, a]))
      for (const item of manualItems) {
        const existing = byCategory.get(item.category)
        if (existing) {
          existing.items.push(item)
        } else {
          const fresh: ShoppingAisleView = { category: item.category, items: [item] }
          byCategory.set(item.category, fresh)
          aisles.push(fresh)
        }
      }
    }

    return { planId, aisles }
  }
)
