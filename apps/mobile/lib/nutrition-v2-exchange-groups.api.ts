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

export async function fetchNutritionV2ExchangeGroups(scope: NutritionV2CoachScope): Promise<ExchangeGroup[]> {
  const raw = await apiFetch<{ groups?: unknown }>(`/api/mobile/nutrition-v2/exchange-groups${query(scope)}`, {
    authenticated: true,
  })
  return Array.isArray(raw.groups)
    ? raw.groups.map(toGroup).filter((group): group is ExchangeGroup => group != null)
    : []
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
