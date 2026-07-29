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
// quick-edit los inyecta por prescriptionItemId para NO borrarlos al republicar.
//
// El resultado es DISCRIMINADO a proposito (NUT-008): un fallo de lectura NO puede
// degradarse a `[]`, porque publicar reescribe el arbol COMPLETO y un mapa vacio borraria
// en silencio todos los reemplazos del alumno. `ok:false` viaja hasta la UI, que bloquea
// "Publicar" y ofrece reintentar. Un plan sin reemplazos es `ok:true` con `rows: []`.

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
 * Resultado discriminado de la lectura de reemplazos: `ok:false` = no sabemos que hay
 * (error de RLS/red/timeout), NUNCA "no hay". El caller debe bloquear la republicacion.
 */
export type ItemSubstitutionsLoad =
  | { ok: true; rows: NutritionItemSubstitutionRead[] }
  | { ok: false }

/**
 * Reemplazos autorizados congelados de una version del plan (RLS-scoped por el cliente del
 * coach). Ordenados por item + order_index para preservar el orden del coach. `versionId`
 * vacio/nulo => `ok:true` con `rows: []` sin tocar la base (no hay version que leer).
 * Cualquier error se loguea (espejo del `nutrition_v2_web_read` del lado alumno) y devuelve
 * `ok:false`.
 */
export async function fetchItemSubstitutionsForVersion(
  versionId: string | null | undefined,
): Promise<ItemSubstitutionsLoad> {
  if (!versionId) return { ok: true, rows: [] }
  try {
    const db = (await createClient()) as unknown as SubReadDb
    const { data, error } = await db
      .from('nutrition_item_substitutions_v2')
      .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
      .eq('version_id', versionId)
      .order('prescription_item_id', { ascending: true })
      .order('order_index', { ascending: true })
    if (error || !data) {
      console.error('nutrition_v2_web_read', {
        source: 'item_substitutions',
        versionId,
        message: error?.message ?? 'sin datos',
      })
      return { ok: false }
    }
    return { ok: true, rows: data.map(mapNutritionItemSubstitutionRow) }
  } catch (err) {
    console.error('nutrition_v2_web_read', {
      source: 'item_substitutions',
      versionId,
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false }
  }
}
