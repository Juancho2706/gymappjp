import type { ExchangeGroup } from '@eva/nutrition-engine'
import type { NutritionV2CoachScope, PortionSystem } from '@eva/nutrition-v2'
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

/** Set de porciones. Alias del tipo del paquete —no una copia literal— para que el día que el set
 *  gane un tercer valor no haya dos definiciones que se desincronicen. */
export type ExchangePortionSystem = PortionSystem

function toPortionSystem(raw: unknown): ExchangePortionSystem | undefined {
  return raw === 'smae' || raw === 'cl' ? raw : undefined
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
  // El campo es OPCIONAL (R15) y queda `undefined` si no viene o viene basura: un `portionSystem`
  // inventado haría que `systemOf` afirme un set que el servidor no mandó. Sin valor, el helper cae
  // al código del grupo y después al set del coach, que es justo el fallback que evita marcar
  // legado a un grupo del plan (R18). La llave se deja PRESENTE con `undefined`, igual que el
  // mapeador web (`exchanges.repository.ts:79`): misma interfaz, misma forma.
  const portionSystem = toPortionSystem(group.portionSystem)
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
    portionSystem,
  }
}

/**
 * Catálogo + cuántas equivalencias vivas tiene cada grupo (F1: paridad del conteo del builder
 * web). `foodCounts` es OPCIONAL a propósito: el conteo se degrada en silencio server-side, y la
 * UI tiene que poder distinguir «no vino» (no pinta nada) de «vino un 0» (avisa en ámbar). Si se
 * devolviera `{}` siempre, un grupo lleno se vería vacío hasta que llegara el conteo.
 */
export interface NutritionV2ExchangeGroupsResult {
  groups: ExchangeGroup[]
  foodCounts?: Record<string, number>
  /**
   * Set del coach (`coaches.portion_system`; 'cl' en este tren) y sets con targets VIVOS que NO
   * son el suyo. OPCIONALES por la misma razón que `foodCounts?` (R14): un binario nuevo contra un
   * deploy viejo —o el modo degradado del borde— no las recibe, y ese es el caso FAIL-OPEN. Sin
   * `portionSystem` el picker no marca NADA como legado y muestra el catálogo entero: esconder un
   * grupo que la pauta del coach usa lo dejaría sin poder editarla.
   *
   * `legacy` no viene por fila a propósito: se deriva en el cliente con
   * `systemOf(group, portionSystem)`, única forma de que un grupo del PLAN —que no trae la
   * columna— no quede marcado legado por falta de dato (R18).
   */
  portionSystem?: ExchangePortionSystem
  legacySystems?: ExchangePortionSystem[]
}

function toFoodCounts(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const counts: Record<string, number> = {}
  for (const [groupId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) counts[groupId] = value
  }
  return counts
}

/**
 * `[]` cuando la llave vino pero trae basura (se filtra silencioso); `undefined` cuando NO vino.
 *
 * DEDUPLICA con `Set`: el borde puede mandar el mismo set repetido (una fila por target vivo) y el
 * picker pinta UN bloque «Legado» por set, no uno por aparición. Sin el `Set`, `['cl','cl']` haría
 * que el sheet renderizara dos veces la misma sección (o dos llaves de React iguales).
 */
function toLegacySystems(raw: unknown): ExchangePortionSystem[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const valid = raw.filter((value): value is ExchangePortionSystem => value === 'smae' || value === 'cl')
  return [...new Set(valid)]
}

export async function fetchNutritionV2ExchangeGroups(
  scope: NutritionV2CoachScope,
): Promise<NutritionV2ExchangeGroupsResult> {
  const raw = await apiFetch<{
    groups?: unknown
    foodCounts?: unknown
    portionSystem?: unknown
    legacySystems?: unknown
  }>(`/api/mobile/nutrition-v2/exchange-groups${query(scope)}`, { authenticated: true })
  // Las DOS llaves caen JUNTAS (fail-open R14 punto 4): sin un `portionSystem` que parsee no hay
  // contra qué medir el legado, y un `legacySystems` a medias es peor que ninguno —marcaría legado
  // el set propio del coach, o escondería el otro set del picker.
  const portionSystem = toPortionSystem(raw.portionSystem)
  return {
    groups: Array.isArray(raw.groups)
      ? raw.groups.map(toGroup).filter((group): group is ExchangeGroup => group != null)
      : [],
    foodCounts: toFoodCounts(raw.foodCounts),
    portionSystem,
    legacySystems: portionSystem ? toLegacySystems(raw.legacySystems) : undefined,
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
