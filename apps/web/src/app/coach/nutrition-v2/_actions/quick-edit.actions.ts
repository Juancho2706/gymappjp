'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  hasNutritionProV2,
  requiredNutritionProFeature,
  type NutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import {
  authorizeCoach,
  persistAndPublishDraft,
  zodFields,
  type ActionFailure,
  type NutritionV2Db,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'
import { collectBlankUuidPaths } from '@eva/nutrition-v2'

// Quick-edit V2 (edicion fluida del plan, web coach): publica una VERSION NUEVA por el MISMO
// pipeline canonico del builder (persistAndPublishDraft -> publish_nutrition_plan_v2), pero con:
//  - visible_notes EDITABLES (viajan en el draft del cliente); carry-over server-side solo de
//    protocol_notes (F1 no lo edita). `privateNotes` queda SIEMPRE null: no existe feature de
//    nota privada versionada (la columna same-row esta deprecada e ilegible y la tabla canonica
//    `nutrition_plan_private_notes_v2` no la escribe nadie — ver NUT-007),
//  - delta-gate Pro (solo gatea features Pro NUEVAS; preserva las grandfathered de un plan
//    convertido de V1 sin atrapar al coach),
//  - guard optimista de concurrencia (expectedCurrentVersionId = baseVersionId).
// Fail-closed: authorizeCoach re-verifica rollout + scope + rate limit; el RPC revalida can_manage.

export interface QuickEditPublishInput {
  clientId: string
  /** Version vigente desde la que se hidrato la edicion (compare-and-swap del guard optimista). */
  baseVersionId: string
  /** Baseline hidratado + cambios del coach; planId = plan vigente del alumno. */
  draft: NutritionPlanDraft
  /** Fresca por intencion de publicacion, estable en retries. */
  idempotencyKey: string
}

export type QuickEditPublishResult =
  | { ok: true; versionId: string; versionNumber: number }
  | {
      ok: false
      code:
        | 'STALE_BASE'
        | 'EFFECTIVE_DATE'
        | 'UPGRADE_REQUIRED'
        | 'FORBIDDEN'
        | 'RATE_LIMITED'
        | 'VALIDATION'
        /** Un dia del plan quedo sin ninguna comida: el alumno lo veria vacio. */
        | 'EMPTY_DAY'
        | 'UNKNOWN'
      feature?: NutritionProFeature
      /**
       * Mensaje YA redactado para el coach (es-CL) cuando el servidor sabe algo accionable.
       *
       * Existe por el defecto que reporto el owner (2026-08-05): `persistAndPublishDraft`
       * devuelve fallos con copy util —"Hay un día del plan sin ninguna comida (Lunes)…",
       * "Un grupo de porciones del plan ya no está disponible"— y este mapeo los colapsaba a
       * `UNKNOWN`, asi que la barra mostraba siempre "No se pudo publicar. Reintentar" y el
       * coach reintentaba en loop sin forma de saber que arreglar. Ausente = la UI usa su
       * copy generico de siempre.
       */
      message?: string
    }

const QuickEditInputSchema = z.object({
  clientId: z.string().uuid(),
  baseVersionId: z.string().uuid(),
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
})

/** Codigos de fallo de `persistAndPublishDraft` que mapean a cada codigo tipado del quick-edit. */
function toQuickEditFailure(failure: ActionFailure): QuickEditPublishResult {
  switch (failure.code) {
    case 'STALE_BASE':
      return { ok: false, code: 'STALE_BASE' }
    case 'EFFECTIVE_DATE':
      return { ok: false, code: 'EFFECTIVE_DATE' }
    case 'RATE_LIMITED':
      return { ok: false, code: 'RATE_LIMITED' }
    case 'SCOPE_DENIED':
    case 'UNAUTHENTICATED':
    case 'ROLLOUT_DISABLED':
    case 'SCOPE_REQUIRED':
      return { ok: false, code: 'FORBIDDEN' }
    // Dia sin comidas: es el fallo que dejaba planes imposibles de republicar. Viaja con su
    // propio codigo para que la UI marque el dia culpable, no solo pinte un error.
    case 'EMPTY_DAY_VARIANT':
      return { ok: false, code: 'EMPTY_DAY', message: failure.error }
    // Grupos de porciones que ya no resuelven: accionable ("recarga y vuelve a intentar").
    case 'EXCHANGE_GROUP_NOT_FOUND':
    case 'EXCHANGE_BASE_GROUP_NOT_FOUND':
      return { ok: false, code: 'VALIDATION', message: failure.error }
    case 'INVALID_PAYLOAD':
    case 'INVALID_DRAFT':
    case 'NEEDS_SLOT':
    case 'NEEDS_VARIANT':
    case 'PLAN_NOT_FOUND':
    case 'CLIENT_NOT_FOUND':
      return { ok: false, code: 'VALIDATION', message: failure.error }
    default:
      return { ok: false, code: 'UNKNOWN', message: failure.error }
  }
}

/** `today` (YYYY-MM-DD) en la zona horaria del alumno. `en-CA` produce el formato ISO. */
function todayInTimezone(timezone: string): string {
  const format = (tz: string): string =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  try {
    return format(timezone)
  } catch {
    return format('America/Santiago')
  }
}

interface BaseVersionRow {
  id: string
  plan_id: string
  strategy: 'structured' | 'flexible' | 'hybrid'
  effective_from: string | null
  visible_notes: string | null
  protocol_notes: string | null
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Publica una edicion rapida del plan vigente. Reuso total del pipeline canonico; el unico
 * camino nuevo de escritura es este ensamblado (carry-over + delta-gate + effectiveFrom + guard).
 */
export async function quickEditPublishAction(input: unknown): Promise<QuickEditPublishResult> {
  // (0) Identificadores VACIOS antes que nada. El schema ya los rechaza (`z.string().uuid()` /
  // `z.guid()`), pero su fallo llega como un "datos inválidos" generico: un '' colado por un
  // adaptador del picker o por un respaldo local viejo quedaria indistinguible de una cantidad
  // mal escrita. Nombrarlo aca deja el rastro exacto en el server y un mensaje claro en la UI,
  // y garantiza que jamas se convierta en un `invalid input syntax for type uuid: ""` (22P02)
  // opaco mas abajo.
  const blankIds = collectBlankUuidPaths((input as { draft?: unknown } | null)?.draft ?? null)
  if (blankIds.length > 0) {
    console.error('nutrition_v2_quick_edit_blank_uuid', { paths: blankIds.slice(0, 20) })
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'Un alimento o grupo del plan quedó sin identificador. Recarga la pantalla e inténtalo de nuevo.',
    }
  }

  const parsed = QuickEditInputSchema.safeParse(input)
  if (!parsed.success) {
    // El detalle de campos se pierde a proposito (contrato tipado del quick-edit); el log de zod
    // queda en el server. La UI muestra el estado VALIDATION generico.
    void zodFields(parsed.error)
    return { ok: false, code: 'VALIDATION' }
  }
  const { clientId, baseVersionId, draft, idempotencyKey } = parsed.data

  // El draft debe apuntar al alumno autenticado y a un plan existente (quick-edit NUNCA crea plan).
  if (draft.clientId !== clientId) return { ok: false, code: 'VALIDATION' }
  if (!draft.planId) return { ok: false, code: 'VALIDATION' }

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return toQuickEditFailure(auth)
  const { db, userId, proCtx } = auth

  // (2) Anti-confusion de ids: la version base debe pertenecer al plan del draft, y el plan al
  // alumno. Un id ajeno cae en 404 logico (VALIDATION) y nunca llega al RPC.
  // OJO: NO seleccionar `private_notes`. Esa columna esta DEPRECADA en la tabla de versiones
  // (20260714191500_nutrition_v2_private_notes) y `authenticated` NO tiene grant de SELECT sobre
  // ella (las notas privadas viven en nutrition_plan_private_notes_v2). Pedirla hacia el 42501
  // "permission denied for table nutrition_plan_versions_v2" -> UNKNOWN -> "No se pudo publicar".
  const baseRes = await db
    .from('nutrition_plan_versions_v2')
    .select<BaseVersionRow>(
      'id, plan_id, strategy, effective_from, visible_notes, protocol_notes',
    )
    .eq('id', baseVersionId)
    .maybeSingle()
  if (baseRes.error) return { ok: false, code: 'UNKNOWN' }
  const base = baseRes.data
  if (!base || base.plan_id !== draft.planId) return { ok: false, code: 'VALIDATION' }

  const planRes = await db
    .from('nutrition_plans_v2')
    .select<{ id: string; client_id: string }>('id, client_id')
    .eq('id', draft.planId)
    .maybeSingle()
  if (planRes.error) return { ok: false, code: 'UNKNOWN' }
  if (!planRes.data || planRes.data.client_id !== clientId) return { ok: false, code: 'VALIDATION' }

  // Cantidad de variantes de la version base (para `multi_variant` del delta-gate).
  const variantsRes = await db
    .from('nutrition_day_variants_v2')
    .select<{ id: string }>('id')
    .eq('version_id', baseVersionId)
  if (variantsRes.error) return { ok: false, code: 'UNKNOWN' }
  const baseVariantCount = variantsRes.data?.length ?? 0

  // (3) Notas: `visibleNotes` es EDITABLE en el quick-edit — viaja del cliente (ya paso el
  // schema: trim + max 8000; el coach esta autorizado sobre el alumno via authorizeCoach + RLS,
  // no hay forja posible mas alla de su propio contenido). '' se normaliza a null (paridad con
  // builder/conversion). protocol_notes sigue en carry-over desde la version base (F1 no lo
  // edita) y `privateNotes` queda null: la columna same-row esta deprecada y no es legible por
  // `authenticated`. OJO (NUT-007): NO existe hoy una feature de nota privada versionada. La
  // tabla canonica `nutrition_plan_private_notes_v2` tiene PK `version_id` y NINGUN camino de
  // la app la escribe, asi que no hay nada que preservar aqui; el dia que se implemente hara
  // falta copy-forward explicito de la nota de `baseVersionId` a la version nueva (sin eso,
  // cada republicacion la dejaria fuera del read model, que busca por la version vigente).
  const draftFinal: NutritionPlanDraft = {
    ...draft,
    visibleNotes: hasText(draft.visibleNotes) ? draft.visibleNotes : null,
    privateNotes: null,
    protocolNotes: base.protocol_notes,
  }

  // (4) Delta-gate Pro: solo gatea features Pro NUEVAS. Las presentes en la version base
  // (grandfathered, p.ej. un plan convertido de V1 con hybrid/protocol_notes) se PRESERVAN sin
  // exigir addon; introducir una feature Pro que la base no tenia sigue exigiendo addon.
  const baseFeatures = new Set<NutritionProFeature>()
  if (base.strategy === 'hybrid') baseFeatures.add('hybrid_strategy')
  if (baseVariantCount > 1) baseFeatures.add('multi_variant')
  // `private_notes` no se detecta desde la version row (columna deprecada e ilegible). El
  // quick-edit F1 nunca fija privateNotes (draftFinal.privateNotes = null), por lo que el draft
  // jamas requiere la feature 'private_notes' -> no hay nada que grandfatherear aqui.
  if (hasText(base.protocol_notes)) baseFeatures.add('protocol_notes')

  const newFeature = requiredNutritionProFeature(draftFinal)
  if (newFeature && !baseFeatures.has(newFeature)) {
    const proEnabled = await hasNutritionProV2(db as unknown as SupabaseClient, proCtx)
    if (!proEnabled) return { ok: false, code: 'UPGRADE_REQUIRED', feature: newFeature }
  }

  // (5) La edicion no puede "adelantar" un plan con vigencia futura: effectiveFrom = max(hoy en la
  // tz del alumno, effectiveFrom de la version base). Con la migracion same-day, el MISMO dia se
  // permite (supersede intra-dia); solo una fecha < vigente seria rechazada por el RPC.
  const today = todayInTimezone(draftFinal.timezone)
  const effectiveFrom = base.effective_from && base.effective_from > today ? base.effective_from : today

  // (6) Re-validacion server-side del draft (defensa en profundidad; ya paso el schema al entrar).
  const revalidated = NutritionPlanDraftSchema.safeParse(draftFinal)
  if (!revalidated.success) return { ok: false, code: 'VALIDATION' }

  // (7) Persistencia + publicacion transaccional con el guard optimista (compare-and-swap).
  const result = await persistAndPublishDraft({
    db,
    userId,
    draft: revalidated.data,
    idempotencyKey,
    effectiveFrom,
    expectedCurrentVersionId: baseVersionId,
  })
  if (!result.ok) return toQuickEditFailure(result)

  // (8) Numero de la version publicada para el contrato de la UI (no se muestra al coach, pero el
  // contrato lo pide). Lectura RLS-scoped inmediata tras la escritura del propio coach.
  const versionNumber = await readVersionNumber(db, result.versionId)
  if (versionNumber == null) return { ok: false, code: 'UNKNOWN' }

  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + clientId)
  return { ok: true, versionId: result.versionId, versionNumber }
}

async function readVersionNumber(db: NutritionV2Db, versionId: string): Promise<number | null> {
  const res = await db
    .from('nutrition_plan_versions_v2')
    .select<{ version_number: number }>('version_number')
    .eq('id', versionId)
    .maybeSingle()
  if (res.error || !res.data) return null
  return res.data.version_number
}
