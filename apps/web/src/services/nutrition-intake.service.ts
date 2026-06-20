import { SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

/**
 * Off-plan intake (registro fuera de plan) del alumno.
 *
 * Tabla `nutrition_intake_entries` es client-scoped por RLS: el alumno solo
 * lee/escribe sus propias filas (`client_id = auth.uid()`). Estos helpers
 * reciben el `SupabaseClient` del servidor (cookies de sesión) — la RLS hace
 * cumplir el scope. Pasamos `clientId` para filtrar/insertar explícitamente,
 * pero NUNCA es la fuente de autorización: eso lo da la sesión + RLS.
 */

type IntakeEntryRow = Database['public']['Tables']['nutrition_intake_entries']['Row']

export type IntakeSource = 'manual' | 'recipe' | 'plan'

/** Subconjunto del catálogo de alimentos resuelto para una entrada. */
export type IntakeFoodRef = {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  serving_size: number
  serving_unit: string | null
  household_grams: number | null
  household_label: string | null
  is_liquid: boolean
}

/** Entrada de intake con el alimento del catálogo resuelto (si aplica). */
export type IntakeEntryWithFood = IntakeEntryRow & {
  food: IntakeFoodRef | null
}

const FOOD_REF_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, household_grams, household_label, is_liquid'

const INTAKE_SELECT = `*, food:foods(${FOOD_REF_SELECT})`

export type InsertIntakeEntryInput = {
  clientId: string
  logDate: string
  foodId?: string | null
  customName?: string | null
  quantity: number
  unit: string
  source?: IntakeSource
}

export class NutritionIntakeService {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Inserta una entrada de intake fuera de plan para el alumno autenticado.
   * RLS garantiza que `clientId` debe coincidir con `auth.uid()`.
   */
  async insertIntakeEntry(input: InsertIntakeEntryInput): Promise<IntakeEntryWithFood | null> {
    const { data, error } = await this.supabase
      .from('nutrition_intake_entries')
      .insert({
        client_id: input.clientId,
        log_date: input.logDate,
        food_id: input.foodId ?? null,
        custom_name: input.customName ?? null,
        quantity: input.quantity,
        unit: input.unit,
        source: input.source ?? 'manual',
      })
      .select(INTAKE_SELECT)
      .single()

    if (error || !data) return null
    return data as unknown as IntakeEntryWithFood
  }

  /** Lista las entradas de intake del alumno para un día (YYYY-MM-DD). */
  async listIntakeEntriesForDate(
    clientId: string,
    isoDate: string
  ): Promise<IntakeEntryWithFood[]> {
    const { data, error } = await this.supabase
      .from('nutrition_intake_entries')
      .select(INTAKE_SELECT)
      .eq('client_id', clientId)
      .eq('log_date', isoDate)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data as unknown as IntakeEntryWithFood[]
  }

  /**
   * Alimentos del catálogo usados recientemente por el alumno en su intake,
   * deduplicados y ordenados por uso más reciente. Para sugerencias de "volver
   * a registrar". Solo entradas que referencian el catálogo (`food_id` no nulo).
   */
  async listRecentIntakeFoods(clientId: string, limit = 10): Promise<IntakeFoodRef[]> {
    const { data, error } = await this.supabase
      .from('nutrition_intake_entries')
      .select(`food_id, created_at, food:foods(${FOOD_REF_SELECT})`)
      .eq('client_id', clientId)
      .not('food_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit * 4)

    if (error || !data) return []

    const seen = new Set<string>()
    const out: IntakeFoodRef[] = []
    for (const row of data as unknown as Array<{ food_id: string | null; food: IntakeFoodRef | null }>) {
      if (!row.food || !row.food_id || seen.has(row.food_id)) continue
      seen.add(row.food_id)
      out.push(row.food)
      if (out.length >= limit) break
    }
    return out
  }

  /** Borra una entrada de intake del alumno (RLS exige propiedad). */
  async deleteIntakeEntry(clientId: string, entryId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('nutrition_intake_entries')
      .delete()
      .eq('id', entryId)
      .eq('client_id', clientId)

    return !error
  }
}
