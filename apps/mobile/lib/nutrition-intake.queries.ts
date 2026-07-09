import { supabase } from './supabase'
import { calculateFoodItemMacros } from './nutrition-utils'

/**
 * Off-plan intake (registro fuera de plan) — capa de datos del ALUMNO en mobile.
 *
 * Paridad funcional con la web (`services/nutrition-intake.service.ts` +
 * `_actions/intake.actions.ts`). A diferencia de la web (que va por server action),
 * el alumno mobile escribe DIRECTO por PostgREST con su sesión — igual que el resto
 * de la nutrición del alumno (`toggleMealCompletion`, `updateMealConsumedPortion`…).
 *
 * SEGURIDAD (feature BASE tier, NO gated → sin money-safety gate):
 * `nutrition_intake_entries` es client-scoped por RLS. La única policy de escritura
 * es `nutrition_intake_client_all` → `auth.uid() = client_id` (USING + WITH CHECK)
 * con GRANT INSERT/UPDATE/DELETE a `authenticated`
 * (migración `20260618180002_nutrition_intake_entries.sql`). El `clientId` que se
 * pasa acá NO es la fuente de autorización: la RLS + la sesión lo son. Un alumno no
 * puede insertar/leer/borrar filas de otro `client_id` aunque manipule el argumento.
 */

export type IntakeUnit = 'g' | 'ml' | 'un'
export type IntakeSource = 'offplan' | 'quickadd' | 'recent' | 'copy'

/** Subconjunto del catálogo resuelto para calcular macros de una entrada. */
export interface IntakeFood {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
  is_liquid: boolean | null
}

export interface IntakeEntry {
  id: string
  log_date: string
  food_id: string | null
  custom_name: string | null
  quantity: number
  unit: string
  source: string
  created_at: string
  food: IntakeFood | null
}

export interface IntakeMacros {
  calories: number
  protein: number
  carbs: number
  fats: number
}

const FOOD_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, is_liquid'
const ENTRY_SELECT = `id, log_date, food_id, custom_name, quantity, unit, source, created_at, food:foods(${FOOD_SELECT})`

const SEARCH_MIN_CHARS = 2

/**
 * Busca alimentos del catálogo visibles para el alumno (RLS de `foods`: globales +
 * los del coach del alumno). Búsqueda por nombre (ilike), igual que el food picker
 * mobile del coach (`nutrition-builder.searchFoods`).
 */
export async function searchIntakeFoods(term: string, limit = 30): Promise<IntakeFood[]> {
  const trimmed = term.trim()
  if (trimmed.length < SEARCH_MIN_CHARS) return []
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_SELECT)
    .ilike('name', `%${trimmed}%`)
    .order('name')
    .limit(limit)
  if (error || !data) return []
  return data as unknown as IntakeFood[]
}

/** Entradas de intake del alumno para un día (YYYY-MM-DD), más viejas primero. */
export async function listIntakeEntriesForDate(
  clientId: string,
  isoDate: string
): Promise<IntakeEntry[]> {
  const { data, error } = await supabase
    .from('nutrition_intake_entries')
    .select(ENTRY_SELECT)
    .eq('client_id', clientId)
    .eq('log_date', isoDate)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data as unknown as IntakeEntry[]
}

/**
 * Alimentos del catálogo usados recientemente por el alumno (dedupe por uso más
 * reciente). Para el quick-add de "Recientes". Solo entradas con `food_id`.
 */
export async function listRecentIntakeFoods(clientId: string, limit = 8): Promise<IntakeFood[]> {
  const { data, error } = await supabase
    .from('nutrition_intake_entries')
    .select(`food_id, created_at, food:foods(${FOOD_SELECT})`)
    .eq('client_id', clientId)
    .not('food_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit * 4)
  if (error || !data) return []

  const seen = new Set<string>()
  const out: IntakeFood[] = []
  for (const row of data as unknown as Array<{ food_id: string | null; food: IntakeFood | null }>) {
    if (!row.food || !row.food_id || seen.has(row.food_id)) continue
    seen.add(row.food_id)
    out.push(row.food)
    if (out.length >= limit) break
  }
  return out
}

export interface InsertIntakeInput {
  clientId: string
  logDate: string
  foodId?: string | null
  customName?: string | null
  quantity: number
  unit: IntakeUnit
  source?: IntakeSource
}

/** Inserta una entrada fuera de plan y devuelve la fila con el alimento resuelto. */
export async function insertIntakeEntry(input: InsertIntakeInput): Promise<IntakeEntry | null> {
  if (!(input.foodId || input.customName)) return null
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return null

  const { data, error } = await supabase
    .from('nutrition_intake_entries')
    .insert({
      client_id: input.clientId,
      log_date: input.logDate,
      food_id: input.foodId ?? null,
      custom_name: input.customName ?? null,
      quantity: input.quantity,
      unit: input.unit,
      source: input.source ?? 'offplan',
    })
    .select(ENTRY_SELECT)
    .single()
  if (error || !data) return null
  return data as unknown as IntakeEntry
}

/** Borra una entrada del alumno (RLS exige propiedad). */
export async function deleteIntakeEntry(clientId: string, entryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('nutrition_intake_entries')
    .delete()
    .eq('id', entryId)
    .eq('client_id', clientId)
  return !error
}

/**
 * Macros de UNA entrada. Reusa `calculateFoodItemMacros` (misma escala g/ml = qty/100,
 * un = qty*serving_size/100 que el resto de la nutrición mobile). Entradas de nombre
 * libre (sin `food`) no aportan macros conocidos → 0.
 */
export function intakeEntryMacros(entry: IntakeEntry): IntakeMacros {
  if (!entry.food) return { calories: 0, protein: 0, carbs: 0, fats: 0 }
  const m = calculateFoodItemMacros({
    quantity: entry.quantity,
    unit: entry.unit,
    foods: {
      id: entry.food.id,
      name: entry.food.name,
      calories: entry.food.calories,
      protein_g: entry.food.protein_g,
      carbs_g: entry.food.carbs_g,
      fats_g: entry.food.fats_g,
      serving_size: entry.food.serving_size,
      serving_unit: entry.food.serving_unit,
    },
  })
  return { calories: m.calories, protein: m.protein, carbs: m.carbs, fats: m.fats }
}

/** Suma las macros de todas las entradas de un día (el "extra" fuera de plan). */
export function sumIntakeMacros(entries: IntakeEntry[]): IntakeMacros {
  return entries.reduce<IntakeMacros>(
    (acc, e) => {
      const m = intakeEntryMacros(e)
      return {
        calories: Math.round((acc.calories + m.calories) * 10) / 10,
        protein: Math.round((acc.protein + m.protein) * 10) / 10,
        carbs: Math.round((acc.carbs + m.carbs) * 10) / 10,
        fats: Math.round((acc.fats + m.fats) * 10) / 10,
      }
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  )
}
