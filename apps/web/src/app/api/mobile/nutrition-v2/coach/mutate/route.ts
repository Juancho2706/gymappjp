import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NutritionClientDetailReadModelSchema,
  NutritionPlanDraftSchema,
  NutritionV2CoachScopeSchema,
  type NutritionPlanDraft,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  type NutritionV2ApiGate,
} from '../../_shared'
import { jsonRateLimited, rateLimitNutritionCoachWrite } from '@/lib/rate-limit'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  hasNutritionProV2,
  requiredNutritionProFeature,
  type NutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  persistAndPublishDraft,
  resolveActiveClientPlanId,
  type NutritionV2Db,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import {
  MAX_ASSIGN_TARGETS,
  aggregateAssignResults,
  assignmentKeyForClient,
  buildDraftForTarget,
  validateAssignTargets,
  type AssignClientResult,
} from '@/app/coach/nutrition-v2/_lib/assign-plan'
import { ArchivePlanInputSchema, classifyArchiveWrite } from '@/app/coach/nutrition-v2/_lib/archive-plan'
import { CoachFoodInputSchema, insertCoachFood } from '@/app/coach/nutrition-v2/_lib/coach-food'

/**
 * Escrituras del COACH en mobile (NUT-005). Antes RN escribia DIRECTO contra PostgREST/RPC con el
 * JWT de la sesion: ni la RLS ni `publish_nutrition_plan_v2` miran rollout ni entitlements, asi que
 * el kill-switch de Edge Config y el addon "Nutricion Pro" vivian SOLO en el cliente para el camino
 * de escritura mas nuevo del producto (rollback documentado = parcial; gate comercial sin barrera).
 *
 * Este endpoint es esa barrera:
 *  - gate `mobileCoach` + `mutation: true` con el WORKSPACE declarado (helper compartido con
 *    `api/mobile/config`, NUT-013): rollout OFF o workspace ajeno => 404 / 403 antes de tocar nada;
 *  - entitlement Pro resuelto SERVER-SIDE (`hasNutritionProV2`) contra el scope real del coach;
 *  - persistencia con el cliente RLS del USUARIO (`gate.rpc`, jamas service_role): la RLS y las
 *    RPC scoped siguen siendo la barrera de tenencia;
 *  - reuso EXACTO del camino de escritura web (`persistAndPublishDraft`, `buildDraftForTarget`,
 *    `classifyArchiveWrite`): una sola implementacion para web y RN (cierra la divergencia
 *    NUT-037/NUT-039).
 *
 * Idempotencia: vive en las claves del payload (`publish_idempotency_key` / `operationId` por
 * destino), no en el transporte. Un reintento HTTP con la MISMA clave devuelve la version ya
 * publicada; jamas crea una segunda.
 */

const WorkspaceSchema = NutritionV2CoachScopeSchema

const PublishSchema = z.object({
  action: z.literal('publish'),
  workspace: WorkspaceSchema,
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
  expectedCurrentVersionId: z.string().uuid().optional(),
})

const QuickEditPublishSchema = z.object({
  action: z.literal('quickEditPublish'),
  workspace: WorkspaceSchema,
  draft: NutritionPlanDraftSchema,
  /** Version vigente sobre la que se edito: CAS del RPC + fuente del carry-over de notas. */
  baseVersionId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
})

const AssignSchema = z.object({
  action: z.literal('assign'),
  workspace: WorkspaceSchema,
  sourceClientId: z.string().uuid(),
  /** Version que el coach vio al abrir el dialogo (guard anti-stale, NUT-012). */
  expectedVersionId: z.string().uuid(),
  targetClientIds: z.array(z.string().uuid()).min(1).max(MAX_ASSIGN_TARGETS),
  effectiveFrom: z.string().date(),
  operationId: z.string().trim().min(8).max(200),
})

const ArchiveSchema = z.object({
  action: z.literal('archive'),
  workspace: WorkspaceSchema,
  clientId: z.string().uuid(),
  planId: z.string().uuid(),
})

/**
 * Alta de alimento coach-scoped desde el "alimento libre con macros" del builder RN. Era el
 * ULTIMO camino de escritura del coach movil fuera de este endpoint: `createCoachFoodV2`
 * insertaba directo en `foods` con el JWT de la sesion, asi que la RLS lo acotaba al coach dueno
 * pero el rollout de Nutricion V2 no lo tocaba. Ahora comparte gate y el mismo INSERT que la web.
 */
const CreateFoodSchema = CoachFoodInputSchema.extend({
  action: z.literal('createFood'),
  workspace: WorkspaceSchema,
})

const ROUTE = 'mobile.nutrition-v2.coach.mutate'

/** HTTP honesto por codigo de dominio (el cliente RN mapea por `code`, no por status). */
function statusForCode(code: string): number {
  switch (code) {
    case 'UPGRADE_REQUIRED':
    case 'SCOPE_DENIED':
      return 403
    case 'PLAN_NOT_FOUND':
    case 'CLIENT_NOT_FOUND':
      return 404
    case 'STALE_BASE':
    case 'EFFECTIVE_DATE':
      return 409
    case 'INVALID_PAYLOAD':
    case 'INVALID_ACTION':
    case 'INVALID_DRAFT':
    case 'NEEDS_SLOT':
    case 'NEEDS_VARIANT':
    case 'SOURCE_NO_PLAN':
    case 'SOURCE_VERSION_MISMATCH':
    case 'NO_TARGETS':
    case 'TOO_MANY_TARGETS':
    case 'DUPLICATE_TARGETS':
    case 'SOURCE_IN_TARGETS':
      return 400
    default:
      return 422
  }
}

function failure(
  startedAt: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {}
) {
  const status = statusForCode(code)
  logNutritionV2Api({ route: ROUTE, startedAt, status, errorCode: code })
  return jsonNoStore({ ok: false, code, error, ...extra }, status)
}

function zodFields(error: z.ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

function hasContent(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Contexto Pro del coach: el pool (team) manda; standalone/enterprise resuelven por el coach. */
function proCtx(gate: NutritionV2ApiGate) {
  return { coachId: gate.coachId, teamId: gate.teamId }
}

/**
 * Gate comercial Pro server-side sobre el draft. `grandfathered` lista las capacidades que la
 * version BASE ya tenia (quick-edit): preservar contenido Pro existente no es crearlo.
 */
async function proGate(
  gate: NutritionV2ApiGate,
  draft: NutritionPlanDraft,
  grandfathered: ReadonlySet<NutritionProFeature> = new Set(),
): Promise<{ ok: true } | { ok: false; feature: NutritionProFeature }> {
  const feature = requiredNutritionProFeature(draft)
  if (!feature || grandfathered.has(feature)) return { ok: true }
  const enabled = await hasNutritionProV2(gate.rpc as unknown as SupabaseClient, proCtx(gate))
  return enabled ? { ok: true } : { ok: false, feature }
}

interface BaseVersionRow {
  id: string
  plan_id: string
  strategy: string
  protocol_notes: string | null
}

/**
 * Version base leida por el `publish` del wizard: solo las notas que el asistente NO edita.
 * OJO: nunca seleccionar `private_notes` (columna deprecada, sin grant de SELECT para
 * `authenticated`: pedirla tira 42501 sobre nutrition_plan_versions_v2).
 */
interface PublishBaseVersionRow {
  id: string
  plan_id: string
  protocol_notes: string | null
  visible_notes: string | null
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return failure(startedAt, 'INVALID_PAYLOAD', 'La solicitud tiene datos inválidos.')
  }
  const raw = body as Record<string, unknown>

  const workspace = NutritionV2CoachScopeSchema.safeParse(raw.workspace)
  if (!workspace.success) {
    return failure(startedAt, 'INVALID_WORKSPACE_SCOPE', 'Workspace inválido.')
  }

  // Alumno objetivo de la mutación: alimenta el canary por alumno del gate (y solo eso; la
  // autorización real la dan la RLS y las RPC scoped).
  const requestedClientId =
    typeof raw.sourceClientId === 'string'
      ? raw.sourceClientId
      : typeof raw.clientId === 'string'
        ? raw.clientId
        : typeof (raw.draft as { clientId?: unknown } | undefined)?.clientId === 'string'
          ? ((raw.draft as { clientId: string }).clientId)
          : null

  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileCoach',
    mutation: true,
    coachScope: workspace.data,
    requestedClientId,
  })
  if (!gate.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: gate.response.status })
    return gate.response
  }

  const limited = await rateLimitNutritionCoachWrite(gate.userId)
  if (!limited.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: 429, errorCode: 'RATE_LIMIT' })
    return jsonRateLimited(limited.retryAfter)
  }

  const db = gate.rpc as unknown as NutritionV2Db

  switch (raw.action) {
    case 'publish':
      return handlePublish(gate, db, raw, startedAt)
    case 'quickEditPublish':
      return handleQuickEditPublish(gate, db, raw, startedAt)
    case 'assign':
      return handleAssign(gate, db, raw, startedAt, workspace.data)
    case 'archive':
      return handleArchive(gate, db, raw, startedAt)
    case 'createFood':
      return handleCreateFood(gate, db, raw, startedAt)
    default:
      return failure(startedAt, 'INVALID_ACTION', 'Acción inválida.', {})
  }
}

async function handlePublish(
  gate: NutritionV2ApiGate,
  db: NutritionV2Db,
  raw: Record<string, unknown>,
  startedAt: number,
) {
  const parsed = PublishSchema.safeParse(raw)
  if (!parsed.success) {
    return failure(
      startedAt,
      'INVALID_PAYLOAD',
      'El plan tiene datos inválidos.',
      { fields: zodFields(parsed.error) },
    )
  }
  const { draft, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = parsed.data

  const pro = await proGate(gate, draft)
  if (!pro.ok) {
    return failure(
      startedAt,
      'UPGRADE_REQUIRED',
      `Activa Nutrición Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[pro.feature]}.`,
      { feature: pro.feature },
    )
  }

  // Carry-over de NOTAS al republicar desde el asistente RN (misma perdida de datos que la ola 0
  // arreglo en la web): publicar reescribe la version COMPLETA, asi que lo que el wizard no edita
  // hay que reponerlo desde la version base que el coach tenia en pantalla (la misma del CAS).
  //  - `protocol_notes`: SIEMPRE server-side. El wizard no tiene campo y `assembleDraft` emite
  //    null; reponerlo DESPUES del gate Pro es grandfathering por construccion (el valor sale de
  //    una version YA publicada, no es forjable desde el cliente) y no bloquea a un coach base.
  //  - `visible_notes`: RESPALDO defensivo. El draft las trae desde la rehidratacion del wizard;
  //    solo si llegan vacias (binario RN viejo, sin el carry-over cliente) se reponen de la base.
  //    NO es capacidad Pro, asi que no toca el gate. El borrado intencional de notas vive en la
  //    edicion rapida (`quickEditPublish`, que SI las edita y por eso no lleva este respaldo).
  let draftToPersist = draft
  if (expectedCurrentVersionId && draft.planId) {
    const baseRes = await db
      .from('nutrition_plan_versions_v2')
      .select<PublishBaseVersionRow>('id, plan_id, protocol_notes, visible_notes')
      .eq('id', expectedCurrentVersionId)
      .maybeSingle()
    // Fail-closed: sin la version base no podemos garantizar que la publicacion no borre notas.
    if (baseRes.error) {
      return failure(startedAt, 'SCOPE_DENIED', 'No pudimos leer la versión vigente del plan.', {})
    }
    const base = baseRes.data
    // Anti-confusion de ids: la version base debe pertenecer al plan que el draft republica.
    if (base && base.plan_id === draft.planId) {
      draftToPersist = {
        ...draft,
        ...(hasContent(base.protocol_notes) ? { protocolNotes: base.protocol_notes } : {}),
        ...(!hasContent(draft.visibleNotes) && hasContent(base.visible_notes)
          ? { visibleNotes: base.visible_notes }
          : {}),
      }
    }
  }

  const result = await persistAndPublishDraft({
    db,
    userId: gate.userId,
    draft: draftToPersist,
    idempotencyKey,
    effectiveFrom,
    ...(expectedCurrentVersionId ? { expectedCurrentVersionId } : {}),
  })
  if (!result.ok) {
    return failure(startedAt, result.code, result.error, {})
  }

  const payload = { ok: true as const, versionId: result.versionId, planId: result.planId }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}
async function handleQuickEditPublish(
  gate: NutritionV2ApiGate,
  db: NutritionV2Db,
  raw: Record<string, unknown>,
  startedAt: number,
) {
  const parsed = QuickEditPublishSchema.safeParse(raw)
  if (!parsed.success) {
    return failure(
      startedAt,
      'INVALID_PAYLOAD',
      'El plan tiene datos inválidos.',
      { fields: zodFields(parsed.error) },
    )
  }
  const { draft, baseVersionId, idempotencyKey, effectiveFrom } = parsed.data

  // Versión base: pertenencia al plan del draft (anti-confusión de ids) + carry-over de notas +
  // capacidades ya presentes para el delta-gate. Se lee con el cliente RLS del coach (fail-closed).
  const baseRes = await db
    .from('nutrition_plan_versions_v2')
    .select<BaseVersionRow>('id, plan_id, strategy, protocol_notes')
    .eq('id', baseVersionId)
    .maybeSingle()
  if (baseRes.error) {
    return failure(startedAt, 'SCOPE_DENIED', 'No pudimos leer la versión vigente del plan.', {})
  }
  const base = baseRes.data
  if (!base || !draft.planId || base.plan_id !== draft.planId) {
    return failure(
      startedAt,
      'PLAN_NOT_FOUND',
      'No se encontró la versión vigente de este plan. Recarga la ficha e intenta de nuevo.',
      {},
    )
  }

  // `private_notes` queda null (columna same-row deprecada) y `protocol_notes` es carry-over de la
  // base: el quick-edit no los edita y el publish reescribe el árbol completo.
  const merged: NutritionPlanDraft = { ...draft, privateNotes: null, protocolNotes: base.protocol_notes }

  const grandfathered = new Set<NutritionProFeature>()
  if (base.strategy === 'hybrid') grandfathered.add('hybrid_strategy')
  // El quick-edit no crea variantes: si el draft trae más de una, venían de la versión base.
  if (merged.dayVariants.length > 1) grandfathered.add('multi_variant')
  if (hasContent(base.protocol_notes)) grandfathered.add('protocol_notes')

  const pro = await proGate(gate, merged, grandfathered)
  if (!pro.ok) {
    return failure(
      startedAt,
      'UPGRADE_REQUIRED',
      `Activa Nutrición Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[pro.feature]}.`,
      { feature: pro.feature },
    )
  }

  const result = await persistAndPublishDraft({
    db,
    userId: gate.userId,
    draft: merged,
    idempotencyKey,
    effectiveFrom,
    expectedCurrentVersionId: baseVersionId,
  })
  if (!result.ok) {
    return failure(startedAt, result.code, result.error, {})
  }

  const payload = { ok: true as const, versionId: result.versionId, planId: result.planId }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}

async function handleAssign(
  gate: NutritionV2ApiGate,
  db: NutritionV2Db,
  raw: Record<string, unknown>,
  startedAt: number,
  workspace: z.infer<typeof WorkspaceSchema>,
) {
  const parsed = AssignSchema.safeParse(raw)
  if (!parsed.success) {
    return failure(
      startedAt,
      'INVALID_PAYLOAD',
      'La asignación tiene datos inválidos.',
      { fields: zodFields(parsed.error) },
    )
  }
  const { sourceClientId, expectedVersionId, targetClientIds, effectiveFrom, operationId } = parsed.data

  const targetsCheck = validateAssignTargets(sourceClientId, targetClientIds)
  if (!targetsCheck.ok) {
    return failure(startedAt, targetsCheck.code, targetsCheck.error, {})
  }
  const targets = targetsCheck.targets

  // NUT-012: la FUENTE se relee SIEMPRE server-side (la pantalla RN puede venir de caché stale) y
  // se compara con la versión que el coach vio al abrir el diálogo.
  const sourceRes = await gate.rpc.rpc('get_nutrition_client_detail_scoped_v2', {
    p_client_id: sourceClientId,
    p_scope_type: workspace.scopeType,
    p_team_id: workspace.teamId,
    p_org_id: workspace.orgId,
    p_local_date: todayInSantiago(),
    p_timezone: 'America/Santiago',
  })
  if (sourceRes.error) {
    return failure(
      startedAt,
      sourceRes.error.code === '42501' ? 'SCOPE_DENIED' : 'SOURCE_READ_FAILED',
      'No pudimos releer el plan de origen. Intenta de nuevo.',
      {},
    )
  }
  const detail = NutritionClientDetailReadModelSchema.safeParse(sourceRes.data)
  if (!detail.success) {
    return failure(startedAt, 'SOURCE_READ_FAILED', 'No pudimos releer el plan de origen. Intenta de nuevo.', {})
  }
  const source = detail.data.plan
  if (!source.plan || source.dayVariants.length === 0) {
    return failure(startedAt, 'SOURCE_NO_PLAN', 'El alumno de origen no tiene un plan V2 vigente para copiar.', {})
  }
  if (source.plan.versionId !== expectedVersionId) {
    return failure(
      startedAt,
      'SOURCE_VERSION_MISMATCH',
      'El plan de origen cambió. Vuelve a abrir el diálogo e intenta de nuevo.',
      {},
    )
  }

  // Gate Pro sobre el draft RESULTANTE (idéntico para todos los destinos): se checa UNA vez.
  const probe = buildDraftForTarget({ source, targetClientId: targets[0], effectiveFrom })
  if (!probe.ok) {
    return failure(startedAt, 'SOURCE_NO_PLAN', probe.error, {})
  }
  const pro = await proGate(gate, probe.draft)
  if (!pro.ok) {
    return failure(
      startedAt,
      'UPGRADE_REQUIRED',
      `Activa Nutrición Pro para asignar ${NUTRITION_PRO_FEATURE_LABEL[pro.feature]}.`,
      { feature: pro.feature },
    )
  }

  // Publicación por alumno destino (reporte PARCIAL: no aborta al primer fallo).
  const results: AssignClientResult[] = []
  for (const targetClientId of targets) {
    const planIdRes = await resolveActiveClientPlanId(db, targetClientId)
    if (!planIdRes.ok) {
      results.push({ clientId: targetClientId, ok: false, error: planIdRes.error })
      continue
    }

    const built = buildDraftForTarget({ source, targetClientId, effectiveFrom, planId: planIdRes.planId })
    if (!built.ok) {
      results.push({ clientId: targetClientId, ok: false, error: built.error })
      continue
    }

    const validated = NutritionPlanDraftSchema.safeParse(built.draft)
    if (!validated.success) {
      results.push({ clientId: targetClientId, ok: false, error: 'El plan copiado quedó inválido para este alumno.' })
      continue
    }

    const publishRes = await persistAndPublishDraft({
      db,
      userId: gate.userId,
      draft: validated.data,
      idempotencyKey: assignmentKeyForClient({ operationId, targetClientId }),
      effectiveFrom,
    })
    results.push(
      publishRes.ok
        ? { clientId: targetClientId, ok: true, versionId: publishRes.versionId }
        : { clientId: targetClientId, ok: false, error: publishRes.error },
    )
  }

  const payload = { ok: true as const, results, summary: aggregateAssignResults(results) }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}

// Forma mínima del UPDATE de archivado (`nutrition_plans_v2` no está en database.types.ts): mismo
// patrón que la server action web. `.select('id')` devuelve las filas afectadas por RLS + WHERE.
type ArchiveDbResult = { data: Array<{ id: string }> | null; error: { code?: string; message?: string } | null }
interface ArchiveUpdateChain {
  eq(column: string, value: unknown): ArchiveUpdateChain
  select(columns: string): PromiseLike<ArchiveDbResult>
}
interface ArchiveDb {
  from(table: string): { update(values: Record<string, unknown>): ArchiveUpdateChain }
}

async function handleArchive(
  gate: NutritionV2ApiGate,
  db: NutritionV2Db,
  raw: Record<string, unknown>,
  startedAt: number,
) {
  const parsed = ArchiveSchema.safeParse(raw)
  if (!parsed.success) {
    return failure(startedAt, 'INVALID_PAYLOAD', 'La solicitud tiene datos inválidos.', {})
  }
  // Doble validación deliberada: el contrato compartido con la web es el que manda sobre los ids.
  const ids = ArchivePlanInputSchema.safeParse({ clientId: parsed.data.clientId, planId: parsed.data.planId })
  if (!ids.success) {
    return failure(startedAt, 'INVALID_PAYLOAD', 'La solicitud tiene datos inválidos.', {})
  }
  const { clientId, planId } = ids.data

  // UPDATE RLS-scoped e idempotente (el WHERE exige lifecycle_status='active': archivar dos veces
  // devuelve 0 filas => PLAN_NOT_FOUND, no un error). Solo columnas no congeladas por el trigger
  // de identidad. `updated_by` lo re-deriva el servidor (migración 20260728126000).
  const archiveDb = db as unknown as ArchiveDb
  const { data, error } = await archiveDb
    .from('nutrition_plans_v2')
    .update({
      lifecycle_status: 'archived',
      archived_at: new Date().toISOString(),
      updated_by: gate.userId,
    })
    .eq('id', planId)
    .eq('client_id', clientId)
    .eq('lifecycle_status', 'active')
    .select('id')

  const outcome = classifyArchiveWrite({ errorCode: error?.code, rowsAffected: data?.length ?? 0 })
  if (outcome.code !== 'OK') {
    return failure(startedAt, outcome.code, outcome.error, {})
  }

  const payload = { ok: true as const }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}

/**
 * "Guardar en mi catálogo" del builder RN. Sin gate Pro (paridad con la web: crear un alimento
 * propio es BASE); la barrera de tenencia es la RLS `foods_insert_own` sobre el cliente del propio
 * coach, y el gate de rollout/workspace ya corrió en `POST`. El INSERT es el MISMO que usa la
 * server action web (`insertCoachFood`).
 */
async function handleCreateFood(
  gate: NutritionV2ApiGate,
  db: NutritionV2Db,
  raw: Record<string, unknown>,
  startedAt: number,
) {
  const parsed = CreateFoodSchema.safeParse(raw)
  if (!parsed.success) {
    return failure(
      startedAt,
      'INVALID_PAYLOAD',
      'El alimento tiene datos inválidos.',
      { fields: zodFields(parsed.error) },
    )
  }
  // `insertCoachFood` re-valida con `CoachFoodInputSchema`, que descarta `action`/`workspace`.
  const created = await insertCoachFood({ db, userId: gate.userId, input: parsed.data })
  if (!created.ok) {
    return failure(startedAt, created.code, created.error, {})
  }

  const payload = { ok: true as const, food: created.food }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}
