/**
 * Lista de compras del alumno (feature B del overhaul de nutrición).
 *
 * Dos mitades, deliberadamente separadas:
 *
 *  1) `buildShoppingList(plan)` — FUNCIÓN PURA (sin Next.js / Supabase / React).
 *     Agrega los `food_items` de TODAS las comidas del plan activo por alimento,
 *     sumando la cantidad por unidad, y agrupa por `foods.category` en "pasillos"
 *     de supermercado. Devuelve líneas DERIVADAS — NUNCA se persisten (la fuente
 *     de verdad de las cantidades es el plan; sólo el estado de check se guarda).
 *
 *  2) Estado de check (CRUD) contra `shopping_list_items`: `toggleShoppingItem`,
 *     `addManualItem`, `listShoppingState`. Esa tabla guarda SÓLO el estado
 *     marcado/manual por alumno+plan, no las cantidades derivadas.
 *
 * El cliente Supabase se inyecta (RLS-scoped, corre como el usuario) igual que el
 * resto de servicios (ver `NutritionService`).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/** Pasillo "sin categoría" cuando `foods.category` es null/vacío. */
export const UNCATEGORIZED_AISLE = 'Otros'

/* ────────────────────────────  PURE  ──────────────────────────── */

/** Una fila `foods` mínima necesaria para construir la lista (categoría + nombre + unidad base). */
export type ShoppingFoodRow = {
  id?: string | null
  name?: string | null
  category?: string | null
  serving_unit?: string | null
}

/** Un `food_items` con su alimento anidado (shape del select del plan activo). */
export type ShoppingFoodItem = {
  quantity?: number | null
  unit?: string | null
  foods?: ShoppingFoodRow | null
}

/** Una comida del plan con sus ítems (shape de `nutrition_meals` anidado). */
export type ShoppingMeal = {
  food_items?: ShoppingFoodItem[] | null
}

/** Plan activo con comidas anidadas — el mismo shape que `getActiveNutritionPlan`. */
export type ShoppingPlanSource = {
  nutrition_meals?: ShoppingMeal[] | null
} | null

/** Una cantidad agregada para una unidad concreta de un alimento. */
export type ShoppingQuantity = {
  unit: string
  quantity: number
}

/** Una línea derivada de la lista (un alimento, con cantidades por unidad). */
export type ShoppingLineItem = {
  /** Clave estable para casar con el estado de check (label normalizado). */
  key: string
  foodId: string | null
  name: string
  category: string
  /** Cantidades sumadas, una por cada unidad distinta usada en el plan. */
  quantities: ShoppingQuantity[]
}

/** Un pasillo de supermercado (categoría) con sus líneas ordenadas. */
export type ShoppingAisle = {
  category: string
  items: ShoppingLineItem[]
}

/**
 * Label canónico de una línea = nombre del alimento. Se usa como `key` (case-insensitive,
 * trim) para casar la línea derivada con el estado de check guardado y con ítems manuales.
 */
export function shoppingItemKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Agrega los ítems del plan en líneas derivadas agrupadas por pasillo (categoría).
 *
 * - Suma cantidades por (alimento, unidad). Distintas unidades del mismo alimento
 *   se listan por separado (no se intenta convertir g↔un↔ml).
 * - Agrupa por `foods.category`; null/vacío → `UNCATEGORIZED_AISLE`.
 * - Orden estable: pasillos alfabéticos (Otros al final), líneas por nombre.
 *
 * PURE: no toca DB. El resultado NUNCA se persiste.
 */
export function buildShoppingList(plan: ShoppingPlanSource): ShoppingAisle[] {
  const meals = plan?.nutrition_meals ?? []

  // key alimento -> acumulador
  type Acc = {
    foodId: string | null
    name: string
    category: string
    qtyByUnit: Map<string, number>
  }
  const byFood = new Map<string, Acc>()

  for (const meal of meals) {
    for (const item of meal?.food_items ?? []) {
      const food = item?.foods
      const name = (food?.name ?? '').trim()
      if (!name) continue

      const key = shoppingItemKey(name)
      const category = (food?.category ?? '').trim() || UNCATEGORIZED_AISLE
      const unit = (item?.unit ?? food?.serving_unit ?? 'g').toString().trim().toLowerCase() || 'g'
      const qty = Number(item?.quantity)
      const addQty = Number.isFinite(qty) ? qty : 0

      let acc = byFood.get(key)
      if (!acc) {
        acc = {
          foodId: food?.id ?? null,
          name,
          category,
          qtyByUnit: new Map<string, number>(),
        }
        byFood.set(key, acc)
      }
      acc.qtyByUnit.set(unit, (acc.qtyByUnit.get(unit) ?? 0) + addQty)
    }
  }

  // Agrupar por pasillo
  const byAisle = new Map<string, ShoppingLineItem[]>()
  for (const [key, acc] of byFood) {
    const quantities: ShoppingQuantity[] = [...acc.qtyByUnit.entries()]
      .map(([unit, quantity]) => ({ unit, quantity: Math.round(quantity * 10) / 10 }))
      .sort((a, b) => a.unit.localeCompare(b.unit))

    const line: ShoppingLineItem = {
      key,
      foodId: acc.foodId,
      name: acc.name,
      category: acc.category,
      quantities,
    }
    const arr = byAisle.get(acc.category)
    if (arr) arr.push(line)
    else byAisle.set(acc.category, [line])
  }

  const aisles: ShoppingAisle[] = [...byAisle.entries()].map(([category, items]) => ({
    category,
    items: items.sort((a, b) => a.name.localeCompare(b.name)),
  }))

  // Pasillos alfabéticos, "Otros" al final.
  aisles.sort((a, b) => {
    if (a.category === UNCATEGORIZED_AISLE) return 1
    if (b.category === UNCATEGORIZED_AISLE) return -1
    return a.category.localeCompare(b.category)
  })

  return aisles
}

/* ────────────────────────  CHECK-STATE CRUD  ──────────────────────── */

type Client = SupabaseClient<Database>
type ShoppingStateRow = Database['public']['Tables']['shopping_list_items']['Row']

/**
 * Lee el estado persistido (checks + ítems manuales) para un alumno+plan.
 * RLS-scoped (corre como el usuario). Devuelve las filas crudas — la capa _data
 * las casa con las líneas derivadas vía `key`/label.
 */
export async function listShoppingState(
  supabase: Client,
  clientId: string,
  planId: string | null
): Promise<ShoppingStateRow[]> {
  let query = supabase
    .from('shopping_list_items')
    .select('id, client_id, plan_id, label, category, is_checked, is_manual, created_at')
    .eq('client_id', clientId)

  query = planId ? query.eq('plan_id', planId) : query.is('plan_id', null)

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Marca/desmarca una línea de la lista. El estado de check de una línea DERIVADA
 * (no manual) se materializa on-demand: si no existe fila para ese label la crea
 * con `is_manual=false`; si existe, hace toggle de `is_checked`.
 *
 * `isChecked` es el estado DESEADO (no un toggle ciego) para ser idempotente ante
 * doble click / reintentos.
 */
export async function toggleShoppingItem(
  supabase: Client,
  params: {
    clientId: string
    planId: string | null
    label: string
    category?: string | null
    isChecked: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const label = params.label.trim()
  if (!label) return { success: false, error: 'Etiqueta vacía' }

  let existingQuery = supabase
    .from('shopping_list_items')
    .select('id')
    .eq('client_id', params.clientId)
    .eq('label', label)
  existingQuery = params.planId
    ? existingQuery.eq('plan_id', params.planId)
    : existingQuery.is('plan_id', null)
  const { data: existing } = await existingQuery.maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('shopping_list_items')
      .update({ is_checked: params.isChecked })
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  const { error } = await supabase.from('shopping_list_items').insert({
    client_id: params.clientId,
    plan_id: params.planId,
    label,
    category: params.category ?? null,
    is_checked: params.isChecked,
    is_manual: false,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

/**
 * Agrega un ítem MANUAL a la lista (algo fuera del plan). Persiste con
 * `is_manual=true`. Idempotente por (client, plan, label): si ya existe un manual
 * con ese label no duplica.
 */
export async function addManualItem(
  supabase: Client,
  params: {
    clientId: string
    planId: string | null
    label: string
    category?: string | null
  }
): Promise<{ success: boolean; id?: string; error?: string }> {
  const label = params.label.trim()
  if (!label) return { success: false, error: 'Etiqueta vacía' }

  let existingQuery = supabase
    .from('shopping_list_items')
    .select('id')
    .eq('client_id', params.clientId)
    .eq('label', label)
    .eq('is_manual', true)
  existingQuery = params.planId
    ? existingQuery.eq('plan_id', params.planId)
    : existingQuery.is('plan_id', null)
  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) return { success: true, id: existing.id }

  const { data, error } = await supabase
    .from('shopping_list_items')
    .insert({
      client_id: params.clientId,
      plan_id: params.planId,
      label,
      category: params.category ?? null,
      is_checked: false,
      is_manual: true,
    })
    .select('id')
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, id: data.id }
}

/**
 * Borra un ítem MANUAL de la lista. Sólo borra filas `is_manual=true` (las líneas
 * derivadas no se borran: su existencia depende del plan).
 */
export async function removeManualItem(
  supabase: Client,
  clientId: string,
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('id', itemId)
    .eq('client_id', clientId)
    .eq('is_manual', true)
  if (error) return { success: false, error: error.message }
  return { success: true }
}
