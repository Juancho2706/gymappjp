import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import {
  EXCHANGE_LIST_OWNER_RANK,
  rescalePortionGrams,
  resolveExchangeListRows,
  suggestPortionGrams,
  type ExchangeGroupRefMacros,
} from '@eva/nutrition-v2'
import { EXCHANGE_LIST_COPY_MAX } from '@eva/schemas/nutrition-exchanges'
import {
  countExchangeListRowsByGroup,
  deleteOwnExchangeListRow,
  deleteOwnExchangeListRowsForFood,
  excludeExchangeListRow,
  findAllExchangeListRowsByGroup,
  findExchangeListRowsByGroup,
  insertExchangeListRows,
  searchFoodsForExchangeList,
  upsertOwnExchangeListRow,
  type ExchangeListFoodMacros,
  type ExchangeListOwner,
  type ExchangeListRow,
} from '@/infrastructure/db/exchange-group-foods.repository'
import {
  createCoachExchangeGroup,
  getExchangeGroupsForCoach,
  isExchangeGroupVisibleToActor,
  type ExchangeGroupInput,
  type ExchangeGroupScope,
} from './nutrition-exchanges.service'

/**
 * Servicio de las LISTAS de equivalencia por grupo (F2 — specs/nutrition-exchange-lists).
 *
 * Gating: hereda el de nutrición, sin módulo ni gate nuevo (decisión CEO). El techo de
 * autorización lo pone el caller (server action con `authorizeCoach`, o el gate de la API
 * móvil) y, debajo, la RLS de `exchange_group_foods`. Este archivo NO importa Next.
 *
 * DUEÑO DE LA FILA. F2 escribe SIEMPRE filas coach-scoped (`coach_id = actor`, `org_id NULL`),
 * igual que F1 con los grupos propios. Las filas de org existen en el modelo (el backfill las
 * conserva) pero crearlas exige `is_org_admin_member`, y un coach enterprise que no es admin
 * recibiría un 42501 opaco. Su fila personal gana igual: rank coach (0) < rank org (1).
 */

type DB = SupabaseClient<Database>

export type ExchangeListEntry = ExchangeListRow & {
  /** true ⇒ la fila ganadora para ese alimento; las perdedoras no se muestran. */
  winner: boolean
}

/** Dueño con el que el actor escribe sus filas. Nunca viene del payload. */
export function exchangeListOwnerFor(actorCoachId: string): ExchangeListOwner {
  return { coachId: actorCoachId, orgId: null }
}

async function isFoodVisibleToActor(db: DB, foodId: string): Promise<boolean> {
  // RLS de `foods` es el techo: si el alimento no es global, propio ni de su org, no vuelve.
  const { data } = await db.from('foods').select('id').eq('id', foodId).maybeSingle()
  return data != null
}

export type ExchangeListResult =
  | { success: true; rows: ExchangeListEntry[]; total: number }
  | { success: false; error: string }

/**
 * Lista visible de un grupo, ya resuelta por precedencia: una fila por alimento y sin las
 * lápidas. Es lo MISMO que devuelve el read-model del alumno — si acá se mostrara la fila
 * global que el coach ya pisó, el coach editaría a ciegas.
 */
export async function getExchangeListForGroup(
  db: DB,
  input: {
    actorCoachId: string
    scope: ExchangeGroupScope
    groupId: string
    search?: string | null
    limit?: number
    offset?: number
  }
): Promise<ExchangeListResult> {
  const visible = await isExchangeGroupVisibleToActor(db, input.groupId)
  if (!visible) return { success: false, error: 'Ese grupo de porciones ya no está disponible.' }

  const { rows, total } = await findExchangeListRowsByGroup(db, {
    groupId: input.groupId,
    search: input.search,
    limit: input.limit,
    offset: input.offset,
  })
  const resolved = resolveExchangeListRows(rows)
  const winners = new Set(resolved.map((row) => row.id))
  return {
    success: true,
    rows: resolved.map((row) => ({ ...row, winner: winners.has(row.id) })),
    total,
  }
}

export type ExchangeListWriteOutcome = { success: true } | { success: false; error: string }

/**
 * Guarda "1 porción de este grupo = N g de este alimento" en MI lista. Verifica las dos
 * visibilidades antes de escribir: el FK acepta cualquier grupo y cualquier alimento
 * existentes, incluidos los privados de otro coach.
 */
export async function saveExchangeListEntry(
  db: DB,
  input: {
    actorCoachId: string
    groupId: string
    foodId: string
    portionGrams: number
    portionLabel: string | null
  }
): Promise<ExchangeListWriteOutcome> {
  if (!(await isExchangeGroupVisibleToActor(db, input.groupId))) {
    return { success: false, error: 'Ese grupo de porciones ya no está disponible.' }
  }
  if (!(await isFoodVisibleToActor(db, input.foodId))) {
    return { success: false, error: 'Ese alimento ya no está disponible.' }
  }

  const result = await upsertOwnExchangeListRow(db, {
    groupId: input.groupId,
    foodId: input.foodId,
    owner: exchangeListOwnerFor(input.actorCoachId),
    portionGrams: input.portionGrams,
    portionLabel: input.portionLabel,
    createdBy: input.actorCoachId,
  })
  return result.ok ? { success: true } : { success: false, error: result.error }
}

/** Saca el alimento de MI lista (lápida). El catálogo global no se toca. */
export async function excludeExchangeListEntry(
  db: DB,
  input: { actorCoachId: string; groupId: string; foodId: string }
): Promise<ExchangeListWriteOutcome> {
  if (!(await isExchangeGroupVisibleToActor(db, input.groupId))) {
    return { success: false, error: 'Ese grupo de porciones ya no está disponible.' }
  }
  const result = await excludeExchangeListRow(db, {
    groupId: input.groupId,
    foodId: input.foodId,
    owner: exchangeListOwnerFor(input.actorCoachId),
  })
  return result.ok ? { success: true } : { success: false, error: result.error }
}

/** Borra MI fila ⇒ vuelve a mandar el catálogo global (o desaparece si el catálogo no lo tiene). */
export async function restoreExchangeListEntry(
  db: DB,
  input: { actorCoachId: string; groupId: string; foodId: string }
): Promise<ExchangeListWriteOutcome> {
  const result = await deleteOwnExchangeListRow(db, {
    groupId: input.groupId,
    foodId: input.foodId,
    owner: exchangeListOwnerFor(input.actorCoachId),
  })
  return result.ok ? { success: true } : { success: false, error: result.error }
}

/**
 * DOBLE ESCRITURA de los caminos que clasifican un alimento por las columnas `foods.exchange_*`
 * (alta del builder, alta del catálogo, "Clasificar en porciones", alta RN por la API móvil).
 *
 * Sin esto, un alimento clasificado por esos caminos NO tendría fila en la lista y solo lo
 * salvaría la rama legacy del read-model — que se retira en F5. Escribirlo en las dos partes
 * ahora es lo que permite apagar la rama legacy después sin perder nada.
 *
 * BEST-EFFORT a propósito: si la fila de lista falla, el alimento igual quedó clasificado en sus
 * columnas y el alumno lo sigue viendo por la rama legacy. Romper el alta de un alimento por un
 * fallo de la lista sería un peor trato para el coach.
 */
export async function syncFoodExchangeListRow(
  db: DB,
  input: {
    actorCoachId: string
    foodId: string
    exchangeGroupId: string | null
    portionGrams: number | null
    portionLabel: string | null
  }
): Promise<void> {
  const owner = exchangeListOwnerFor(input.actorCoachId)
  try {
    // Reclasificar = mover de grupo: primero se limpian mis filas viejas de ESE alimento.
    await deleteOwnExchangeListRowsForFood(db, { foodId: input.foodId, owner })
    if (!input.exchangeGroupId || input.portionGrams == null || input.portionGrams <= 0) return
    await upsertOwnExchangeListRow(db, {
      groupId: input.exchangeGroupId,
      foodId: input.foodId,
      owner,
      portionGrams: input.portionGrams,
      portionLabel: input.portionLabel,
      createdBy: input.actorCoachId,
    })
  } catch (error) {
    console.error('[nutrition_exchanges] syncFoodExchangeListRow', error)
  }
}

export type ExchangeListCandidate = ExchangeListFoodMacros & {
  /** Gramos sugeridos por los macros del alimento y los de referencia del grupo. */
  suggestedGrams: number | null
  /** true ⇒ ya está en la lista del grupo (evita ofrecer duplicados como si fueran altas). */
  alreadyInList: boolean
}

/**
 * Candidatos para clasificar: busca en TODO el catálogo visible (el cambio de fondo de F2) y
 * ya trae la sugerencia calculada, para que la UI no tenga que conocer la fórmula.
 */
export async function searchExchangeListCandidates(
  db: DB,
  input: { groupId: string; group: ExchangeGroupRefMacros; search?: string | null; limit?: number }
): Promise<ExchangeListCandidate[]> {
  const [foods, existing] = await Promise.all([
    searchFoodsForExchangeList(db, { search: input.search, limit: input.limit }),
    findAllExchangeListRowsByGroup(db, input.groupId, EXCHANGE_LIST_COPY_MAX),
  ])
  const inList = new Set(resolveExchangeListRows(existing).map((row) => row.foodId))
  return foods.map((food) => ({
    ...food,
    suggestedGrams: suggestPortionGrams(input.group, {
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatsG: food.fatsG,
      calories: food.calories,
      servingSize: food.servingSize,
      macrosBasis: food.macrosBasis,
    }),
    alreadyInList: inList.has(food.id),
  }))
}

/** Cuántas equivalencias vivas tiene cada grupo, con las lápidas ya descontadas. */
export async function getExchangeListCounts(
  db: DB,
  groupIds: string[]
): Promise<Record<string, number>> {
  return countExchangeListRowsByGroup(db, groupIds)
}

export type DuplicateExchangeGroupResult =
  | { success: true; group: ExchangeGroup; copied: number; attempted: number; copyError?: string }
  | { success: false; error: string }

/**
 * "Duplicar y ajustar" completo: crea el grupo propio Y copia su lista reescalada por regla de
 * tres. F1 duplicaba solo los macros, así que el grupo nuevo nacía vacío y el alumno abría un
 * sheet sin un solo ejemplo — la copia es lo que convierte la función en útil.
 *
 * Si la copia falla, el grupo YA creado se conserva y se informa: deshacerlo dejaría al coach
 * sin el grupo que sí pidió. El tope duro evita que un grupo gigante se convierta en un insert
 * ilimitado desde el navegador.
 */
export async function duplicateExchangeGroupWithList(
  db: DB,
  input: {
    actorCoachId: string
    scope: ExchangeGroupScope
    sourceGroupId: string
    values: ExchangeGroupInput
    copyList: boolean
  }
): Promise<DuplicateExchangeGroupResult> {
  const catalog = await getExchangeGroupsForCoach(db, input.actorCoachId, input.scope)
  const source = catalog.find((group) => group.id === input.sourceGroupId)
  if (!source) return { success: false, error: 'Ese grupo de porciones ya no está disponible.' }

  const created = await createCoachExchangeGroup(db, {
    actorCoachId: input.actorCoachId,
    scope: input.scope,
    values: input.values,
  })
  if (!created.success) return { success: false, error: created.error }
  if (!input.copyList) return { success: true, group: created.group, copied: 0, attempted: 0 }

  const sourceRows = resolveExchangeListRows(
    await findAllExchangeListRowsByGroup(db, input.sourceGroupId, EXCHANGE_LIST_COPY_MAX)
  ).filter((row) => row.portionGrams != null && row.portionGrams > 0)

  const from: ExchangeGroupRefMacros = {
    refProteinG: source.refProteinG,
    refCarbsG: source.refCarbsG,
    refFatsG: source.refFatsG,
    refCalories: source.refCalories,
  }
  const to: ExchangeGroupRefMacros = {
    refProteinG: input.values.refProteinG,
    refCarbsG: input.values.refCarbsG,
    refFatsG: input.values.refFatsG,
    refCalories: input.values.refCalories,
  }

  const owner = exchangeListOwnerFor(input.actorCoachId)
  const payload = sourceRows
    .map((row) => ({
      groupId: created.group.id,
      foodId: row.foodId,
      owner,
      portionGrams: rescalePortionGrams(row.portionGrams as number, from, to),
      portionLabel: row.portionLabel,
      createdBy: input.actorCoachId,
    }))
    .filter((row) => row.portionGrams > 0)

  const { inserted, error } = await insertExchangeListRows(db, payload)
  return {
    success: true,
    group: created.group,
    copied: inserted,
    attempted: payload.length,
    copyError: error,
  }
}

export { EXCHANGE_LIST_OWNER_RANK }
