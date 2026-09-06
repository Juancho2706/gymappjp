import { NextRequest } from 'next/server'
import { z } from 'zod'
import { NutritionV2CoachScopeSchema } from '@eva/nutrition-v2'
import { gateNutritionV2Api, jsonNoStore, logNutritionV2Api } from '../../_shared'
import { jsonRateLimited, rateLimitNutritionCoachWrite } from '@/lib/rate-limit'
import {
  CorrectIntakeQuantityAsCoachInputSchema,
  VoidIntakeAsCoachInputSchema,
  correctIntakeQuantityAsCoachWithDb,
  voidIntakeAsCoachWithDb,
} from '@/app/coach/nutrition-v2/_lib/coach-intake'
import type { NutritionV2Db } from '@/app/coach/nutrition-v2/_actions/plan-persistence'

/**
 * El coach RETIRA y CORRIGE registros del día de su alumno desde móvil (W4.1, SPEC §7.1).
 *
 * Va en su propia ruta y no dentro de `coach/mutate` a propósito: ese endpoint es el de las
 * escrituras del PLAN (publicar, asignar, archivar, catálogo, plantillas) y cobra el gate Pro y la
 * maquinaria del draft. Esto es una escritura de INTAKE del alumno, con otra forma de payload y
 * otros RPC; mezclarlas obligaría a ramificar el draft en un `switch` que ya tiene diez ramas.
 *
 * Misma barrera que las demás rutas del coach (NUT-005): gate `mobileCoach` + `mutation: true` con
 * el workspace declarado, rate limit de escritura, y persistencia con el cliente RLS del propio
 * coach (`gate.rpc`, jamás `service_role`) reusando EXACTAMENTE la lógica de la server action web
 * (`_lib/coach-intake.ts`). El cuerpo no es autoridad sobre nada: la fila se re-lee server-side y
 * la autorización final la ponen `void_/correct_nutrition_intake_v2`.
 */

const ROUTE = 'mobile.nutrition-v2.coach.intake'

const CoachIntakeBodySchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('void'),
    workspace: NutritionV2CoachScopeSchema,
    ...VoidIntakeAsCoachInputSchema.shape,
  }),
  z.object({
    op: z.literal('correct-quantity'),
    workspace: NutritionV2CoachScopeSchema,
    ...CorrectIntakeQuantityAsCoachInputSchema.shape,
  }),
])

/** HTTP honesto por código de dominio (RN ramifica por `code`, no por status). */
function statusForCode(code: string): number {
  switch (code) {
    case 'SCOPE_DENIED':
      return 403
    case 'ENTRY_NOT_FOUND':
      return 404
    case 'ENTRY_NOT_ACTIVE':
      return 409
    case 'INVALID_PAYLOAD':
    case 'INVALID_INTAKE':
    case 'LEGACY_ENTRY':
      return 400
    case 'RATE_LIMITED':
      return 429
    default:
      return 422
  }
}

function failure(startedAt: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  const status = statusForCode(code)
  logNutritionV2Api({ route: ROUTE, startedAt, status, errorCode: code })
  return jsonNoStore({ ok: false, code, error, ...extra }, status)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return failure(startedAt, 'INVALID_PAYLOAD', 'La solicitud tiene datos inválidos.')
  }

  const parsed = CoachIntakeBodySchema.safeParse(body)
  if (!parsed.success) {
    return failure(startedAt, 'INVALID_PAYLOAD', 'La solicitud tiene datos inválidos.', {
      fields: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    })
  }
  const input = parsed.data

  // El alumno objetivo alimenta el canary por alumno del gate; la autorización real la dan la RLS
  // y los RPC scoped.
  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileCoach',
    mutation: true,
    coachScope: input.workspace,
    requestedClientId: input.clientId,
  })
  if (!gate.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: gate.response.status })
    return gate.response
  }

  const limited = await rateLimitNutritionCoachWrite(gate.userId)
  if (!limited.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: 429, errorCode: 'RATE_LIMIT' })
    return jsonRateLimited(limited.retryAfter)
  }

  const db = gate.rpc as unknown as NutritionV2Db
  const result =
    input.op === 'void'
      ? await voidIntakeAsCoachWithDb(db, { clientId: input.clientId, entryId: input.entryId })
      : await correctIntakeQuantityAsCoachWithDb(db, {
          clientId: input.clientId,
          entryId: input.entryId,
          quantity: input.quantity,
        })

  if (!result.ok) return failure(startedAt, result.code, result.error)

  const payload = { ok: true as const, id: result.id, op: input.op }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload, 200)
}
