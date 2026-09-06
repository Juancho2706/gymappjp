import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionLegacyHistoryDetailReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeVoidSchema,
  NutritionPlanDraftSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  SubstitutionIntakeRequestSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionLegacyHistoryDetailReadModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionIntakeVoid,
  type NutritionItemSubstitution,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
  type SubstitutionIntakeRequest,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { z } from 'zod'
import { ApiError, apiFetch } from './api'
import {
  CoachFoodInputSchema,
  NUTRITION_PRO_FEATURE_LABEL,
  publishFail,
  requiredNutritionProFeature,
  zodFields,
  type BuilderFood,
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
  injectSubstitutionsIntoDraft,
  mapPublishFailureCode,
  quickEditEffectiveFrom,
  type PublishEffectiveFromChoice,
  type QuickEditPublishResult,
} from './nutrition-v2-quick-edit'
// T3.3a: el estado del quick-edit RN es la gramatica COMPARTIDA del paquete (R1); el draft se
// proyecta con la MISMA dupla del web (readModelToDraft + applyQuickEditToDraft).
import {
  applyQuickEditToDraft,
  readModelToDraft,
  type QuickEditState,
} from '@eva/nutrition-v2'

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

/** Detalle solo lectura de un día histórico creado antes del corte Nutrition V2. */
export async function getNutritionLegacyHistoryDetailV2(input: {
  date: string
  signal?: AbortSignal
}): Promise<NutritionLegacyHistoryDetailReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({ view: 'history-detail', date: input.date })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionLegacyHistoryDetailReadModelSchema.parse(raw)
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

// ---------------------------------------------------------------------------
// NUT-026 — Roster liviano del workspace para el selector de alumnos (diálogo "Asignar a otros
// alumnos"). Antes el diálogo RN resolvía el roster paginando el hub scoped con un bucle
// `for (page = 0; page < 8; page += 1)` de `pageSize: 50` y filtraba client-side: tope silencioso
// de 400 alumnos (el #401 invisible E inbuscable, sin aviso), ocho round-trips encadenados al
// abrir, y cada uno calculando métricas de consumo que el picker no usa.
//
// Ahora la búsqueda y la paginación viven en `get_nutrition_coach_roster_scoped_v2` (migración
// 20260728132000), la MISMA RPC que alimenta los pickers web. Es una LECTURA scoped: la función
// re-valida contra `auth.uid()` que cada alumno pertenece al workspace declarado, así que el scope
// nunca se cree del cliente y no hace falta un endpoint intermedio (las ESCRITURAS del coach sí
// pasan siempre por `/api/mobile/nutrition-v2/coach/mutate`, NUT-005).
//
// El read model es local a este módulo a propósito: es una proyección de UI del roster, no un
// contrato de dominio compartido (idéntica decisión que en `nutrition-v2-read.service.ts`).
// ---------------------------------------------------------------------------

const NutritionCoachRosterPageSchema = z.object({
  schemaVersion: z.number(),
  generatedAt: z.string(),
  items: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string().nullable(),
      planStatus: z.string().nullable(),
    }),
  ),
  nextCursor: z.object({ name: z.string(), clientId: z.string() }).nullable(),
  hasMore: z.boolean(),
})

export type NutritionCoachRosterPage = z.infer<typeof NutritionCoachRosterPageSchema>
export type NutritionCoachRosterEntry = NutritionCoachRosterPage['items'][number]

/** Tope de la RPC (`least(greatest(p_page_size,1),100)`): pedir más no trae más. */
export const NUTRITION_COACH_ROSTER_PAGE_SIZE = 50

/**
 * Una página alfabética del roster del workspace. `search` (>= 1 carácter útil) filtra
 * SERVER-SIDE sobre todo el workspace, tolerante a mayúsculas y acentos; `cursorName`/
 * `cursorClientId` continúan el keyset. Lanza si la RPC falla o el contrato no calza: el
 * llamador decide la degradación (el diálogo muestra el aviso de fallo).
 */
export async function getNutritionCoachRosterV2(input: {
  db: NutritionV2WriteClient
  scope: NutritionV2CoachScope
  search?: string | null
  cursorName?: string | null
  cursorClientId?: string | null
  pageSize?: number
}): Promise<NutritionCoachRosterPage> {
  const search = input.search?.trim() ? input.search.trim().slice(0, 120) : null
  const { data, error } = await input.db.rpc('get_nutrition_coach_roster_scoped_v2', {
    p_scope_type: input.scope.scopeType,
    p_team_id: input.scope.teamId,
    p_org_id: input.scope.orgId,
    p_search: search,
    p_cursor_name: input.cursorName ?? null,
    p_cursor_client_id: input.cursorClientId ?? null,
    p_page_size: input.pageSize ?? NUTRITION_COACH_ROSTER_PAGE_SIZE,
  })
  if (error) throw new Error(error.message || 'nutrition_v2_coach_roster_failed')
  return NutritionCoachRosterPageSchema.parse(data)
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

/**
 * T2.4: registrar un reemplazo AUTORIZADO por el coach. Manda solo la INTENCION — el alimento,
 * la cantidad, la franja y los macros los resuelve el servidor desde la fila autorizada, con el
 * mismo servicio que usa la web.
 *
 * La respuesta puede venir como `record` (registro nuevo) o `correct` (el item ya estaba
 * registrado y se cambio por el reemplazo): las dos son exitos, y la distincion sirve para el
 * copy y para el status HTTP.
 */
export async function substituteNutritionIntakeV2(
  payload: SubstitutionIntakeRequest,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'record' | 'correct' }> {
  const validated = SubstitutionIntakeRequestSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'substitute', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action === 'void') throw new Error('Unexpected Nutrition V2 action')
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
      error: `Este plan usa ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}. Esa función no está habilitada en esta cuenta ahora mismo.`,
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
  /**
   * W3.2 «Cantidades honestas» (SPEC §6.2). `'today'` (default) = la fecha de `effectiveFrom`,
   * como siempre. `'tomorrow'` = el SERVIDOR la recalcula a hoy + 1 en la tz del alumno y la
   * versión vigente queda intacta hoy: no se rearma el snapshot del día, así que los registros
   * del alumno no pueden quedar huérfanos (cero fantasmas por construcción).
   */
  effectiveFromChoice?: PublishEffectiveFromChoice
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
    effectiveFromChoice: input.effectiveFromChoice ?? 'today',
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
  /** Read model CONGELADO al montar el modo edicion (misma base que hidrato el estado). */
  planModel: NutritionPlanReadModel
  /** Arbol editable de la gramatica compartida (@eva/nutrition-v2, R1). */
  state: QuickEditState
  /** Reemplazos autorizados (F-02) de la versión base, por prescriptionItemId (carry-over). */
  carryOverSubstitutions?: ReadonlyMap<string, NutritionItemSubstitution[]>
  idempotencyKey: string
  todayIso: string
  /** W3.2: vigencia elegida por el coach cuando el alumno ya registró hoy. Default 'today'. */
  effectiveFromChoice?: PublishEffectiveFromChoice
}): Promise<QuickEditPublishResult> {
  // Proyeccion identica a la del web: draft base del read model + arbol editable encima. Las
  // porciones viajan EN el arbol (ya no hay estado paralelo) y el server re-congela snapshots.
  const plan = input.planModel.plan
  const baseDraft = readModelToDraft(input.planModel, input.clientId)
  if (!plan || !baseDraft) {
    return { ok: false, code: 'VALIDATION', message: 'No hay un plan vigente para editar.' }
  }
  let draft = applyQuickEditToDraft(baseDraft, input.state)
  // Carry-over F-02: el estado RN hidrata SIN reemplazos (llegan por fetch aparte); se
  // re-inyectan por prescriptionItemId para que republicar no los borre (NUT-008 gatea antes).
  if (input.carryOverSubstitutions && input.carryOverSubstitutions.size > 0) {
    draft = injectSubstitutionsIntoDraft(draft, input.carryOverSubstitutions)
  }
  const effectiveFrom = quickEditEffectiveFrom(input.todayIso, plan.effectiveFrom)

  const res = await publishQuickEditDraftRN({
    scope: input.scope,
    draft,
    baseVersionId: plan.versionId,
    idempotencyKey: input.idempotencyKey,
    effectiveFrom,
    // La fecha de arriba es la de SIEMPRE (hoy, o la vigencia futura de la base). Con
    // «Aplicar desde mañana» el servidor la pisa: la tz del alumno vive server-side.
    effectiveFromChoice: input.effectiveFromChoice ?? 'today',
  })
  if (res.ok) return { ok: true, versionId: res.versionId }
  return { ok: false, code: mapPublishFailureCode(res), message: res.error, ...(res.feature ? { feature: res.feature } : {}) }
}

/**
 * Guarda una PLANTILLA desde el editor unico RN (T3.3b): `templateId` presente la reescribe,
 * ausente crea una nueva. Sin CAS ni idempotencia — paridad exacta con el guardado del editor
 * web (ultima escritura gana). El servicio server-side quita la identidad del draft y valida el
 * round-trip antes de escribir, asi que el `clientId` de relleno jamas persiste.
 */
export async function savePlanTemplateRN(input: {
  scope: NutritionV2CoachScope
  templateId: string | null
  name: string
  description: string | null
  draft: unknown
}): Promise<{ ok: true; templateId: string } | { ok: false; error: string }> {
  const parsed = NutritionPlanDraftSchema.safeParse(input.draft)
  if (!parsed.success) {
    return { ok: false, error: 'La plantilla tiene datos invalidos.' }
  }
  const res = await coachMutate<{ ok: true; template: { id: string; name: string } }>({
    action: 'saveTemplate',
    workspace: input.scope,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    name: input.name,
    description: input.description,
    draft: parsed.data,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, templateId: res.data.template.id }
}

/**
 * Da de baja una plantilla de la biblioteca del coach (feedback en iOS, 22-08: «si no me sirven
 * quedan ahi para siempre»). Espejo de `deletePlanTemplateAction` de la web.
 *
 * Es SOFT-DELETE server-side: la fila queda para trazabilidad y los planes ya aplicados a alumnos
 * NO cambian (cada alumno tiene su propia version publicada, no un puntero a la plantilla). La
 * tenencia la decide el RPC definer detras del endpoint contra el `auth.uid()` del propio coach;
 * aca no hay chequeo de dueño que valga, solo el mapeo del error a copy.
 *
 * Vive en este archivo —y no junto a las LECTURAS de `nutrition-v2-plan-templates.api.ts`— porque
 * toda escritura del coach movil pasa por `coach/mutate` (NUT-005) y ese es el helper que vive aca.
 */
export async function deletePlanTemplateRN(input: {
  scope: NutritionV2CoachScope
  templateId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await coachMutate<{ ok: true }>({
    action: 'deleteTemplate',
    workspace: input.scope,
    templateId: input.templateId,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true }
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

/**
 * "Guardar en mi catálogo": alta de un alimento coach-scoped desde el "alimento libre con macros"
 * del builder RN. Era el ÚLTIMO camino de escritura del coach móvil que quedaba fuera del endpoint
 * (`createCoachFoodV2` insertaba directo en `foods` con el JWT de la sesión: la RLS lo acotaba al
 * coach dueño, pero el rollout de Nutrición V2 no lo miraba). Ahora POSTea la acción `createFood`,
 * que reusa el MISMO insert que la server action web y devuelve el alimento ya creado para que el
 * ítem pase a referenciar su id.
 */
export async function createCoachFoodRN(input: {
  scope: NutritionV2CoachScope
  input: unknown
}): Promise<{ ok: true; food: BuilderFood } | PublishFailure> {
  const parsed = CoachFoodInputSchema.safeParse(input.input)
  if (!parsed.success) {
    return publishFail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.', zodFields(parsed.error))
  }

  const res = await coachMutate<{ ok: true; food: BuilderFood }>({
    action: 'createFood',
    workspace: input.scope,
    ...parsed.data,
  })
  if (!res.ok) return res
  return { ok: true, food: res.data.food }
}
