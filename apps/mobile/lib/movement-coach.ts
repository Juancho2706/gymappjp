/**
 * movement-coach — datos del modulo Evaluacion de movimiento (screening) del lado COACH (E6-04).
 *
 * Dos responsabilidades money-safe (identico patron a cardio-coach.ts):
 *  - LECTURA (hub + reporte + resume del borrador): los alumnos del coach y sus evaluaciones
 *    (movement_assessments + items) se leen por PostgREST directo. NO es mutacion → la RLS
 *    `movement_assessments.coach_id = auth.uid()` + `clients.coach_id = auth.uid()` alcanza
 *    (scope standalone v1: org_id/team_id null). Con `hasModule('movement_assessment')` en OFF
 *    la pantalla NO llama a estas funciones (cero fetch).
 *  - MUTACION (autosave por paso / finalizar / eliminar): SIEMPRE via los endpoints
 *    `/api/mobile/movement/{item,finalize,assessment}`, que aplican `assertModule` server-side
 *    (la RLS de movement_assessments NO chequea enabled_modules → escribir por PostgREST
 *    evadiria el cobro). El server RECALCULA el final_score / compuesto / banda con @eva/calc;
 *    jamas se confia en agregados del cliente.
 *
 * db-compat: el APK puede pegar a una prod standalone sin columnas enterprise (org_id/team_id).
 * La lista de alumnos usa selectWithFallback (rico con filtros enterprise → minimo por coach_id).
 */
import type { MovementPatternSlug, PriorityBand } from '@eva/calc'
import { supabase } from './supabase'
import { apiFetch } from './api'
import { selectWithFallback } from './db-compat'

export interface MovementItemRow {
  id: string
  pattern: MovementPatternSlug
  is_per_side: boolean
  score_left: number | null
  score_right: number | null
  score_single: number | null
  final_score: number
  pain: boolean
  clearing_positive: boolean | null
  comment: string | null
}

export interface FinalAssessmentRow {
  id: string
  assessed_at: string
  composite_score: number | null
  risk_band: PriorityBand | null
  has_pain: boolean
  has_asymmetry: boolean
  notes: string | null
  items: MovementItemRow[]
}

export interface DraftAssessmentRow {
  id: string
  items: MovementItemRow[]
}

export interface MovementHubClient {
  client_id: string
  full_name: string | null
  latest_final: {
    id: string
    assessed_at: string
    composite_score: number | null
    risk_band: PriorityBand | null
  } | null
  draft_id: string | null
}

/** Item wizard tal como lo aceptan MovementItemInputSchema / el endpoint /item. */
export interface WizardItemPayload {
  pattern: MovementPatternSlug
  score_left: number | null
  score_right: number | null
  score_single: number | null
  pain: boolean
  clearing_positive: boolean | null
  comment: string | null
}

const ITEM_COLS =
  'id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain, clearing_positive, comment'
const FINAL_SELECT = `id, assessed_at, composite_score, risk_band, has_pain, has_asymmetry, notes, movement_assessment_items ( ${ITEM_COLS} )`
const DRAFT_SELECT = `id, movement_assessment_items ( ${ITEM_COLS} )`

function normalizeItems(raw: any): MovementItemRow[] {
  return ((raw ?? []) as any[]).map((r) => ({
    id: r.id,
    pattern: r.pattern,
    is_per_side: r.is_per_side === true,
    score_left: r.score_left ?? null,
    score_right: r.score_right ?? null,
    score_single: r.score_single ?? null,
    final_score: r.final_score ?? 0,
    pain: r.pain === true,
    clearing_positive: r.clearing_positive ?? null,
    comment: r.comment ?? null,
  }))
}

function normalizeFinal(row: any): FinalAssessmentRow {
  return {
    id: row.id,
    assessed_at: row.assessed_at,
    composite_score: row.composite_score ?? null,
    risk_band: row.risk_band ?? null,
    has_pain: row.has_pain === true,
    has_asymmetry: row.has_asymmetry === true,
    notes: row.notes ?? null,
    items: normalizeItems(row.movement_assessment_items),
  }
}

/**
 * Alumnos del coach con su ultimo semaforo (final mas reciente) y borrador pendiente. Espejo
 * del hub web (findScopedClientsBasic + findLatestFinalByClients + findDraftIdsByClients), scope
 * standalone (coach_id, org_id/team_id null). [] ante error / sin sesion.
 */
export async function listMovementClients(): Promise<MovementHubClient[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: clientRows } = await selectWithFallback<any>(
    () =>
      supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)
        .is('org_id', null)
        .is('team_id', null)
        .order('full_name', { ascending: true }),
    () =>
      supabase
        .from('clients')
        .select('id, full_name')
        .eq('coach_id', user.id)
        .order('full_name', { ascending: true }),
  )
  const clients = Array.isArray(clientRows) ? clientRows : []
  if (clients.length === 0) return []

  // Evaluaciones del coach (RLS coach_id = auth.uid()). Se agregan por alumno en memoria.
  const { data: aRows } = await supabase
    .from('movement_assessments')
    .select('id, client_id, status, assessed_at, composite_score, risk_band')
    .eq('coach_id', user.id)
  const assessments = Array.isArray(aRows) ? aRows : []

  const latestByClient = new Map<string, MovementHubClient['latest_final']>()
  const draftByClient = new Map<string, string>()
  for (const a of assessments) {
    if (a.status === 'draft') {
      if (!draftByClient.has(a.client_id)) draftByClient.set(a.client_id, a.id)
      continue
    }
    if (a.status === 'final') {
      const prev = latestByClient.get(a.client_id)
      if (!prev || new Date(a.assessed_at).getTime() > new Date(prev.assessed_at).getTime()) {
        latestByClient.set(a.client_id, {
          id: a.id,
          assessed_at: a.assessed_at,
          composite_score: a.composite_score ?? null,
          risk_band: a.risk_band ?? null,
        })
      }
    }
  }

  return clients.map((c) => ({
    client_id: c.id,
    full_name: c.full_name ?? null,
    latest_final: latestByClient.get(c.id) ?? null,
    draft_id: draftByClient.get(c.id) ?? null,
  }))
}

/** Nombre del alumno (encabezado del reporte/wizard). RLS del coach alcanza. */
export async function getMovementClientName(clientId: string): Promise<string | null> {
  const { data } = await supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle()
  return (data?.full_name as string | undefined) ?? null
}

/** Evaluaciones FINALES del alumno con items, orden cronologico (reporte + evolucion). */
export async function getClientFinals(clientId: string): Promise<FinalAssessmentRow[]> {
  const { data, error } = await supabase
    .from('movement_assessments')
    .select(FINAL_SELECT)
    .eq('client_id', clientId)
    .eq('status', 'final')
    .order('assessed_at', { ascending: true })
  if (error || !Array.isArray(data)) return []
  return data.map(normalizeFinal)
}

/** Borrador (max 1 por alumno) con items, para retomar el wizard cross-device. null si no hay. */
export async function getClientDraft(clientId: string): Promise<DraftAssessmentRow | null> {
  const { data } = await supabase
    .from('movement_assessments')
    .select(DRAFT_SELECT)
    .eq('client_id', clientId)
    .eq('status', 'draft')
    .maybeSingle()
  if (!data) return null
  return { id: (data as any).id, items: normalizeItems((data as any).movement_assessment_items) }
}

/**
 * Autosave por paso: crea el borrador on-demand y upserta el item. El server recalcula el
 * final_score con @eva/calc (gate assertModule → 403 MODULE_OFF sin el modulo). Devuelve el id
 * del borrador (para poder finalizar).
 */
export async function saveMovementItem(
  clientId: string,
  item: WizardItemPayload,
): Promise<string> {
  const res = await apiFetch<{ assessmentId: string }>('/api/mobile/movement/item', {
    method: 'POST',
    authenticated: true,
    body: { client_id: clientId, item },
  })
  return res.assessmentId
}

export interface FinalizeMovementInput {
  clientId: string
  assessmentId: string
  notes: string | null
  consentAttested: boolean
}

/** Finaliza el borrador (recalculo + banda server-side, consentimiento obligatorio). */
export async function finalizeMovementAssessment(input: FinalizeMovementInput): Promise<void> {
  await apiFetch<{ error: null }>('/api/mobile/movement/finalize', {
    method: 'POST',
    authenticated: true,
    body: {
      client_id: input.clientId,
      assessment_id: input.assessmentId,
      notes: input.notes,
      consent_attested: input.consentAttested,
    },
  })
}

/** Elimina una evaluacion (final inmutable → corregir = eliminar + re-evaluar). */
export async function deleteMovementAssessment(assessmentId: string): Promise<void> {
  await apiFetch<{ error: null }>('/api/mobile/movement/assessment', {
    method: 'DELETE',
    authenticated: true,
    body: { assessment_id: assessmentId },
  })
}
