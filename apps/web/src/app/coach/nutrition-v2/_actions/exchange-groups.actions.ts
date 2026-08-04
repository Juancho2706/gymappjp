'use server'

/**
 * Server actions de GRUPOS DE PORCIONES PROPIOS del coach (porciones propias — P-A,
 * specs/nutrition-custom-portions). Crear / editar / eliminar (soft-delete) un
 * `exchange_groups` custom desde el picker del builder V2.
 *
 * Autorización: `authorizeCoach` (sesión + rate limit de escritura + rollout V2 + workspace
 * activo) — el MISMO gate que el resto del builder. No hay gate Pro ni de módulo: las
 * porciones vienen con todo plan pago (decisión vigente, ver PortionsGroupsAction). La RLS
 * `xg_insert/update/delete` (grupo NO system y `coach_id = auth.uid()`) es la segunda capa y
 * el techo real: la escritura corre con el cliente de la sesión, JAMÁS con service role.
 *
 * El payload lo valida `@eva/schemas/nutrition-exchanges` (mismo contrato que consume la API
 * mobile `/api/mobile/nutrition/exchanges/groups`, único camino de escritura de RN).
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import {
  CreateExchangeGroupSchema,
  DeleteExchangeGroupSchema,
  UpdateExchangeGroupSchema,
} from '@eva/schemas/nutrition-exchanges'
import {
  createCoachExchangeGroup,
  deleteCoachExchangeGroup,
  updateCoachExchangeGroup,
  type ExchangeGroupInput,
  type ExchangeGroupScope,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
  authorizeCoach,
  fail,
  zodFields,
  type ActionFailure,
  type AuthorizedCoach,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

/**
 * `clientId` es una PISTA DE REVALIDACIÓN, no autorización: el grupo es del coach
 * (`coach_id = auth.uid()` en la RLS `xg_insert/update/delete`) y `authorizeCoach` nunca lo
 * miró. Por eso acepta `null`: el builder de PLANTILLAS crea grupos propios sin ningún alumno
 * en pantalla, y ahí no hay ficha que revalidar.
 */
const ClientScopedSchema = z.object({ clientId: z.string().uuid('Alumno inválido').nullable().default(null) })

export type ExchangeGroupActionResult = { ok: true; group: ExchangeGroup } | ActionFailure
export type DeleteExchangeGroupActionResult = { ok: true; groupId: string } | ActionFailure

/** Scope 3-vías del workspace activo (idéntico al de `loadExchangeGroupsForBuilderAction`). */
function scopeOf(auth: AuthorizedCoach): ExchangeGroupScope {
  const workspace = auth.workspace
  return {
    orgId: workspace?.type === 'enterprise_coach' ? workspace.orgId : null,
    activeTeamId: workspace?.type === 'coach_team' ? workspace.teamId : null,
  }
}

function dbOf(auth: AuthorizedCoach): SupabaseClient<Database> {
  return auth.db as unknown as SupabaseClient<Database>
}

/**
 * El catálogo de grupos se lee en cada render del builder y de la ficha; tras escribir se
 * revalidan ambas rutas para que un refresh no muestre el catálogo viejo (el picker además
 * actualiza su lista en memoria para poder seleccionar el grupo recién creado sin cerrarse).
 */
function revalidateCoachSurfaces(clientId: string | null) {
  // Builder de plantillas: no hay ficha de alumno que refrescar (el picker igual actualiza su
  // lista en memoria, que es lo que el coach ve al instante).
  if (clientId == null) return
  revalidatePath('/coach/nutrition-v2/' + clientId)
  revalidatePath('/coach/nutrition-v2/' + clientId + '/builder')
}

function valuesOf(parsed: {
  name: string
  code: string
  slug?: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  color?: string | null
}): ExchangeGroupInput {
  return {
    name: parsed.name,
    code: parsed.code,
    slug: parsed.slug ?? null,
    refCalories: parsed.refCalories,
    refProteinG: parsed.refProteinG,
    refCarbsG: parsed.refCarbsG,
    refFatsG: parsed.refFatsG,
    color: parsed.color ?? null,
  }
}

export async function createExchangeGroupAction(input: unknown): Promise<ExchangeGroupActionResult> {
  const scoped = ClientScopedSchema.safeParse(input)
  if (!scoped.success) return fail('INVALID_PAYLOAD', 'Solicitud invalida.')
  const parsed = CreateExchangeGroupSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Revisa los datos del grupo.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(scoped.data.clientId)
  if (!auth.ok) return auth

  const result = await createCoachExchangeGroup(dbOf(auth), {
    actorCoachId: auth.userId,
    scope: scopeOf(auth),
    values: valuesOf(parsed.data),
  })
  if (!result.success) return fail('GROUP_WRITE_FAILED', result.error)

  revalidateCoachSurfaces(scoped.data.clientId)
  return { ok: true, group: result.group }
}

export async function updateExchangeGroupAction(input: unknown): Promise<ExchangeGroupActionResult> {
  const scoped = ClientScopedSchema.safeParse(input)
  if (!scoped.success) return fail('INVALID_PAYLOAD', 'Solicitud invalida.')
  const parsed = UpdateExchangeGroupSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', parsed.error.issues[0]?.message ?? 'Revisa los datos del grupo.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(scoped.data.clientId)
  if (!auth.ok) return auth

  const result = await updateCoachExchangeGroup(dbOf(auth), {
    actorCoachId: auth.userId,
    scope: scopeOf(auth),
    groupId: parsed.data.groupId,
    values: valuesOf(parsed.data),
  })
  if (!result.success) return fail('GROUP_WRITE_FAILED', result.error)

  revalidateCoachSurfaces(scoped.data.clientId)
  return { ok: true, group: result.group }
}

export async function deleteExchangeGroupAction(input: unknown): Promise<DeleteExchangeGroupActionResult> {
  const scoped = ClientScopedSchema.safeParse(input)
  if (!scoped.success) return fail('INVALID_PAYLOAD', 'Solicitud invalida.')
  const parsed = DeleteExchangeGroupSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Solicitud invalida.')

  const auth = await authorizeCoach(scoped.data.clientId)
  if (!auth.ok) return auth

  const result = await deleteCoachExchangeGroup(dbOf(auth), {
    actorCoachId: auth.userId,
    scope: scopeOf(auth),
    groupId: parsed.data.groupId,
  })
  if (!result.success) return fail('GROUP_WRITE_FAILED', result.error ?? 'No se pudo eliminar el grupo.')

  revalidateCoachSurfaces(scoped.data.clientId)
  return { ok: true, groupId: parsed.data.groupId }
}
