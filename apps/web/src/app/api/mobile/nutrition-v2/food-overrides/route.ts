import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CoachFoodOverrideInputSchema, NutritionV2CoachScopeSchema } from '@eva/nutrition-v2'
import type { Database } from '@/lib/database.types'
import {
  restoreCatalogFoodMacros,
  saveCoachFoodOverride,
} from '@/services/nutrition-v2/coach-food-overrides.service'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  type NutritionV2ApiGate,
} from '../_shared'

/**
 * Correcciones de macros del coach desde RN (T2.2). Espejo de las server actions de la web:
 * mismo servicio, mismo dueño derivado del actor, misma RLS de techo. La app movil no tiene
 * server actions, asi que este es su unico camino de escritura — igual que `exchange-groups`.
 */

const ROUTE = 'mobile.nutrition-v2.food-overrides'

const SaveSchema = CoachFoodOverrideInputSchema.and(
  z.object({ workspace: z.unknown() }).partial(),
)
const RestoreSchema = z.object({ foodId: z.string().uuid() })

function invalid(error: string) {
  return jsonNoStore({ error, code: 'INVALID_PAYLOAD' }, 400)
}

function dbOf(gate: NutritionV2ApiGate): SupabaseClient<Database> {
  return gate.rpc as unknown as SupabaseClient<Database>
}

async function gateCoach(request: NextRequest, scope: unknown) {
  const parsedScope = NutritionV2CoachScopeSchema.safeParse(scope)
  if (!parsedScope.success) return { ok: false as const, response: invalid('Workspace inválido.') }

  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileCoach',
    mutation: true,
    coachScope: parsedScope.data,
  })
  if (!gate.ok) return gate
  if (!gate.coachId) {
    return {
      ok: false as const,
      response: jsonNoStore({ error: 'Coach no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, 403),
    }
  }
  return { ok: true as const, gate }
}

/** Crea o actualiza la correccion del coach sobre un alimento del catalogo. */
export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return invalid('Solicitud inválida.')
  const raw = body as Record<string, unknown>

  const resolved = await gateCoach(request, raw.workspace)
  if (!resolved.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: resolved.response.status })
    return resolved.response
  }

  const parsed = SaveSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Macros inválidos.')

  const result = await saveCoachFoodOverride(
    dbOf(resolved.gate),
    { coachId: resolved.gate.coachId! },
    { foodId: parsed.data.foodId, values: parsed.data.values },
  )
  if (!result.ok) return jsonNoStore({ error: result.error, code: 'OVERRIDE_WRITE_FAILED' }, 400)

  const response = jsonNoStore({ ok: true, foodId: parsed.data.foodId })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}

/** Restaurar el original: borra la correccion. Sin fila previa tambien responde ok. */
export async function DELETE(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return invalid('Solicitud inválida.')
  const raw = body as Record<string, unknown>

  const resolved = await gateCoach(request, raw.workspace)
  if (!resolved.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: resolved.response.status })
    return resolved.response
  }

  const parsed = RestoreSchema.safeParse(raw)
  if (!parsed.success) return invalid('Alimento inválido.')

  const result = await restoreCatalogFoodMacros(
    dbOf(resolved.gate),
    { coachId: resolved.gate.coachId! },
    parsed.data.foodId,
  )
  if (!result.ok) return jsonNoStore({ error: result.error, code: 'OVERRIDE_WRITE_FAILED' }, 400)

  const response = jsonNoStore({ ok: true, foodId: parsed.data.foodId })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}
