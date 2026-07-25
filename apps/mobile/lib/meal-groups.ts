import { calculateFoodItemMacros } from '@eva/nutrition-engine'
import { supabase } from './supabase'
import { getCoachOrgContext } from './org'
import { foodToDraftItem, type DraftFoodItem, type FoodRow } from './nutrition-builder'

/**
 * E5-18 · Grupos de comidas (`saved_meals` + `saved_meal_items`) — espejo de
 * `apps/web/src/app/coach/meal-groups/_data/meal-groups.queries.ts` +
 * `_actions/meal-groups.actions.ts`.
 *
 * Un grupo = conjunto reutilizable de alimentos con cantidad+unidad (ej. "Desayuno
 * proteico"). El coach los crea en su librería personal y los aplica como comida en
 * el builder. Escritura DIRECTA vía PostgREST bajo la sesión del coach: la RLS
 * `saved_meals_coach` (`coach_id = auth.uid()`) + `saved_meal_items_access`
 * (dueño del saved_meal) son el guardián — la web escribe con la misma RLS
 * user-scoped, así que es equivalente y seguro.
 *
 * `org_id` se deriva del workspace ACTIVO (enterprise), NUNCA del body — igual que
 * web `saveMealGroup`. Los artefactos internos `Internal_*` que crea el guardado de
 * plantillas se ocultan de la librería (mismo filtro que web `getMealGroups`).
 */

export interface MealGroupItem {
  id?: string
  food_id: string
  quantity: number
  unit: string
  food: FoodRow | null
}

export interface MealGroupRow {
  id: string
  name: string
  org_id: string | null
  items: MealGroupItem[]
}

const GROUP_SELECT =
  'id, name, org_id, items:saved_meal_items(id, food_id, quantity, unit, food:foods(id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid, category, brand))'

async function currentCoachId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Grupos de la librería del coach (scope org derivado del workspace activo).
 * Oculta los artefactos internos `Internal_*` del guardado de plantillas.
 */
export async function listMealGroups(): Promise<MealGroupRow[]> {
  const coachId = await currentCoachId()
  if (!coachId) return []
  const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
  let query = supabase
    .from('saved_meals')
    .select(GROUP_SELECT)
    .eq('coach_id', coachId)
    // Escapa el `_` (comodín en LIKE) para no borrar grupos legítimos con guión bajo.
    .not('name', 'like', 'Internal\\_%')
    .order('name')
  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
  const { data } = await query
  return ((data ?? []) as any[]).map((g) => ({
    id: g.id,
    name: g.name,
    org_id: g.org_id ?? null,
    items: (g.items ?? []) as MealGroupItem[],
  }))
}

export interface SaveMealGroupInput {
  id?: string
  name: string
  items: { food_id: string; quantity: number; unit?: string }[]
}

/**
 * Crea o actualiza un grupo (INSERT o UPDATE + reemplazo total de items).
 * Devuelve el grupo completo (con `food` embebido) para refrescar la UI sin recargar.
 */
export async function saveMealGroup(
  input: SaveMealGroupInput
): Promise<{ ok: boolean; group?: MealGroupRow; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const name = input.name.trim()
  if (name.length < 1) return { ok: false, error: 'Indicá un nombre para el grupo.' }
  if (!input.items.length) return { ok: false, error: 'Agrega al menos un alimento.' }

  try {
    let groupId = input.id
    if (groupId) {
      const { error: upErr } = await supabase
        .from('saved_meals')
        .update({ name })
        .eq('id', groupId)
        .eq('coach_id', coachId)
      if (upErr) throw upErr
      const { error: delErr } = await supabase.from('saved_meal_items').delete().eq('saved_meal_id', groupId)
      if (delErr) throw delErr
    } else {
      // org_id del workspace ACTIVO (enterprise), nunca del body — igual que web.
      const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
      const { data: created, error: insErr } = await supabase
        .from('saved_meals')
        .insert({ name, coach_id: coachId, org_id: orgId })
        .select('id')
        .single()
      if (insErr) throw insErr
      groupId = (created as { id: string }).id
    }

    const { error: itemsErr } = await supabase.from('saved_meal_items').insert(
      input.items.map((it) => ({
        saved_meal_id: groupId!,
        food_id: it.food_id,
        // Persiste la cantidad CRUDA (permite fracciones como la web,
        // MealGroupModal.tsx:163); antes hacía `Math.round`, perdiendo decimales.
        quantity: Number(it.quantity) || 0,
        unit: it.unit || 'g',
      }))
    )
    if (itemsErr) throw itemsErr

    const { data: full, error: fetchErr } = await supabase
      .from('saved_meals')
      .select(GROUP_SELECT)
      .eq('id', groupId)
      .single()
    if (fetchErr) throw fetchErr
    const g = full as any
    return {
      ok: true,
      group: { id: g.id, name: g.name, org_id: g.org_id ?? null, items: (g.items ?? []) as MealGroupItem[] },
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'No se pudo guardar el grupo.' }
  }
}

/** Borra un grupo del coach. Los items caen por ON DELETE CASCADE. */
export async function deleteMealGroup(groupId: string): Promise<{ ok: boolean; error?: string }> {
  const coachId = await currentCoachId()
  if (!coachId) return { ok: false, error: 'No autenticado.' }
  const { error } = await supabase.from('saved_meals').delete().eq('id', groupId).eq('coach_id', coachId)
  if (error) return { ok: false, error: 'No se pudo eliminar el grupo.' }
  return { ok: true }
}

/**
 * E5-18 (builder hook) — "guardar comida como grupo".
 * Crea un `saved_meal` nuevo desde los alimentos actuales de una comida del builder.
 * El botón que lo dispara vive en `nutrition-builder.tsx` (lo cablea el worker del
 * builder — ver INTEGRACIÓN); esta función es la acción exportada lista para usar:
 *
 *   await saveMealAsGroup(meal.name, meal.items.map(i => ({ food_id: i.food_id, quantity: i.quantity, unit: i.unit })))
 */
export async function saveMealAsGroup(
  name: string,
  items: { food_id: string; quantity: number; unit?: string }[]
): Promise<{ ok: boolean; group?: MealGroupRow; error?: string }> {
  return saveMealGroup({ name, items })
}

/**
 * Macros de UN ítem del grupo vía el motor compartido `@eva/nutrition-engine`
 * (mismo consumo que la web `MealGroupLibraryClient`/`MealGroupModal`). Devuelve
 * valores a 1 decimal (el redondeo del motor); la UI aplica su propio `Math.round`
 * al mostrar, igual que la web. Para `un` el factor usa `serving_size` del alimento
 * — NO la cantidad cruda —, corrigiendo el bug de datos visibles inflados.
 */
export function mealGroupItemMacros(item: MealGroupItem): {
  calories: number
  protein: number
  carbs: number
  fats: number
} {
  const f = item.food
  const m = calculateFoodItemMacros({
    quantity: Number(item.quantity) || 0,
    // Filas legacy usan `u`; el motor trata toda unidad no g/ml como count, pero
    // normalizamos a `un` para que el contrato visible sea el mismo que la web.
    unit: item.unit === 'u' ? 'un' : (item.unit ?? 'g'),
    foods: {
      id: f?.id,
      name: f?.name ?? '',
      calories: Number(f?.calories) || 0,
      protein_g: Number(f?.protein_g) || 0,
      carbs_g: Number(f?.carbs_g) || 0,
      fats_g: Number(f?.fats_g) || 0,
      serving_size: Number(f?.serving_size) || 100,
      serving_unit: f?.serving_unit ?? null,
    },
  })
  return { calories: m.calories, protein: m.protein, carbs: m.carbs, fats: m.fats }
}

/** Totales de macros de un grupo (suma de los macros por ítem del motor, 1:1 web `calculateTotals`). */
export function mealGroupTotals(items: MealGroupItem[]): {
  calories: number
  protein: number
  carbs: number
  fats: number
} {
  return items.reduce(
    (acc, item) => {
      const m = mealGroupItemMacros(item)
      acc.calories += m.calories
      acc.protein += m.protein
      acc.carbs += m.carbs
      acc.fats += m.fats
      return acc
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}

/**
 * Convierte un grupo en `DraftFoodItem[]` para APLICARLO en el builder (insertar sus
 * alimentos en una comida). Respeta la cantidad+unidad guardadas del grupo. El
 * cableado del "tab Grupos" del food-search del builder lo hace el worker del builder
 * (ver INTEGRACIÓN); este helper deja los items listos.
 */
export function groupToDraftItems(group: MealGroupRow): DraftFoodItem[] {
  const out: DraftFoodItem[] = []
  for (const item of group.items) {
    if (!item.food) continue
    const draft = foodToDraftItem(item.food)
    out.push({ ...draft, quantity: Number(item.quantity) || draft.quantity, unit: item.unit || draft.unit })
  }
  return out
}
