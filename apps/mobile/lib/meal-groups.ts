import { supabase } from './supabase'
import { calculateFoodItemMacros, type FoodItemForMacros } from './nutrition-utils'

// Meal Groups (grupos de comidas reutilizables) — mirror de la web
// apps/web/.../coach/meal-groups. Tablas saved_meals (cabecera por coach,
// org_id null en standalone) → saved_meal_items (ingredientes). Escribe bajo la
// sesión del coach (RLS coach_id = auth.uid()). NO service-role.

export type MealGroupFood = {
  id: string
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
}

export type MealGroupItem = {
  id?: string
  food_id: string
  quantity: number
  unit: string // 'g' | 'ml' | 'un'
  food: MealGroupFood
}

export type MealGroup = {
  id: string
  name: string
  items: MealGroupItem[]
}

export type MacroTotals = { calories: number; protein: number; carbs: number; fats: number }

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Suma macros de un grupo usando el motor canónico (calculateFoodItemMacros). */
export function calculateGroupTotals(items: MealGroupItem[]): MacroTotals {
  return items.reduce<MacroTotals>(
    (acc, item) => {
      const fi: FoodItemForMacros = {
        quantity: Number(item.quantity) || 0,
        unit: item.unit ?? 'g',
        foods: {
          name: item.food?.name ?? '',
          calories: Number(item.food?.calories) || 0,
          protein_g: Number(item.food?.protein_g) || 0,
          carbs_g: Number(item.food?.carbs_g) || 0,
          fats_g: Number(item.food?.fats_g) || 0,
          serving_size: Number(item.food?.serving_size) || 100,
          serving_unit: item.food?.serving_unit ?? null,
        },
      }
      const m = calculateFoodItemMacros(fi)
      acc.calories += m.calories
      acc.protein += m.protein
      acc.carbs += m.carbs
      acc.fats += m.fats
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

const GROUP_SELECT =
  '*, items:saved_meal_items(id, food_id, quantity, unit, food:foods(id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit))'

function normalizeGroup(raw: any): MealGroup {
  return {
    id: raw.id,
    name: raw.name ?? '',
    items: Array.isArray(raw.items)
      ? raw.items
          .filter((it: any) => it?.food)
          .map((it: any) => ({
            id: it.id,
            food_id: it.food_id ?? it.food?.id,
            quantity: Number(it.quantity) || 0,
            unit: it.unit ?? 'g',
            food: {
              id: it.food.id,
              name: it.food.name ?? '',
              calories: Number(it.food.calories) || 0,
              protein_g: Number(it.food.protein_g) || 0,
              carbs_g: Number(it.food.carbs_g) || 0,
              fats_g: Number(it.food.fats_g) || 0,
              serving_size: Number(it.food.serving_size) || 100,
              serving_unit: it.food.serving_unit ?? null,
            },
          }))
      : [],
  }
}

/** Librería personal del coach (standalone): org_id null. */
export async function listMealGroups(): Promise<MealGroup[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { data } = await supabase
    .from('saved_meals')
    .select(GROUP_SELECT)
    .eq('coach_id', coachId)
    .is('org_id', null)
    .order('name')
  return (data ?? []).map(normalizeGroup)
}

export type SaveMealGroupInput = {
  id?: string
  name: string
  items: { food_id: string; quantity: number; unit: string }[]
}

/**
 * Crea/edita un grupo. Igual que la web: en edición actualiza el nombre, borra
 * todos los items y reinserta (no hay logs colgando de saved_meal_items).
 */
export async function saveMealGroup(
  input: SaveMealGroupInput
): Promise<{ ok: boolean; group?: MealGroup; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  if (!input.name.trim()) return { ok: false, error: 'Indicá un nombre para el grupo.' }
  if (input.items.length === 0) return { ok: false, error: 'Agregá al menos un ingrediente.' }

  try {
    let groupId = input.id

    if (groupId) {
      const { error: updErr } = await supabase
        .from('saved_meals')
        .update({ name: input.name.trim() })
        .eq('id', groupId)
        .eq('coach_id', coachId)
      if (updErr) throw updErr

      const { error: delErr } = await supabase
        .from('saved_meal_items')
        .delete()
        .eq('saved_meal_id', groupId)
      if (delErr) throw delErr
    } else {
      const { data: newGroup, error: insErr } = await supabase
        .from('saved_meals')
        .insert({ name: input.name.trim(), coach_id: coachId, org_id: null })
        .select('id')
        .single()
      if (insErr) throw insErr
      groupId = newGroup.id
    }

    const itemsToInsert = input.items.map((it) => ({
      saved_meal_id: groupId!,
      food_id: it.food_id,
      quantity: it.quantity,
      unit: it.unit || 'g',
    }))
    const { error: itemsErr } = await supabase.from('saved_meal_items').insert(itemsToInsert)
    if (itemsErr) throw itemsErr

    const { data: full, error: fetchErr } = await supabase
      .from('saved_meals')
      .select(GROUP_SELECT)
      .eq('id', groupId)
      .single()
    if (fetchErr) throw fetchErr

    return { ok: true, group: normalizeGroup(full) }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el grupo.' }
  }
}

export async function deleteMealGroup(groupId: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  try {
    const { error } = await supabase
      .from('saved_meals')
      .delete()
      .eq('id', groupId)
      .eq('coach_id', coachId)
    if (error) throw error
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo eliminar el grupo.' }
  }
}
