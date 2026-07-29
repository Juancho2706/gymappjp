import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeVoidSchema,
  NutritionPlanDraftSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionIntakeVoid,
  type NutritionItemSubstitution,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { ApiError, apiFetch } from './api'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  publishFail,
  requiredNutritionProFeature,
  zodFields,
  type NutritionProFeature,
  type NutritionV2WriteClient,
  type PublishFailure,
  type PublishResult,
} from './nutrition-v2-builder'
import {
  validateAssignTargets,
  ArchivePlanInputSchema,
  type AssignClientResult,
  type AssignSummary,
  type ArchiveWriteOutcome,
} from './nutrition-v2-assign-archive'
import {
  buildQuickEditPublishDraft,
  mapPublishFailureCode,
  type QuickEditBaseline,
  type QuickEditPortionsState,
  type QuickEditPublishResult,
  type QuickEditState,
} from './nutrition-v2-quick-edit'

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

// Interfaz mínima para leer `nutrition_v2_conversion_links` (espejo 1:1 del cast web
// `ConversionLinkClient`, `apps/web/src/services/nutrition-v2-read.service.ts:154-168`). La tabla
// aún NO está en `database.types.ts` — la crea la migración aditiva `20260717120000`, aplicada pero
// con los types sin regenerar; casteamos el cliente RLS de la sesión a esta forma acotada (cero
// `any` fuera de aquí). Retirar el cast cuando se regenere `database.types.ts` y el dominio V2 entre
// a los tipos generados.
type ConversionLinkClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { converted_at: string } | null
          error: { message: string; code?: string } | null
        }>
      }
    }
  }
}

/**
 * Link de trazabilidad V1->V2 del plan vigente para el banner "plan convertido" de la ficha coach
 * (D-08 / SPEC AC8). Espejo RN de `getNutritionConversionLinkForWeb`
 * (`nutrition-v2-read.service.ts:180-201`): lee DIRECTO con el cliente RLS de la sesión (mismo
 * camino autoritativo que las escrituras 4B-08); la RLS de `nutrition_v2_conversion_links` ya scopea
 * la fila al coach dueño (`coach_id = auth.uid()`) y el filtro por `v2_plan_id` acota a lo sumo un
 * link (1 plan V1 -> 1 plan V2). No-bloqueante por diseño: si la tabla no existe (migración sin
 * regen de types) o el read falla, degrada a `null` (sin banner) — el aviso es informativo, nunca
 * crítico para ver la ficha. Sin telemetría cliente en RN (el web loguea server-side).
 */
export async function getNutritionConversionLinkV2(input: {
  db: NutritionV2WriteClient
  v2PlanId: string
}): Promise<{ convertedAt: string } | null> {
  const client = input.db as unknown as ConversionLinkClient
  const { data, error } = await client
    .from('nutrition_v2_conversion_links')
    .select('converted_at')
    .eq('v2_plan_id', input.v2PlanId)
    .maybeSingle()
  if (error) return null
  return data ? { convertedAt: data.converted_at } : null
}

type NutritionMutationAction = 'record' | 'correct' | 'void'

// Union DISCRIMINADA (no `{ action: NutritionMutationAction }`): cada wrapper estrecha por
// `result.action !== '<suya>'` y devuelve el tipo exacto que promete su firma.
type NutritionMutationResponse =
  | { ok: true; id: string; action: 'record' }
  | { ok: true; id: string; action: 'correct' }
  | { ok: true; id: string; action: 'void' }

const MUTATION_ACTIONS: readonly NutritionMutationAction[] = ['record', 'correct', 'void']

function parseMutationResponse(raw: unknown): NutritionMutationResponse {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Nutrition V2 mutation response')
  const value = raw as Record<string, unknown>
  if (
    value.ok !== true ||
    typeof value.id !== 'string' ||
    !MUTATION_ACTIONS.includes(value.action as NutritionMutationAction)
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

/**
 * Retirar un registro (NUT-010, opción A). Payload MÍNIMO: el servidor marca la fila `voided` y
 * los read models —que ya filtran `entry_status = 'active'`— la dejan de ver. Es idempotente por
 * estado: retirar dos veces devuelve el mismo id, así que un reintento de la cola nunca duplica ni
 * falla. Paridad 1:1 con la server action web (`voidIntakeAction`).
 */
export async function voidNutritionIntakeV2(
  payload: NutritionIntakeVoid,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'void' }> {
  const validated = NutritionIntakeVoidSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'void', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action !== 'void') throw new Error('Unexpected Nutrition V2 action')
  return result
}

// ---------------------------------------------------------------------------
// Escrituras del COACH (NUT-005): TODAS pasan por la API móvil.
//
// Antes RN escribía DIRECTO contra PostgREST/RPC con el JWT de la sesión. Ni la RLS ni
// `publish_nutrition_plan_v2` miran rollout ni entitlements, así que el kill-switch de Edge Config
// y el addon "Nutrición Pro" vivían SOLO en el cliente para el camino de escritura del coach: el
// rollback documentado era parcial y el gate comercial no tenía barrera server-side.
//
// Ahora el único camino es POST /api/mobile/nutrition-v2/coach/mutate, que re-verifica rollout,
// workspace y entitlement server-side y persiste con el cliente RLS del propio usuario (jamás
// service_role) reusando el MISMO código de escritura que la web. Aquí solo quedan: validación de
// forma, chequeos cliente que evitan fricción (nunca autorizan) y el mapeo de errores a los códigos
// que las pantallas ya conocen. El guard offline (NetInfo) sigue viviendo en la pantalla.
// ---------------------------------------------------------------------------

const COACH_MUTATE_PATH = '/api/mobile/nutrition-v2/coach/mutate'

/** Falla de red (el endpoint no respondió): honesta y distinta de un rechazo del servidor. */
const NETWORK_FAILURE_COPY =
  'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'

function coachMutationFailure(error: unknown): PublishFailure {
  if (error instanceof ApiError) {
    return { ok: false, code: error.code ?? 'WRITE_FAILED', error: error.message }
  }
  return { ok: false, code: 'NETWORK', error: NETWORK_FAILURE_COPY }
}

/**
 * POST al endpoint de mutaciones del coach. Devuelve el payload crudo o un fallo TIPADO (nunca
 * lanza): las pantallas ya ramifican por `code`.
 */
async function coachMutate<T>(
  body: Record<string, unknown> & { action: string; workspace: NutritionV2CoachScope },
): Promise<{ ok: true; data: T } | PublishFailure> {
  try {
    const data = await apiFetch<T>(COACH_MUTATE_PATH, {
      method: 'POST',
      authenticated: true,
      body,
    })
    return { ok: true, data }
  } catch (error) {
    return coachMutationFailure(error)
  }
}

/**
 * Publica un draft del constructor RN. Valida la forma y aplica el gate Pro del cliente para evitar
 * un round-trip inútil; el servidor RE-VALIDA rollout, workspace y entitlement (barrera real).
 * `expectedCurrentVersionId` (CAS): al publicar una versión NUEVA de un plan vigente evita
 * superponerse a una publicación concurrente (STALE_BASE).
 */
export async function publishDraftRN(input: {
  scope: NutritionV2CoachScope
  draft: unknown
  idempotencyKey: string
  effectiveFrom: string
  hasNutritionPro: boolean
  expectedCurrentVersionId?: string | null
}): Promise<PublishResult> {
  const parsed = NutritionPlanDraftSchema.safeParse(input.draft)
  if (!parsed.success) {
    return publishFail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }
  const draft = parsed.data

  const proFeature = requiredNutritionProFeature(draft)
  if (proFeature && !input.hasNutritionPro) {
    return {
      ok: false,
      code: 'UPGRADE_REQUIRED',
      feature: proFeature,
      error: `Activa Nutricion Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
    }
  }

  const res = await coachMutate<{ ok: true; versionId: string; planId: string }>({
    action: 'publish',
    workspace: input.scope,
    draft,
    idempotencyKey: input.idempotencyKey,
    effectiveFrom: input.effectiveFrom,
    ...(input.expectedCurrentVersionId ? { expectedCurrentVersionId: input.expectedCurrentVersionId } : {}),
  })
  if (!res.ok) return res
  return { ok: true, versionId: res.data.versionId, planId: res.data.planId }
}

/**
 * Publica un draft de quick-edit. El servidor lee la versión base (carry-over de `protocol_notes`,
 * delta-gate Pro y CAS por `baseVersionId`), así que el cliente ya no toca `nutrition_plan_versions_v2`.
 */
export async function publishQuickEditDraftRN(input: {
  scope: NutritionV2CoachScope
  draft: unknown
  baseVersionId: string
  idempotencyKey: string
  effectiveFrom: string
}): Promise<PublishResult> {
  const parsed = NutritionPlanDraftSchema.safeParse(input.draft)
  if (!parsed.success) {
    return publishFail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }

  const res = await coachMutate<{ ok: true; versionId: string; planId: string }>({
    action: 'quickEditPublish',
    workspace: input.scope,
    draft: parsed.data,
    baseVersionId: input.baseVersionId,
    idempotencyKey: input.idempotencyKey,
    effectiveFrom: input.effectiveFrom,
  })
  if (!res.ok) return res
  return { ok: true, versionId: res.data.versionId, planId: res.data.planId }
}

/**
 * Publica el quick-edit del coach: arma el draft (puro) y lo manda al endpoint. El delta-gate Pro
 * (preservar contenido Pro existente ≠ crearlo), el carry-over de `protocol_notes` y el CAS contra
 * la versión base ocurren SERVER-SIDE; aquí solo se traducen los códigos a los que la pantalla ya
 * conoce.
 */
export async function publishQuickEditRN(input: {
  scope: NutritionV2CoachScope
  clientId: string
  baseline: QuickEditBaseline
  state: QuickEditState
  /** Estado de porciones (omitir = sin porciones). El snapshot de grupos lo congela el servidor. */
  portions?: { state: QuickEditPortionsState }
  /** Reemplazos autorizados (F-02) de la versión base, por prescriptionItemId (carry-over). */
  carryOverSubstitutions?: ReadonlyMap<string, NutritionItemSubstitution[]>
  idempotencyKey: string
  todayIso: string
}): Promise<QuickEditPublishResult> {
  const built = buildQuickEditPublishDraft({
    clientId: input.clientId,
    baseline: input.baseline,
    state: input.state,
    portions: input.portions,
    carryOverSubstitutions: input.carryOverSubstitutions,
    todayIso: input.todayIso,
  })
  if (!built.ok) return { ok: false, code: built.code, message: built.message }

  const res = await publishQuickEditDraftRN({
    scope: input.scope,
    draft: built.draft,
    baseVersionId: input.baseline.baseVersionId,
    idempotencyKey: input.idempotencyKey,
    effectiveFrom: built.effectiveFrom,
  })
  if (res.ok) return { ok: true, versionId: res.versionId }
  return { ok: false, code: mapPublishFailureCode(res), message: res.error, ...(res.feature ? { feature: res.feature } : {}) }
}

export type AssignNutritionPlanResult =
  | { ok: true; results: AssignClientResult[]; summary: AssignSummary }
  | { ok: false; code: string; error: string; feature?: NutritionProFeature }

/**
 * Asigna el plan FUENTE a otros alumnos (D-03). La selección se valida aquí (pura, sin red) y el
 * resto ocurre server-side: relectura de la fuente (NUT-012: la ficha RN puede venir de caché
 * stale), guard anti-stale contra `expectedVersionId`, gate Pro y publicación por destino con clave
 * de idempotencia estable por (operación, destino). Reporte PARCIAL: no aborta al primer fallo.
 */
export async function assignNutritionPlanToClients(input: {
  sourceClientId: string
  /** Scope del workspace activo del coach (el read model del detalle es scoped, fail-closed). */
  sourceScope: NutritionV2CoachScope
  /** `versionId` del plan vigente que la pantalla mostró al abrir el diálogo (CAS anti-stale). */
  expectedVersionId: string
  targetClientIds: string[]
  effectiveFrom: string
  operationId: string
}): Promise<AssignNutritionPlanResult> {
  const targetsCheck = validateAssignTargets(input.sourceClientId, input.targetClientIds)
  if (!targetsCheck.ok) return { ok: false, code: targetsCheck.code, error: targetsCheck.error }

  const res = await coachMutate<{ ok: true; results: AssignClientResult[]; summary: AssignSummary }>({
    action: 'assign',
    workspace: input.sourceScope,
    sourceClientId: input.sourceClientId,
    expectedVersionId: input.expectedVersionId,
    targetClientIds: targetsCheck.targets,
    effectiveFrom: input.effectiveFrom,
    operationId: input.operationId,
  })
  if (!res.ok) return { ok: false, code: res.code, error: res.error }
  return { ok: true, results: res.data.results, summary: res.data.summary }
}

/**
 * Archiva el plan vigente de un alumno (D-04). El UPDATE (RLS-scoped e idempotente: el WHERE exige
 * `lifecycle_status='active'`, así que archivar dos veces devuelve PLAN_NOT_FOUND y no un error)
 * corre server-side con el cliente RLS del coach. Al OK, la pantalla re-lee el read-model.
 */
export async function archiveNutritionPlan(input: {
  scope: NutritionV2CoachScope
  clientId: string
  planId: string
}): Promise<ArchiveWriteOutcome> {
  const parsed = ArchivePlanInputSchema.safeParse({ clientId: input.clientId, planId: input.planId })
  if (!parsed.success) {
    return { code: 'WRITE_FAILED', error: 'La solicitud tiene datos invalidos.' }
  }

  const res = await coachMutate<{ ok: true }>({
    action: 'archive',
    workspace: input.scope,
    clientId: parsed.data.clientId,
    planId: parsed.data.planId,
  })
  if (res.ok) return { code: 'OK' }
  if (res.code === 'PLAN_NOT_FOUND' || res.code === 'SCOPE_DENIED') {
    return { code: res.code, error: res.error }
  }
  return { code: 'WRITE_FAILED', error: res.error }
}
