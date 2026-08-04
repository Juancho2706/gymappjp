import type { ExchangeGroup } from '@eva/nutrition-engine'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'
import { apiFetch } from './api'

export interface CoachExchangeGroupValues {
  name: string
  code: string
  refCalories: number
  refProteinG: number
  refCarbsG: number
  refFatsG: number
  color: string | null
}

export type ExchangeGroupWriteResult =
  | { ok: true; group: ExchangeGroup }
  | { ok: false; error: string }

type MutationResult = { ok: boolean; group?: unknown; groupId?: string }

function query(scope: NutritionV2CoachScope): string {
  const params = new URLSearchParams({ scopeType: scope.scopeType })
  if (scope.teamId) params.set('teamId', scope.teamId)
  return `?${params.toString()}`
}

function toGroup(raw: unknown): ExchangeGroup | null {
  if (!raw || typeof raw !== 'object') return null
  const group = raw as Partial<ExchangeGroup>
  if (typeof group.id !== 'string') return null
  return {
    id: group.id,
    slug: group.slug ?? '',
    code: group.code ?? '',
    name: group.name ?? '',
    coachId: group.coachId ?? null,
    teamId: group.teamId ?? null,
    isSystem: group.isSystem === true,
    refCalories: Number(group.refCalories) || 0,
    refProteinG: Number(group.refProteinG) || 0,
    refCarbsG: Number(group.refCarbsG) || 0,
    refFatsG: Number(group.refFatsG) || 0,
    color: group.color ?? null,
    sortOrder: Number(group.sortOrder) || 0,
    composedOf: group.composedOf ?? null,
    macrosConfirmed: group.macrosConfirmed === true,
  }
}

/**
 * Catalogo + cuantas equivalencias vivas tiene cada grupo (F1: paridad del conteo del builder
 * web). `foodCounts` es OPCIONAL a proposito: el conteo se degrada en silencio server-side, y la
 * UI tiene que poder distinguir "no vino" (no pinta nada) de "vino un 0" (avisa en ambar). Si se
 * devolviera `{}` siempre, un grupo lleno se veria vacio hasta que llegara el conteo.
 */
export interface NutritionV2ExchangeGroupsResult {
  groups: ExchangeGroup[]
  foodCounts?: Record<string, number>
}

function toFoodCounts(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const counts: Record<string, number> = {}
  for (const [groupId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[groupId] = value
  }
  return counts
}

export async function fetchNutritionV2ExchangeGroups(
  scope: NutritionV2CoachScope,
): Promise<NutritionV2ExchangeGroupsResult> {
  const raw = await apiFetch<{ groups?: unknown; foodCounts?: unknown }>(
    `/api/mobile/nutrition-v2/exchange-groups${query(scope)}`,
    { authenticated: true },
  )
  return {
    groups: Array.isArray(raw.groups)
      ? raw.groups.map(toGroup).filter((group): group is ExchangeGroup => group != null)
      : [],
    foodCounts: toFoodCounts(raw.foodCounts),
  }
}

async function write(
  scope: NutritionV2CoachScope,
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' | 'DELETE',
): Promise<MutationResult> {
  return apiFetch<MutationResult>('/api/mobile/nutrition-v2/exchange-groups', {
    authenticated: true,
    method,
    body: { ...body, workspace: scope },
  })
}

function writeResult(raw: MutationResult): ExchangeGroupWriteResult {
  const group = toGroup(raw.group)
  return raw.ok && group
    ? { ok: true, group }
    : { ok: false, error: 'No pudimos guardar el grupo. Intenta nuevamente.' }
}

export async function createNutritionV2ExchangeGroup(
  scope: NutritionV2CoachScope,
  values: CoachExchangeGroupValues,
): Promise<ExchangeGroupWriteResult> {
  try {
    return writeResult(await write(scope, { ...values }, 'POST'))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No pudimos guardar el grupo.' }
  }
}

export async function updateNutritionV2ExchangeGroup(
  scope: NutritionV2CoachScope,
  groupId: string,
  values: CoachExchangeGroupValues,
): Promise<ExchangeGroupWriteResult> {
  try {
    return writeResult(await write(scope, { ...values, groupId }, 'PATCH'))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No pudimos guardar el grupo.' }
  }
}

/**
 * "Duplicar y ajustar" CON copia de la lista (paridad T4.3). Endpoint distinto a propósito:
 * `/api/mobile/nutrition/exchanges/groups` (PUT) es la ruta que ya corre `gateExchanges` y donde
 * vive el servicio de listas — la misma familia que `nutrition-v2-exchange-lists.api.ts`. El
 * REESCALADO de los gramos es SIEMPRE server-side: el teléfono no lleva una copia de la fórmula.
 *
 * Falla PARCIAL contemplada: `ok: true` con `copyError` = el grupo se creó pero su lista no se
 * copió. Nunca se pierde el grupo por un fallo de la copia.
 */
export interface DuplicateExchangeGroupValues extends CoachExchangeGroupValues {
  sourceGroupId: string
  copyList: boolean
}

export type DuplicateExchangeGroupResult =
  | { ok: true; group: ExchangeGroup; copied: number; attempted: number; copyError?: string }
  | { ok: false; error: string }

export async function duplicateNutritionV2ExchangeGroup(
  values: DuplicateExchangeGroupValues,
): Promise<DuplicateExchangeGroupResult> {
  try {
    const raw = await apiFetch<{
      ok?: boolean
      group?: unknown
      copied?: unknown
      attempted?: unknown
      copyError?: unknown
    }>('/api/mobile/nutrition/exchanges/groups', {
      authenticated: true,
      method: 'PUT',
      body: values,
    })
    const group = toGroup(raw.group)
    if (raw.ok !== true || !group) {
      return { ok: false, error: 'No pudimos duplicar el grupo. Intenta nuevamente.' }
    }
    return {
      ok: true,
      group,
      copied: typeof raw.copied === 'number' ? raw.copied : 0,
      attempted: typeof raw.attempted === 'number' ? raw.attempted : 0,
      copyError: typeof raw.copyError === 'string' ? raw.copyError : undefined,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No pudimos duplicar el grupo.' }
  }
}

export async function deleteNutritionV2ExchangeGroup(
  scope: NutritionV2CoachScope,
  groupId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await write(scope, { groupId }, 'DELETE')
    return result.ok ? { ok: true } : { ok: false, error: 'No pudimos eliminar el grupo. Intenta nuevamente.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No pudimos eliminar el grupo.' }
  }
}
