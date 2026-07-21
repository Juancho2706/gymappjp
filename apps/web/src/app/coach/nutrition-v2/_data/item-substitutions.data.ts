import 'server-only'

import {
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  mapNutritionItemSubstitutionRow,
  type NutritionItemSubstitutionRead,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'

// Carry-over F-02 (data-loader del coach): los reemplazos autorizados NO viajan en el
// read-model hot-path; se leen aparte, directo de la tabla RLS-scoped
// (`nutrition_item_substitutions_v2`, policy can_read_version: coach de su pool), y el
// quick-edit los inyecta por prescriptionItemId para NO borrarlos al republicar. Lectura
// pura, fail-soft: un error o un plan sin reemplazos devuelve [] (nunca rompe la ficha).

/** Fila cruda (snake_case) que espera `mapNutritionItemSubstitutionRow`. */
type SubstitutionRow = Parameters<typeof mapNutritionItemSubstitutionRow>[0]

type SubQueryResult = { data: SubstitutionRow[] | null; error: { message: string } | null }

// El cliente tipado generado todavia no conoce la tabla nueva (types sin regenerar): misma
// tactica que `plan-persistence.NutritionV2Db` — una interfaz minima para un SELECT tipado.
interface SubReadChain extends PromiseLike<SubQueryResult> {
  eq(column: string, value: unknown): SubReadChain
  order(column: string, options: { ascending: boolean }): SubReadChain
}
interface SubReadDb {
  from(table: string): { select(columns: string): SubReadChain }
}

/**
 * Reemplazos autorizados congelados de una version del plan (RLS-scoped por el cliente del
 * coach). Ordenados por item + order_index para preservar el orden del coach. `versionId`
 * vacio/nulo => [] sin tocar la base.
 */
export async function fetchItemSubstitutionsForVersion(
  versionId: string | null | undefined,
): Promise<NutritionItemSubstitutionRead[]> {
  if (!versionId) return []
  try {
    const db = (await createClient()) as unknown as SubReadDb
    const { data, error } = await db
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .eq('version_id', versionId)
      .order('prescription_item_id', { ascending: true })
      .order('order_index', { ascending: true })
    if (error || !data) return []
    return data.map(mapNutritionItemSubstitutionRow)
  } catch {
    return []
  }
}
