import { supabase } from './supabase'

/**
 * Lista de compras del alumno (overhaul nutricion) — lado ALUMNO (mobile).
 *
 * Espejo de:
 *  - apps/web/src/services/nutrition-shopping.service.ts (PURO buildShoppingList + estado CRUD)
 *  - apps/web/src/app/c/[coach_slug]/nutrition/_data/shopping.queries.ts (fusion derivado + estado)
 *
 * Dos mitades: (1) buildShoppingList PURO agrega los food_items del plan por alimento/pasillo —
 * NUNCA se persiste; (2) estado de check + items manuales en `shopping_list_items` (RLS-scoped).
 *
 * ── Anti-drift ──────────────────────────────────────────────────────────────────
 * El servicio web no resuelve desde mobile. buildShoppingList / shoppingItemKey se espejan
 * INLINE verbatim. Si cambia la agregacion en la web, actualizar aca.
 */

export const UNCATEGORIZED_AISLE = 'Otros'

export type ShoppingQuantity = { unit: string; quantity: number }

export type ShoppingItemView = {
  key: string
  foodId: string | null
  name: string
  category: string
  quantities: ShoppingQuantity[]
  isChecked: boolean
  isManual: boolean
  stateId: string | null
}

export type ShoppingAisleView = { category: string; items: ShoppingItemView[] }

export type ShoppingListView = { planId: string | null; aisles: ShoppingAisleView[] }

type PlanFoodItem = { quantity?: number | null; unit?: string | null; foods?: any }
type PlanMeal = { nutrition_meal_food_items?: PlanFoodItem[] | null }

/** Label canonico de una linea = nombre del alimento normalizado (key estable). */
export function shoppingItemKey(name: string): string {
  return name.trim().toLowerCase()
}

type ShoppingAisle = { category: string; items: { key: string; foodId: string | null; name: string; category: string; quantities: ShoppingQuantity[] }[] }

/** Agrega los items del plan en lineas derivadas por pasillo. PURO (espejo verbatim). */
export function buildShoppingList(meals: PlanMeal[]): ShoppingAisle[] {
  type Acc = { foodId: string | null; name: string; category: string; qtyByUnit: Map<string, number> }
  const byFood = new Map<string, Acc>()

  for (const meal of meals) {
    for (const item of meal?.nutrition_meal_food_items ?? []) {
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
        acc = { foodId: food?.id ?? null, name, category, qtyByUnit: new Map() }
        byFood.set(key, acc)
      }
      acc.qtyByUnit.set(unit, (acc.qtyByUnit.get(unit) ?? 0) + addQty)
    }
  }

  const byAisle = new Map<string, ShoppingAisle['items']>()
  for (const [key, acc] of byFood) {
    const quantities: ShoppingQuantity[] = [...acc.qtyByUnit.entries()]
      .map(([unit, quantity]) => ({ unit, quantity: Math.round(quantity * 10) / 10 }))
      .sort((a, b) => a.unit.localeCompare(b.unit))
    const line = { key, foodId: acc.foodId, name: acc.name, category: acc.category, quantities }
    const arr = byAisle.get(acc.category)
    if (arr) arr.push(line)
    else byAisle.set(acc.category, [line])
  }

  const aisles: ShoppingAisle[] = [...byAisle.entries()].map(([category, items]) => ({
    category,
    items: items.sort((a, b) => a.name.localeCompare(b.name)),
  }))
  aisles.sort((a, b) => {
    if (a.category === UNCATEGORIZED_AISLE) return 1
    if (b.category === UNCATEGORIZED_AISLE) return -1
    return a.category.localeCompare(b.category)
  })
  return aisles
}

/**
 * Carga el plan activo + estado guardado y devuelve la vista fusionada. RLS = techo.
 * Espejo de getShoppingList. `{ planId:null, aisles:[] }` ante error.
 */
export async function getShoppingList(clientId: string): Promise<ShoppingListView> {
  try {
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select(
        `
        id, client_id, is_active,
        nutrition_meals (
          id, order_index,
          nutrition_meal_food_items (
            id, quantity, unit,
            foods ( id, name, category, serving_unit )
          )
        )
      `
      )
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle()

    const planId = (plan as any)?.id ?? null
    const meals = (((plan as any)?.nutrition_meals as PlanMeal[] | undefined) ?? [])
    const derived = buildShoppingList(meals)

    let stateQuery = supabase
      .from('shopping_list_items')
      .select('id, client_id, plan_id, label, category, is_checked, is_manual, created_at')
      .eq('client_id', clientId)
    stateQuery = planId ? stateQuery.eq('plan_id', planId) : stateQuery.is('plan_id', null)
    const { data: stateData } = await stateQuery.order('created_at', { ascending: true })
    const state = (stateData ?? []) as any[]

    const stateByKey = new Map(state.map((row) => [shoppingItemKey(row.label), row]))

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

    const consumedManualKeys = new Set<string>()
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
      const byCategory = new Map(aisles.map((a) => [a.category, a]))
      for (const item of manualItems) {
        const existing = byCategory.get(item.category)
        if (existing) existing.items.push(item)
        else {
          const fresh: ShoppingAisleView = { category: item.category, items: [item] }
          byCategory.set(item.category, fresh)
          aisles.push(fresh)
        }
      }
    }

    return { planId, aisles }
  } catch {
    return { planId: null, aisles: [] }
  }
}

/**
 * Marca/desmarca una linea. Estado deseado (idempotente). Materializa on-demand la fila de check
 * de una linea derivada. Espejo de toggleShoppingItem. RLS = techo.
 */
export async function toggleShoppingItem(params: {
  clientId: string
  planId: string | null
  label: string
  category?: string | null
  isChecked: boolean
}): Promise<{ success: boolean; error?: string }> {
  const label = params.label.trim()
  if (!label) return { success: false, error: 'Etiqueta vacia' }
  try {
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
        .eq('id', (existing as any).id)
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
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo actualizar.' }
  }
}

/** Agrega un item MANUAL (idempotente por client+plan+label). Espejo de addManualItem. */
export async function addManualShoppingItem(params: {
  clientId: string
  planId: string | null
  label: string
  category?: string | null
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const label = params.label.trim()
  if (!label) return { success: false, error: 'Etiqueta vacia' }
  try {
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
    if (existing) return { success: true, id: (existing as any).id }

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
    return { success: true, id: (data as any).id }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo agregar.' }
  }
}

/** Borra un item MANUAL (solo is_manual=true). Espejo de removeManualItem. */
export async function removeManualShoppingItem(
  clientId: string,
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('shopping_list_items')
      .delete()
      .eq('id', itemId)
      .eq('client_id', clientId)
      .eq('is_manual', true)
    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo eliminar.' }
  }
}
