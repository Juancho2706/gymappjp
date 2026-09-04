import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NutritionV2CoachScopeSchema,
  coachFoodOverrideValuesFromRow,
  resolveFoodMacros,
  type CoachFoodOverrideRow,
  type CoachFoodOverrideValues,
  type NutritionMacrosBasis,
} from '@eva/nutrition-v2'
import type { Database } from '@/lib/database.types'
// Import server-side puro (el modulo NO es 'use client' y solo depende de `draft-builder`, que a su
// vez es zod + motor compartido): asi el criterio de "que alimentos referencia una plantilla" tiene
// UNA sola definicion para web y movil.
import { collectTemplateFoodIds } from '@eva/nutrition-v2'
import {
  listPlanTemplates,
  loadPlanTemplate,
  markPlanTemplateUsed,
} from '@/services/nutrition-v2/plan-templates.service'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  type NutritionV2ApiGate,
} from '../_shared'

/**
 * Plantillas de plan V2 para la app movil (F4 — "aplicar plantilla desde el builder RN").
 *
 * Espejo movil de las server actions web (`_actions/plan-templates.actions.ts` + la rama de origen
 * de `builder/page.tsx`). RN NUNCA lee `nutrition_plan_templates_v2` por Supabase directo: la RLS
 * es el techo, pero el gate de workspace y el bump de uso viven aca, en una sola puerta.
 *
 *  · `GET`            -> biblioteca del coach (lista para el picker "Reutilizar").
 *  · `GET ?id=<uuid>` -> la plantilla ABIERTA para aplicarla, con sus alimentos resueltos.
 *
 * El bump de `usage_count` va SOLO en la variante `?id=` porque es la unica que significa
 * "cargar-para-aplicar" (misma semantica que la web, donde el origen `?from=template:` la marca).
 */

const ROUTE = 'mobile.nutrition-v2.plan-templates'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function invalid(error: string) {
  return jsonNoStore({ ok: false, error, code: 'INVALID_PAYLOAD' }, 400)
}

function dbOf(gate: NutritionV2ApiGate): SupabaseClient<Database> {
  return gate.rpc as unknown as SupabaseClient<Database>
}

async function gateCoach(request: NextRequest, scope: unknown) {
  const parsedScope = NutritionV2CoachScopeSchema.safeParse(scope)
  if (!parsedScope.success) return { ok: false as const, response: invalid('Workspace inválido.') }

  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileCoach',
    coachScope: parsedScope.data,
  })
  if (!gate.ok) return gate
  if (!gate.coachId) {
    return {
      ok: false as const,
      response: jsonNoStore({ ok: false, error: 'Coach no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, 403),
    }
  }
  return { ok: true as const, gate }
}

// ─── Alimentos referenciados por la plantilla ────────────────────────────────────────────────
//
// Espejo de `builder/_data/plan-foods.data.ts`, con UNA diferencia obligada: alli el cliente sale
// de las cookies del RSC; aca sale del bearer del gate. El `select` es el mismo (una sola idea de
// "la fila de alimento que el wizard necesita para recalcular en vivo").
//
// El resultado es DISCRIMINADO igual que en web: si la lectura falla, `complete: false`. Degradarlo
// a "no hay alimentos" convertiria cada item de catalogo en un item libre SIN macros, y publicar
// escribiria ese plan mutilado.

const FOOD_SELECT =
  'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit, category, macros_basis'

/** Override del coach (T2.1). Mismas columnas que la rehidratacion web: una sola definicion. */
const OVERRIDE_SELECT =
  'food_id, calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams'

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
  macros_basis: string | null
}

type FoodQueryResult = { data: FoodRow[] | null; error: { message: string } | null }
type OverrideQueryResult = { data: CoachFoodOverrideRow[] | null; error: { message: string } | null }

// El cliente tipado no conoce todas las columnas nuevas del catalogo: misma tactica minima que
// `plan-foods.data.ts` / `item-substitutions.data.ts`.
interface FoodReadChain extends PromiseLike<FoodQueryResult> {
  in(column: string, values: readonly string[]): FoodReadChain
}
interface OverrideReadChain extends PromiseLike<OverrideQueryResult> {
  in(column: string, values: readonly string[]): OverrideReadChain
}
interface FoodReadDb {
  from(table: 'foods'): { select(columns: string): FoodReadChain }
  from(table: 'coach_food_overrides'): { select(columns: string): OverrideReadChain }
}

/** Alimento en el cable: lo minimo que necesita el port RN de `builderStateFromTemplateDraft`. */
interface TemplateFoodPayload {
  id: string
  name: string
  brand: string | null
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number | null
  servingSize: number
  servingUnit: string
  /**
   * Categoria canonica del catalogo (una de las 10 de `VALID_FOOD_CATEGORIES`, o null). Alimenta
   * el icono estatico de la fila del builder RN, igual que `plan-foods.data.ts` en web. Sin ella
   * TODO alimento de una plantilla caia al icono generico «otro».
   */
  category: string | null
  /** Base declarada de los macros de arriba (T2.1). El port RN la respeta al recalcular. */
  macrosBasis: NutritionMacrosBasis | null
}

async function templateFoods(
  db: SupabaseClient<Database>,
  foodIds: readonly string[],
): Promise<{ complete: boolean; foods: Record<string, TemplateFoodPayload> }> {
  const ids = [...new Set(foodIds.filter((id) => typeof id === 'string' && id !== ''))]
  if (ids.length === 0) return { complete: true, foods: {} }
  try {
    const reader = db as unknown as FoodReadDb
    const { data, error } = await reader.from('foods').select(FOOD_SELECT).in('id', ids)
    if (error || !data) {
      console.error('nutrition_v2_api_read', {
        source: 'mobile_template_foods',
        count: ids.length,
        message: error?.message ?? 'sin datos',
      })
      return { complete: false, foods: {} }
    }

    // Correcciones del coach en UNA lectura, acotadas por la RLS `cfo_*` a la sesion. Un fallo
    // aca no tumba la plantilla: se degrada al catalogo sin corregir.
    const overridesRes = await reader.from('coach_food_overrides').select(OVERRIDE_SELECT).in('food_id', ids)
    const overrides = new Map<string, CoachFoodOverrideValues>()
    if (overridesRes.error) {
      console.error('nutrition_v2_api_read', {
        source: 'mobile_template_food_overrides',
        count: ids.length,
        message: overridesRes.error.message,
      })
    } else {
      for (const row of overridesRes.data ?? []) {
        overrides.set(row.food_id, coachFoodOverrideValuesFromRow(row))
      }
    }

    const foods: Record<string, TemplateFoodPayload> = {}
    for (const row of data) {
      // El MISMO merge puro que el freeze y la rehidratacion web: esta es la cuarta copia del
      // camino, y lo unico que impide que las cuatro se separen es compartir la formula.
      const macros = resolveFoodMacros(
        {
          calories: row.calories,
          proteinG: row.protein_g,
          carbsG: row.carbs_g,
          fatsG: row.fats_g,
          fiberG: row.fiber_g,
          macrosBasis:
            row.macros_basis === 'per_100' || row.macros_basis === 'per_serving' ? row.macros_basis : null,
        },
        overrides.get(row.id) ?? null,
      )
      foods[row.id] = {
        id: row.id,
        name: row.name,
        brand: row.brand,
        calories: macros.calories,
        proteinG: macros.proteinG,
        carbsG: macros.carbsG,
        fatsG: macros.fatsG,
        fiberG: macros.fiberG,
        servingSize: row.serving_size,
        servingUnit: row.serving_unit ?? 'g',
        category: row.category ?? null,
        macrosBasis: macros.macrosBasis,
      }
    }
    // Un alimento que ya no se puede leer (borrado / fuera de scope) NO es un fallo: el adaptador
    // lo degrada a item libre con su nombre, igual que en web.
    return { complete: true, foods }
  } catch (err) {
    console.error('nutrition_v2_api_read', {
      source: 'mobile_template_foods',
      count: ids.length,
      message: err instanceof Error ? err.message : String(err),
    })
    return { complete: false, foods: {} }
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const params = request.nextUrl.searchParams
  const resolved = await gateCoach(request, {
    scopeType: params.get('scopeType'),
    teamId: params.get('teamId') || null,
    orgId: params.get('orgId') || null,
  })
  if (!resolved.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: resolved.response.status })
    return resolved.response
  }

  const db = dbOf(resolved.gate)
  const id = params.get('id')

  // Biblioteca (picker "Reutilizar"): orden favoritas → mas usadas → mas recientes, tal como lo
  // devuelve el repository. La UI NO reordena.
  if (!id) {
    const templates = await listPlanTemplates(db, { search: params.get('search') })
    const response = jsonNoStore({ ok: true, templates })
    logNutritionV2Api({ route: ROUTE, startedAt, status: response.status, payload: { count: templates.length } })
    return response
  }

  if (!UUID_RE.test(id)) {
    const response = invalid('Plantilla inválida.')
    logNutritionV2Api({ route: ROUTE, startedAt, status: response.status, errorCode: 'INVALID_PAYLOAD' })
    return response
  }

  const template = await loadPlanTemplate(db, id)
  if (!template) {
    const response = jsonNoStore(
      { ok: false, error: 'Esa plantilla ya no está disponible.', code: 'TEMPLATE_NOT_FOUND' },
      404,
    )
    logNutritionV2Api({ route: ROUTE, startedAt, status: response.status, errorCode: 'TEMPLATE_NOT_FOUND' })
    return response
  }

  const foods = await templateFoods(db, collectTemplateFoodIds(template.draft as never))

  // Cargar-para-aplicar cuenta como uso (espejo de `builder/page.tsx`). Best-effort por dentro: el
  // servicio se traga cualquier error para no impedir abrir el builder.
  //
  // `purpose=edit` (editor unico RN, T3.3b) NO cuenta: abrir una plantilla para EDITARLA no es
  // usarla, y el contador ordena la biblioteca por uso real — mismo criterio que el editor web,
  // que tampoco la marca. Cualquier otro valor (incluida su ausencia) conserva el bump.
  const editing = params.get('purpose') === 'edit'
  if (!editing) await markPlanTemplateUsed(db, template)

  const response = jsonNoStore({
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      draft: template.draft,
      builder: template.builder ?? null,
      usageCount: template.usageCount,
      foods: foods.foods,
      /** false ⇒ la lectura del catalogo fallo: RN NO debe aplicar el adaptador sobre el draft. */
      foodsComplete: foods.complete,
    },
  })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}
