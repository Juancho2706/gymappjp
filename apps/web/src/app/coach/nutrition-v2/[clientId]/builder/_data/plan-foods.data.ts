import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { BuilderFood } from '../_lib/draft-builder'

/**
 * Alimentos del plan vigente para la REHIDRATACION del wizard (FD1c).
 *
 * El read-model del plan trae las macros CONGELADAS de cada item (las de la cantidad
 * prescrita), no las del alimento por 100 g/porcion, que es lo que el wizard necesita para
 * recalcular en vivo cuando el coach cambia una cantidad. Se leen aparte, RLS-scoped, con el
 * MISMO select que usa `plan-persistence` al congelar (una sola definicion de la fila).
 *
 * Resultado DISCRIMINADO a proposito (mismo criterio que `item-substitutions.data.ts`): un
 * fallo de lectura NO se degrada a "no hay alimentos" — la pagina cae al guard anti-colapso
 * en vez de rehidratar un plan con items mutilados.
 */

interface FoodRow {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  serving_size: number
  serving_unit: string | null
  category: string | null
}

const FOOD_SELECT = 'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, category'

type FoodQueryResult = { data: FoodRow[] | null; error: { message: string } | null }

// El cliente tipado no conoce todas las columnas nuevas del catalogo: misma tactica que
// `plan-persistence.NutritionV2Db` / `item-substitutions.data.ts` — interfaz minima tipada.
interface FoodReadChain extends PromiseLike<FoodQueryResult> {
  in(column: string, values: readonly string[]): FoodReadChain
}
interface FoodReadDb {
  from(table: string): { select(columns: string): FoodReadChain }
}

export type PlanFoodsLoad = { ok: true; foods: Record<string, BuilderFood> } | { ok: false }

function toBuilderFood(row: FoodRow): BuilderFood {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatsG: row.fats_g,
    fiberG: row.fiber_g,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit ?? 'g',
    // La categoria viaja desde el catalogo: la rehidratacion de PLANTILLAS no pasa por el
    // read-model del plan (que la resuelve en lectura), asi que sin esta columna todos los
    // items de una plantilla caian al icono generico de cubiertos ("otro").
    category: row.category ?? null,
    // La foto del producto si la aporta solo el read-model (join a food_media): aca queda
    // null y la card muestra el icono de categoria.
    media: null,
  }
}

/** Lee los alimentos del catalogo por id (RLS-scoped). Sin ids => `ok:true` sin consultar. */
export async function fetchBuilderFoodsByIds(foodIds: readonly string[]): Promise<PlanFoodsLoad> {
  const ids = [...new Set(foodIds.filter((id) => typeof id === 'string' && id !== ''))]
  if (ids.length === 0) return { ok: true, foods: {} }
  try {
    const db = (await createClient()) as unknown as FoodReadDb
    const { data, error } = await db.from('foods').select(FOOD_SELECT).in('id', ids)
    if (error || !data) {
      console.error('nutrition_v2_web_read', {
        source: 'builder_rehydrate_foods',
        count: ids.length,
        message: error?.message ?? 'sin datos',
      })
      return { ok: false }
    }
    const foods: Record<string, BuilderFood> = {}
    for (const row of data) foods[row.id] = toBuilderFood(row)
    // Un alimento que ya no se puede leer (borrado / fuera de scope) NO es un fallo: la
    // rehidratacion lo reconstruye desde el snapshot congelado del item.
    return { ok: true, foods }
  } catch (err) {
    console.error('nutrition_v2_web_read', {
      source: 'builder_rehydrate_foods',
      count: ids.length,
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: false }
  }
}
