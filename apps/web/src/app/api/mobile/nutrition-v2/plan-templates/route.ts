import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NutritionV2CoachScopeSchema } from '@eva/nutrition-v2'
import type { Database } from '@/lib/database.types'
// Import server-side puro (el modulo NO es 'use client' y solo depende de `draft-builder`, que a su
// vez es zod + motor compartido): asi el criterio de "que alimentos referencia una plantilla" tiene
// UNA sola definicion para web y movil.
import { collectTemplateFoodIds } from '@/app/coach/nutrition-v2/[clientId]/builder/_lib/rehydrate'
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

const FOOD_SELECT = 'id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit'

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
}

type FoodQueryResult = { data: FoodRow[] | null; error: { message: string } | null }

// El cliente tipado no conoce todas las columnas nuevas del catalogo: misma tactica minima que
// `plan-foods.data.ts` / `item-substitutions.data.ts`.
interface FoodReadChain extends PromiseLike<FoodQueryResult> {
  in(column: string, values: readonly string[]): FoodReadChain
}
interface FoodReadDb {
  from(table: string): { select(columns: string): FoodReadChain }
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
}

async function templateFoods(
  db: SupabaseClient<Database>,
  foodIds: readonly string[],
): Promise<{ complete: boolean; foods: Record<string, TemplateFoodPayload> }> {
  const ids = [...new Set(foodIds.filter((id) => typeof id === 'string' && id !== ''))]
  if (ids.length === 0) return { complete: true, foods: {} }
  try {
    const { data, error } = await (db as unknown as FoodReadDb).from('foods').select(FOOD_SELECT).in('id', ids)
    if (error || !data) {
      console.error('nutrition_v2_api_read', {
        source: 'mobile_template_foods',
        count: ids.length,
        message: error?.message ?? 'sin datos',
      })
      return { complete: false, foods: {} }
    }
    const foods: Record<string, TemplateFoodPayload> = {}
    for (const row of data) {
      foods[row.id] = {
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
  await markPlanTemplateUsed(db, template)

  const response = jsonNoStore({
    ok: true,
    template: {
      id: template.id,
      name: template.name,
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
