import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CreateExchangeGroupSchema,
  DeleteExchangeGroupSchema,
  UpdateExchangeGroupSchema,
} from '@eva/schemas/nutrition-exchanges'
import { NutritionV2CoachScopeSchema, type PortionSystem } from '@eva/nutrition-v2'
import type { Database } from '@/lib/database.types'
import {
  createCoachExchangeGroup,
  deleteCoachExchangeGroup,
  getExchangeGroupsForCoach,
  updateCoachExchangeGroup,
  type ExchangeGroupInput,
  type ExchangeGroupScope,
} from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { getExchangeListCounts } from '@/services/nutrition-exchanges/exchange-lists.service'
import {
  findCoachPortionSystem,
  findUsedPortionSystemsForCoach,
} from '@/infrastructure/db/exchanges.repository'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  type NutritionV2ApiGate,
} from '../_shared'

const ROUTE = 'mobile.nutrition-v2.exchange-groups'

function invalid(error: string) {
  return jsonNoStore({ error, code: 'INVALID_PAYLOAD' }, 400)
}

function workspaceOf(scope: { teamId: string | null; orgId: string | null }): ExchangeGroupScope {
  return { activeTeamId: scope.teamId, orgId: scope.orgId }
}

function dbOf(gate: NutritionV2ApiGate): SupabaseClient<Database> {
  return gate.rpc as unknown as SupabaseClient<Database>
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

async function gateCoach(request: NextRequest, scope: unknown, mutation = false) {
  const parsedScope = NutritionV2CoachScopeSchema.safeParse(scope)
  if (!parsedScope.success) return { ok: false as const, response: invalid('Workspace inválido.') }

  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileCoach',
    mutation,
    coachScope: parsedScope.data,
  })
  if (!gate.ok) return gate
  if (!gate.coachId) {
    return { ok: false as const, response: jsonNoStore({ error: 'Coach no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, 403) }
  }
  return { ok: true as const, gate, scope: parsedScope.data }
}

/**
 * Cuántas equivalencias VIVAS tiene cada grupo (`exchange_group_foods` resuelto por precedencia
 * y con las lápidas descontadas — la fuente correcta post-F2). Sin este dato el coach elige
 * grupos a ciegas y, sobre todo, no se entera de que el grupo propio que acaba de crear nace
 * VACÍO: su alumno abre "1 porción equivale a" y no ve un solo ejemplo.
 *
 * DEGRADACIÓN SILENCIOSA (mismo criterio que el builder web): el conteo es informativo, así que
 * un fallo suyo devuelve `{}` y JAMÁS rompe el catálogo. La UI distingue "no vino el conteo"
 * (no pinta nada) de "vino un 0" (avisa en ámbar).
 */
async function foodCountsFor(gate: NutritionV2ApiGate, groupIds: string[]): Promise<Record<string, number>> {
  if (groupIds.length === 0) return {}
  try {
    return await getExchangeListCounts(dbOf(gate), groupIds)
  } catch {
    return {}
  }
}

/**
 * Los dos insumos de la visibilidad de sets (R14), leídos en el BORDE DE PRESENTACIÓN.
 *
 * Acá se MARCA, jamás se filtra: `groups` sale completo y el cliente particiona. Y `legacy` NO
 * viaja por fila a propósito (R18): un grupo que sale del PLAN no trae la columna, así que el
 * servidor no puede afirmar «legado» sobre él; el teléfono lo deriva con `systemOf`.
 *
 * FAIL-OPEN (R14 punto 4): si cualquiera de las dos lecturas falla se devuelve `visibility: null` y
 * las DOS llaves se omiten del payload (con `degraded: true` para que el log lo delate). El cliente sin `portionSystem` no marca nada como legado y ve
 * todo el catálogo. Esconder un grupo que el plan del coach usa es MUCHO peor que mostrar uno de
 * más: lo dejaría sin poder editar su propia pauta.
 *
 * OJO con la forma del fallo: `findCoachPortionSystem` NO lanza, devuelve `null` cuando la lectura
 * falla (o el coach no existe), así que el `try/catch` solo cubre a la otra. Sin el `null` explícito
 * de abajo, un coach `'smae'` cuya lectura reventara recibiría `portionSystem: 'cl'` con
 * `legacySystems: []` y el picker le ESCONDERÍA sus propios grupos SMAE: el fail-open al revés.
 */
type VisibilityRead = {
  visibility: { portionSystem: PortionSystem; legacySystems: PortionSystem[] } | null
  /**
   * `true` SOLO cuando una lectura LANZÓ. El fail-open es silencioso para el cliente (mismo cuerpo
   * de siempre), pero no puede serlo para nosotros: sin este marcador un bug que reviente
   * `findUsedPortionSystemsForCoach` en prod se ve idéntico a un deploy sano y nadie se entera de
   * que TODOS los coaches perdieron la marca de legado.
   */
  degraded: boolean
}

async function visibilityFor(gate: NutritionV2ApiGate, coachId: string): Promise<VisibilityRead> {
  try {
    const db = dbOf(gate)
    const [coachSystem, usedSystems] = await Promise.all([
      findCoachPortionSystem(db, coachId),
      findUsedPortionSystemsForCoach(db, coachId),
    ])
    if (coachSystem == null) return { visibility: null, degraded: false }
    // Default de la columna (R14-bis): cualquier cosa que no sea 'smae' es el set chileno.
    const portionSystem: PortionSystem = coachSystem === 'smae' ? 'smae' : 'cl'
    return {
      visibility: {
        portionSystem,
        legacySystems: usedSystems.filter((system) => system !== portionSystem),
      },
      degraded: false,
    }
  } catch {
    return { visibility: null, degraded: true }
  }
}

/** Catálogo V2 scoped: system + grupos propios + grupo del Team activo, con su conteo de equivalencias. */
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const scope = {
    scopeType: request.nextUrl.searchParams.get('scopeType'),
    teamId: request.nextUrl.searchParams.get('teamId') || null,
    orgId: request.nextUrl.searchParams.get('orgId') || null,
  }
  const resolved = await gateCoach(request, scope)
  if (!resolved.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: resolved.response.status })
    return resolved.response
  }

  const groups = await getExchangeGroupsForCoach(
    dbOf(resolved.gate),
    resolved.gate.coachId!,
    workspaceOf(resolved.scope),
  )
  // En paralelo a propósito: son dos caminos independientes y la visibilidad son 4 queries
  // (coaches + versiones + targets V2 + targets V1). Encadenarlas sumaría un round-trip completo a
  // cada apertura del picker (DATA §7.1.1 avisa del costo por request).
  const [foodCounts, visibilityRead] = await Promise.all([
    foodCountsFor(resolved.gate, groups.map((group) => group.id)),
    visibilityFor(resolved.gate, resolved.gate.coachId!),
  ])
  // `JSON.stringify` descarta las llaves `undefined`: en el modo degradado el cuerpo vuelve a ser
  // exactamente `{ groups, foodCounts }`, que es lo que ya entiende el binario RN viejo.
  const response = jsonNoStore({
    groups,
    foodCounts,
    portionSystem: visibilityRead.visibility?.portionSystem,
    legacySystems: visibilityRead.visibility?.legacySystems,
  })
  // La RESPUESTA no cambia (sigue omitiendo las dos llaves): el marcador va solo al log. Usa
  // `errorCode` —y no `payload`— porque `logNutritionV2Api` de `payload` solo emite su tamaño en
  // bytes, así que un `{ visibilityDegraded: true }` ahí sería invisible en el log.
  logNutritionV2Api({
    route: ROUTE,
    startedAt,
    status: response.status,
    payload: { count: groups.length },
    errorCode: visibilityRead.degraded ? 'VISIBILITY_DEGRADED' : undefined,
  })
  return response
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return invalid('Solicitud inválida.')
  const raw = body as Record<string, unknown>
  const resolved = await gateCoach(request, raw.workspace, true)
  if (!resolved.ok) return resolved.response

  const parsed = CreateExchangeGroupSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Datos de grupo inválidos.')

  const result = await createCoachExchangeGroup(dbOf(resolved.gate), {
    actorCoachId: resolved.gate.coachId!,
    scope: workspaceOf(resolved.scope),
    values: valuesOf(parsed.data),
  })
  if (!result.success) return jsonNoStore({ error: result.error, code: 'GROUP_WRITE_FAILED' }, 400)

  const response = jsonNoStore({ ok: true, group: result.group })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}

export async function PATCH(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return invalid('Solicitud inválida.')
  const raw = body as Record<string, unknown>
  const resolved = await gateCoach(request, raw.workspace, true)
  if (!resolved.ok) return resolved.response

  const parsed = UpdateExchangeGroupSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Datos de grupo inválidos.')

  const result = await updateCoachExchangeGroup(dbOf(resolved.gate), {
    actorCoachId: resolved.gate.coachId!,
    scope: workspaceOf(resolved.scope),
    groupId: parsed.data.groupId,
    values: valuesOf(parsed.data),
  })
  if (!result.success) return jsonNoStore({ error: result.error, code: 'GROUP_WRITE_FAILED' }, 400)

  const response = jsonNoStore({ ok: true, group: result.group })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}

export async function DELETE(request: NextRequest) {
  const startedAt = Date.now()
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return invalid('Solicitud inválida.')
  const raw = body as Record<string, unknown>
  const resolved = await gateCoach(request, raw.workspace, true)
  if (!resolved.ok) return resolved.response

  const parsed = DeleteExchangeGroupSchema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Datos de grupo inválidos.')

  const result = await deleteCoachExchangeGroup(dbOf(resolved.gate), {
    actorCoachId: resolved.gate.coachId!,
    scope: workspaceOf(resolved.scope),
    groupId: parsed.data.groupId,
  })
  if (!result.success) {
    return jsonNoStore({ error: result.error ?? 'No se pudo eliminar el grupo.', code: 'GROUP_WRITE_FAILED' }, 400)
  }

  const response = jsonNoStore({ ok: true, groupId: parsed.data.groupId })
  logNutritionV2Api({ route: ROUTE, startedAt, status: response.status })
  return response
}
