'use server'

/**
 * Server actions de las LISTAS de equivalencia por grupo (F2 — specs/nutrition-exchange-lists).
 *
 * Superficie: la sección "Porciones" de `/coach/foods`. Hasta F1 la única entrada a esta
 * gestión estaba enterrada en el builder de un alumno concreto, así que un coach sin alumnos
 * no podía llegar nunca.
 *
 * Autorización en capas, ninguna en la UI:
 *  1. sesión propia (`auth.getUser()`); el `coachId` sale del token, jamás del payload;
 *  2. servicio: verifica que el grupo y el alimento sean VISIBLES para el actor antes de escribir;
 *  3. RLS de `exchange_group_foods`: solo filas propias, y ninguna fila global.
 *
 * Sin gate comercial nuevo: la lista hereda el permiso de nutrición (decisión CEO).
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import {
  DuplicateExchangeGroupSchema,
  ExcludeExchangeGroupFoodSchema,
  RemoveExchangeGroupFoodSchema,
  UpsertExchangeGroupFoodSchema,
} from '@eva/schemas/nutrition-exchanges'
import { createClient } from '@/lib/supabase/server'
import { resolveCoachScope } from '@/services/auth/coach-scope.service'
import { getExchangeGroupsForCoach } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import {
  duplicateExchangeGroupWithList,
  excludeExchangeListEntry,
  getExchangeListCounts,
  getExchangeListForGroup,
  restoreExchangeListEntry,
  saveExchangeListEntry,
  searchExchangeListCandidates,
  type ExchangeListCandidate,
  type ExchangeListEntry,
} from '@/services/nutrition-exchanges/exchange-lists.service'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'

const COPY = PORTIONS_COPY.exchangeList

type Actor = {
  db: SupabaseClient<Database>
  coachId: string
  scope: { orgId: string | null; activeTeamId: string | null }
}

async function resolveActor(): Promise<Actor | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const scope = await resolveCoachScope(supabase, user.id)
  return {
    db: supabase as unknown as SupabaseClient<Database>,
    coachId: user.id,
    scope: {
      orgId: scope.ok ? scope.orgId : null,
      activeTeamId: scope.ok ? scope.activeTeamId : null,
    },
  }
}

function revalidateSurfaces() {
  revalidatePath('/coach/foods')
  revalidatePath('/coach/nutrition-plans')
}

export type ExchangeListGroupsResult =
  | { success: true; groups: ExchangeGroup[]; counts: Record<string, number> }
  | { success: false; error: string }

/** Catálogo de grupos + cuántas equivalencias vivas tiene cada uno (lápidas ya descontadas). */
export async function loadExchangeListGroupsAction(): Promise<ExchangeListGroupsResult> {
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }
  try {
    const groups = await getExchangeGroupsForCoach(actor.db, actor.coachId, actor.scope)
    const counts = await getExchangeListCounts(
      actor.db,
      groups.map((group) => group.id)
    )
    return { success: true, groups, counts }
  } catch {
    return { success: false, error: COPY.loadFailed }
  }
}

const ListInputSchema = z.object({
  groupId: z.guid('Grupo de porciones inválido'),
  search: z.string().max(120).nullish(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).max(10000).optional(),
})

export type ExchangeListRowsResult =
  | { success: true; rows: ExchangeListEntry[]; total: number }
  | { success: false; error: string }

export async function loadExchangeListAction(input: unknown): Promise<ExchangeListRowsResult> {
  const parsed = ListInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const result = await getExchangeListForGroup(actor.db, {
    actorCoachId: actor.coachId,
    scope: actor.scope,
    groupId: parsed.data.groupId,
    search: parsed.data.search,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  })
  if (!result.success) return { success: false, error: result.error }
  return { success: true, rows: result.rows, total: result.total }
}

const CandidatesInputSchema = z.object({
  groupId: z.guid('Grupo de porciones inválido'),
  search: z.string().max(120).nullish(),
  limit: z.number().int().min(1).max(60).optional(),
})

export type ExchangeListCandidatesResult =
  | { success: true; candidates: ExchangeListCandidate[] }
  | { success: false; error: string }

/**
 * Candidatos para clasificar, con la sugerencia de gramos ya calculada server-side. La búsqueda
 * barre TODO el catálogo visible: hasta F1 el coach solo podía clasificar sus propios alimentos,
 * que es justamente lo que hacía inútil la función para quien usa el catálogo global.
 */
export async function searchExchangeListCandidatesAction(
  input: unknown
): Promise<ExchangeListCandidatesResult> {
  const parsed = CandidatesInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const groups = await getExchangeGroupsForCoach(actor.db, actor.coachId, actor.scope)
  const group = groups.find((g) => g.id === parsed.data.groupId)
  if (!group) return { success: false, error: COPY.groupUnavailable }

  const candidates = await searchExchangeListCandidates(actor.db, {
    groupId: group.id,
    group: {
      refProteinG: group.refProteinG,
      refCarbsG: group.refCarbsG,
      refFatsG: group.refFatsG,
      refCalories: group.refCalories,
    },
    search: parsed.data.search,
    limit: parsed.data.limit,
  })
  return { success: true, candidates }
}

export type ExchangeListMutationResult = { success: true } | { success: false; error: string }

export async function saveExchangeListEntryAction(input: unknown): Promise<ExchangeListMutationResult> {
  const parsed = UpsertExchangeGroupFoodSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const result = await saveExchangeListEntry(actor.db, {
    actorCoachId: actor.coachId,
    groupId: parsed.data.exchangeGroupId,
    foodId: parsed.data.foodId,
    portionGrams: parsed.data.portionGrams,
    portionLabel: (parsed.data.portionLabel ?? '').trim() || null,
  })
  if (!result.success) return result
  revalidateSurfaces()
  return { success: true }
}

export async function excludeExchangeListEntryAction(input: unknown): Promise<ExchangeListMutationResult> {
  const parsed = ExcludeExchangeGroupFoodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const result = await excludeExchangeListEntry(actor.db, {
    actorCoachId: actor.coachId,
    groupId: parsed.data.exchangeGroupId,
    foodId: parsed.data.foodId,
  })
  if (!result.success) return result
  revalidateSurfaces()
  return { success: true }
}

export async function restoreExchangeListEntryAction(input: unknown): Promise<ExchangeListMutationResult> {
  const parsed = RemoveExchangeGroupFoodSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const result = await restoreExchangeListEntry(actor.db, {
    actorCoachId: actor.coachId,
    groupId: parsed.data.exchangeGroupId,
    foodId: parsed.data.foodId,
  })
  if (!result.success) return result
  revalidateSurfaces()
  return { success: true }
}

export type DuplicateExchangeGroupActionResult =
  | { success: true; group: ExchangeGroup; copied: number; attempted: number; copyError?: string }
  | { success: false; error: string }

/**
 * Duplica un grupo (típicamente uno del sistema, que la RLS no deja editar) y copia su lista
 * reescalada. Es la salida al caso real "el cereal aporta 15 g de carbos y yo trabajo con 20"
 * sin tocar el grupo compartido ni los planes ya publicados.
 */
export async function duplicateExchangeGroupAction(
  input: unknown
): Promise<DuplicateExchangeGroupActionResult> {
  const parsed = DuplicateExchangeGroupSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos del grupo.' }
  }
  const actor = await resolveActor()
  if (!actor) return { success: false, error: 'No autorizado.' }

  const result = await duplicateExchangeGroupWithList(actor.db, {
    actorCoachId: actor.coachId,
    scope: actor.scope,
    sourceGroupId: parsed.data.sourceGroupId,
    values: {
      name: parsed.data.name,
      code: parsed.data.code,
      slug: parsed.data.slug ?? null,
      refCalories: parsed.data.refCalories,
      refProteinG: parsed.data.refProteinG,
      refCarbsG: parsed.data.refCarbsG,
      refFatsG: parsed.data.refFatsG,
      color: parsed.data.color ?? null,
    },
    copyList: parsed.data.copyList,
  })
  if (!result.success) return { success: false, error: result.error }

  revalidateSurfaces()
  return {
    success: true,
    group: result.group,
    copied: result.copied,
    attempted: result.attempted,
    copyError: result.copyError,
  }
}
