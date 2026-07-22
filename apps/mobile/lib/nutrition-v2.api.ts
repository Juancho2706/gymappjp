import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionPlanDraftSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { apiFetch } from './api'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  mapWriteError,
  persistAndPublishDraft,
  requiredNutritionProFeature,
  type NutritionProFeature,
  type NutritionV2WriteClient,
} from './nutrition-v2-builder'
import {
  aggregateAssignResults,
  assignmentKeyForClient,
  buildDraftForTarget,
  classifyArchiveWrite,
  validateAssignTargets,
  ArchivePlanInputSchema,
  type AssignClientResult,
  type AssignSourcePlan,
  type AssignSummary,
  type ArchiveWriteOutcome,
} from './nutrition-v2-assign-archive'

// Pure workspace->scope helpers live in a RN-free module so they stay unit-testable.
export {
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
  type NutritionV2WorkspaceInput,
} from './nutrition-v2-scope'

function params(values: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export async function getNutritionTodayV2(input: {
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionTodayReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'today',
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionTodayReadModelSchema.parse(raw)
}

export async function getNutritionPlanV2(input: {
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionPlanReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'plan',
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionPlanReadModelSchema.parse(raw)
}

export async function getNutritionHistoryV2(input: {
  before?: string | null
  pageSize?: number
  signal?: AbortSignal
}): Promise<NutritionHistoryPageReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'history',
      before: input.before,
      pageSize: input.pageSize ?? 14,
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionHistoryPageReadModelSchema.parse(raw)
}

export async function getNutritionCoachHubV2(input: {
  scope: NutritionV2CoachScope
  cursorUpdatedAt?: string | null
  cursorClientId?: string | null
  pageSize?: number
  signal?: AbortSignal
}): Promise<NutritionCoachHubPageReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/coach${params({
      view: 'hub',
      scopeType: input.scope.scopeType,
      teamId: input.scope.teamId,
      orgId: input.scope.orgId,
      cursorUpdatedAt: input.cursorUpdatedAt,
      cursorClientId: input.cursorClientId,
      pageSize: input.pageSize ?? 25,
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionCoachHubPageReadModelSchema.parse(raw)
}

export async function getNutritionClientDetailV2(input: {
  clientId: string
  scope: NutritionV2CoachScope
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionClientDetailReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/coach${params({
      view: 'client',
      clientId: input.clientId,
      scopeType: input.scope.scopeType,
      teamId: input.scope.teamId,
      orgId: input.scope.orgId,
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionClientDetailReadModelSchema.parse(raw)
}

type NutritionMutationResponse =
  | { ok: true; id: string; action: 'record' }
  | { ok: true; id: string; action: 'correct' }

function parseMutationResponse(raw: unknown): NutritionMutationResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Nutrition V2 mutation response')
  const value = raw as Record<string, unknown>
  if (
    value.ok !== true ||
    typeof value.id !== 'string' ||
    (value.action !== 'record' && value.action !== 'correct')
  ) {
    throw new Error('Invalid Nutrition V2 mutation response')
  }
  return value as NutritionMutationResponse
}

export async function recordNutritionIntakeV2(
  payload: NutritionIntakeMutation,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'record' }> {
  const validated = NutritionIntakeMutationSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'record', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action !== 'record') throw new Error('Unexpected Nutrition V2 action')
  return result
}

export async function correctNutritionIntakeV2(
  payload: NutritionIntakeCorrection,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'correct' }> {
  const validated = NutritionIntakeCorrectionSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'correct', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action !== 'correct') throw new Error('Unexpected Nutrition V2 action')
  return result
}

// ---------------------------------------------------------------------------
// Acciones de escritura del coach (4B-08): asignar plan a otros alumnos + archivar plan vigente.
// RN escribe DIRECTO contra Supabase con el cliente RLS de la sesión (mismo patrón con que el
// builder publica: `supabase as unknown as NutritionV2WriteClient`), NO vía API móvil (la ruta
// /api/mobile/nutrition-v2/coach es solo-lectura). La barrera real es server-side (RLS +
// publish_nutrition_plan_v2 / policies de nutrition_plans_v2); estos chequeos cliente solo
// humanizan/evitan fricción, jamás autorizan. Espejo de las server actions web
// (nutrition-assign.actions.ts / nutrition-archive.actions.ts). El guard offline (NetInfo) vive
// en la pantalla: aquí ya asumimos red, igual que la publicación del quick-edit.
// ---------------------------------------------------------------------------

/**
 * Resuelve el plan V2 ACTIVO de un alumno destino (para APPEND de una nueva versión en vez de
 * crear un plan duplicado). RLS-scoped: si el alumno está fuera del pool, no devuelve filas y se
 * retorna null (persistAndPublishDraft creará un plan nuevo, cuya escritura la RLS negará
 * igualmente). Elige el plan activo más reciente ante múltiples. Espejo del web
 * resolveActiveClientPlanId (plan-persistence.ts).
 */
async function resolveActiveClientPlanIdRN(
  db: NutritionV2WriteClient,
  clientId: string,
): Promise<{ ok: true; planId: string | null } | { ok: false; error: string }> {
  const res = await db
    .from('nutrition_plans_v2')
    .select('id')
    .eq('client_id', clientId)
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (res.error) return { ok: false, error: mapWriteError(res.error, 'plan-existente').error }
  const row = res.data as { id: string } | null
  return { ok: true, planId: row?.id ?? null }
}

export type AssignNutritionPlanResult =
  | { ok: true; results: AssignClientResult[]; summary: AssignSummary }
  | { ok: false; code: string; error: string; feature?: NutritionProFeature }

/**
 * Asigna el plan FUENTE a otros alumnos (D-03). Espejo 1:1 del web assignPlanToClientsAction:
 * valida la selección (pura), aplica el gate Pro UNA vez sobre el draft resultante (fail-closed:
 * sin addon + estrategia híbrida/multi-variante => UPGRADE_REQUIRED sin tocar la red) y, por CADA
 * destino, resuelve el plan activo (append-versión) o crea uno nuevo, valida el draft copiado
 * contra el contrato y publica con clave de idempotencia estable por (operación, destino). Reporte
 * PARCIAL: no aborta al primer fallo. La `source` es la estructura del plan que ya está en pantalla
 * (read-model del detalle), no re-consulta nada.
 */
export async function assignNutritionPlanToClients(input: {
  db: NutritionV2WriteClient
  userId: string
  source: AssignSourcePlan
  sourceClientId: string
  targetClientIds: string[]
  effectiveFrom: string
  operationId: string
  hasNutritionPro: boolean
}): Promise<AssignNutritionPlanResult> {
  const targetsCheck = validateAssignTargets(input.sourceClientId, input.targetClientIds)
  if (!targetsCheck.ok) return { ok: false, code: targetsCheck.code, error: targetsCheck.error }
  const targets = targetsCheck.targets

  if (!input.source.plan || input.source.dayVariants.length === 0) {
    return { ok: false, code: 'SOURCE_NO_PLAN', error: 'El alumno de origen no tiene un plan V2 vigente para copiar.' }
  }

  // Gate comercial del addon Nutrición Pro sobre el draft RESULTANTE (mismo para todos los
  // destinos): estrategia híbrida o múltiples variantes exigen el addon. Se checa UNA vez. El
  // servidor (RLS + RPC) lo RE-VALIDA; este chequeo cliente solo evita fricción.
  const probe = buildDraftForTarget({
    source: input.source,
    targetClientId: targets[0],
    effectiveFrom: input.effectiveFrom,
  })
  if (!probe.ok) return { ok: false, code: 'SOURCE_NO_PLAN', error: probe.error }
  const proFeature = requiredNutritionProFeature(probe.draft)
  if (proFeature && !input.hasNutritionPro) {
    return {
      ok: false,
      code: 'UPGRADE_REQUIRED',
      feature: proFeature,
      error: `Activa Nutricion Pro para asignar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
    }
  }

  // Publicación por alumno destino (reporte parcial: no aborta al primer fallo).
  const results: AssignClientResult[] = []
  for (const targetClientId of targets) {
    const planIdRes = await resolveActiveClientPlanIdRN(input.db, targetClientId)
    if (!planIdRes.ok) {
      results.push({ clientId: targetClientId, ok: false, error: planIdRes.error })
      continue
    }

    const built = buildDraftForTarget({
      source: input.source,
      targetClientId,
      effectiveFrom: input.effectiveFrom,
      planId: planIdRes.planId,
    })
    if (!built.ok) {
      results.push({ clientId: targetClientId, ok: false, error: built.error })
      continue
    }

    // Barrera server-side espejo: el draft copiado se re-valida contra el contrato antes de escribir.
    const validated = NutritionPlanDraftSchema.safeParse(built.draft)
    if (!validated.success) {
      results.push({ clientId: targetClientId, ok: false, error: 'El plan copiado quedo invalido para este alumno.' })
      continue
    }

    const idempotencyKey = assignmentKeyForClient({ operationId: input.operationId, targetClientId })
    const publishRes = await persistAndPublishDraft({
      db: input.db,
      userId: input.userId,
      draft: validated.data,
      idempotencyKey,
      effectiveFrom: input.effectiveFrom,
    })
    if (publishRes.ok) {
      results.push({ clientId: targetClientId, ok: true, versionId: publishRes.versionId })
    } else {
      results.push({ clientId: targetClientId, ok: false, error: publishRes.error })
    }
  }

  return { ok: true, results, summary: aggregateAssignResults(results) }
}

// Interfaz mínima para el UPDATE de archivado. `nutrition_plans_v2` no está en database.types.ts
// (dominio V2 aditivo); casteamos el cliente RLS de la sesión a esta forma acotada — mismo patrón
// que la web (nutrition-archive.actions.ts) y que NutritionV2WriteClient. El chain
// `.update().eq()*.select()` refleja PostgREST: `.select('id')` devuelve las filas afectadas por
// RLS + WHERE.
type ArchiveDbResult = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null }
interface ArchiveUpdateChain {
  eq(column: string, value: unknown): ArchiveUpdateChain
  select(columns: string): PromiseLike<ArchiveDbResult>
}
interface ArchiveDb {
  from(table: string): { update(values: Record<string, unknown>): ArchiveUpdateChain }
}

/**
 * Archiva el plan vigente de un alumno (D-04). Espejo del web archivePlanAction: UPDATE RLS-scoped
 * e idempotente (el WHERE exige lifecycle_status='active'; 2ª vez => 0 filas => PLAN_NOT_FOUND, no
 * un error) que solo toca columnas no congeladas por el trigger de identidad
 * (lifecycle_status/archived_at/updated_by). Valida los uuid ANTES de tocar la red. La RLS
 * (nutrition_plans_v2_update, can_manage_client) es la barrera real; aquí solo clasificamos con un
 * helper puro. Al OK, la pantalla re-lee el read-model (reloadNonce) y degrada a "Sin plan vigente".
 */
export async function archiveNutritionPlan(input: {
  db: NutritionV2WriteClient
  userId: string
  clientId: string
  planId: string
}): Promise<ArchiveWriteOutcome> {
  const parsed = ArchivePlanInputSchema.safeParse({ clientId: input.clientId, planId: input.planId })
  if (!parsed.success) {
    return { code: 'WRITE_FAILED', error: 'La solicitud tiene datos invalidos.' }
  }
  const db = input.db as unknown as ArchiveDb
  const { data, error } = await db
    .from('nutrition_plans_v2')
    .update({
      lifecycle_status: 'archived',
      archived_at: new Date().toISOString(),
      updated_by: input.userId,
    })
    .eq('id', input.planId)
    .eq('client_id', input.clientId)
    .eq('lifecycle_status', 'active')
    .select('id')

  return classifyArchiveWrite({ errorCode: error?.code, rowsAffected: data?.length ?? 0 })
}
