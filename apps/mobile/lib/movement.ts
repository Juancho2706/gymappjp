/**
 * Screening de Movimiento de Ingreso (modulo movement_assessment) — mobile.
 *
 * Dos partes:
 *  1. CALCULO PURO: port verbatim de @eva/calc (packages/calc/src/movement.ts).
 *     @eva/calc NO resuelve desde mobile (no esta en tsconfig paths ni en deps),
 *     asi que se espeja inline igual que lib/cardio.ts. NOTA anti-drift: si cambian
 *     las formulas en @eva/calc, actualizar aca (los puntajes, banda, asimetria).
 *  2. DATA: lecturas/escrituras DIRECTAS por PostgREST bajo la sesion del coach
 *     (RLS: movement_assessments.coach_id = auth.uid()). El recalculo de final_score /
 *     composite / banda se hace SIEMPRE aca antes de escribir, espejando el server web
 *     (que jamas confia en agregados del cliente). Standalone coach v1 (sin team/pool).
 */

import { supabase } from './supabase'
import { MovementItemInputSchema, MovementFinalizeSchema } from '@eva/schemas'

// ─────────────────────────────────────────────────────────────────────────────
// 1. CALCULO PURO (port verbatim de @eva/calc)
// ─────────────────────────────────────────────────────────────────────────────

export const MOVEMENT_PROTOCOL_VERSION = 'v1' as const

export const MOVEMENT_PATTERN_SLUGS = [
  'deep_squat',
  'hurdle_step',
  'inline_lunge',
  'shoulder_mobility',
  'active_straight_leg_raise',
  'trunk_stability_pushup',
  'rotary_stability',
] as const

export type MovementPatternSlug = (typeof MOVEMENT_PATTERN_SLUGS)[number]

export type MovementPatternDef = {
  slug: MovementPatternSlug
  /** true => se puntua por lado (L/R); false => puntaje unico. */
  isPerSide: boolean
  /** true => el patron tiene prueba de descarte de dolor (clearing). */
  hasClearing: boolean
}

/** Catalogo v1 hardcodeado: 5 patrones por-lado, 2 de puntaje unico; clearing en hombro/tronco/rotatoria. */
export const MOVEMENT_PATTERNS_V1: readonly MovementPatternDef[] = [
  { slug: 'deep_squat', isPerSide: false, hasClearing: false },
  { slug: 'hurdle_step', isPerSide: true, hasClearing: false },
  { slug: 'inline_lunge', isPerSide: true, hasClearing: false },
  { slug: 'shoulder_mobility', isPerSide: true, hasClearing: true },
  { slug: 'active_straight_leg_raise', isPerSide: true, hasClearing: false },
  { slug: 'trunk_stability_pushup', isPerSide: false, hasClearing: true },
  { slug: 'rotary_stability', isPerSide: true, hasClearing: true },
] as const

export function movementPatternDef(slug: MovementPatternSlug): MovementPatternDef {
  const def = MOVEMENT_PATTERNS_V1.find((p) => p.slug === slug)
  if (!def) throw new Error(`Patron desconocido: ${slug}`)
  return def
}

export type PriorityBand = 'low' | 'moderate' | 'high'

export type MovementItemInput = {
  pattern: MovementPatternSlug
  isPerSide: boolean
  scoreLeft?: number | null
  scoreRight?: number | null
  scoreSingle?: number | null
  pain: boolean
  clearingPositive?: boolean | null
}

export type MovementSummary = {
  composite: number
  hasPain: boolean
  hasAsymmetry: boolean
  band: PriorityBand
}

function assertScore(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new Error(`Puntaje invalido en ${label}: ${value} (esperado entero 0-3)`)
  }
}

/** dolor o descarte positivo fuerzan 0; por-lado toma min(L,R); puntaje unico pasa directo. */
export function finalItemScore(item: MovementItemInput): number {
  if (item.isPerSide) {
    if (item.scoreLeft == null || item.scoreRight == null) {
      throw new Error(`Item incompleto: ${item.pattern} requiere puntaje izquierdo y derecho`)
    }
    assertScore(item.scoreLeft, `${item.pattern}.scoreLeft`)
    assertScore(item.scoreRight, `${item.pattern}.scoreRight`)
  } else {
    if (item.scoreSingle == null) {
      throw new Error(`Item incompleto: ${item.pattern} requiere puntaje unico`)
    }
    assertScore(item.scoreSingle, `${item.pattern}.scoreSingle`)
  }

  if (item.clearingPositive === true || item.pain) return 0
  if (item.isPerSide) return Math.min(item.scoreLeft as number, item.scoreRight as number)
  return item.scoreSingle as number
}

function assertCompleteProtocol(items: readonly MovementItemInput[]): void {
  const seen = new Set(items.map((i) => i.pattern))
  const missing = MOVEMENT_PATTERN_SLUGS.filter((slug) => !seen.has(slug))
  if (missing.length > 0) {
    throw new Error(`Protocolo incompleto: faltan patrones (${missing.join(', ')})`)
  }
  if (items.length !== MOVEMENT_PATTERN_SLUGS.length) {
    throw new Error('Protocolo invalido: se esperan exactamente 7 patrones sin duplicados')
  }
}

/** Compuesto /21. Exige los 7 patrones presentes (lanza si faltan o sobran). */
export function compositeScore(items: readonly MovementItemInput[]): number {
  assertCompleteProtocol(items)
  return items.reduce((sum, item) => sum + finalItemScore(item), 0)
}

/** Asimetria: existe item por-lado con |L - R| >= 1, sobre puntajes CRUDOS. */
export function hasAsymmetry(items: readonly MovementItemInput[]): boolean {
  return items.some(
    (item) =>
      item.isPerSide &&
      item.scoreLeft != null &&
      item.scoreRight != null &&
      Math.abs(item.scoreLeft - item.scoreRight) >= 1
  )
}

export function hasPain(items: readonly MovementItemInput[]): boolean {
  return items.some((item) => item.pain || item.clearingPositive === true)
}

/** high: dolor || compuesto <= 14 · moderate: 15-16 || asimetria · low: >= 17 limpio. */
export function priorityBand(composite: number, pain: boolean, asymmetry: boolean): PriorityBand {
  if (pain || composite <= 14) return 'high'
  if (composite <= 16 || asymmetry) return 'moderate'
  return 'low'
}

export function summarizeAssessment(items: readonly MovementItemInput[]): MovementSummary {
  const composite = compositeScore(items)
  const pain = hasPain(items)
  const asymmetry = hasAsymmetry(items)
  return { composite, hasPain: pain, hasAsymmetry: asymmetry, band: priorityBand(composite, pain, asymmetry) }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. TIPOS DE FILA (espejo del schema DB)
// ─────────────────────────────────────────────────────────────────────────────

export type AssessmentStatus = 'draft' | 'final'

export interface MovementAssessmentItemRow {
  id: string
  assessment_id: string
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

export interface MovementAssessmentRow {
  id: string
  client_id: string
  coach_id: string | null
  team_id: string | null
  status: AssessmentStatus
  protocol_version: string
  assessed_at: string
  composite_score: number | null
  has_pain: boolean
  has_asymmetry: boolean
  risk_band: PriorityBand | null
  consent_confirmed_at: string | null
  notes: string | null
  last_edited_by: string | null
}

export interface MovementAssessmentWithItems extends MovementAssessmentRow {
  items: MovementAssessmentItemRow[]
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. DATA (PostgREST bajo RLS del coach)
// ─────────────────────────────────────────────────────────────────────────────

const ITEM_COLS =
  'id, assessment_id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain, clearing_positive, comment'
const ASSESS_COLS =
  'id, client_id, coach_id, team_id, status, protocol_version, assessed_at, composite_score, has_pain, has_asymmetry, risk_band, consent_confirmed_at, notes, last_edited_by'

function mapItem(r: any): MovementAssessmentItemRow {
  return {
    id: r.id,
    assessment_id: r.assessment_id,
    pattern: r.pattern,
    is_per_side: !!r.is_per_side,
    score_left: r.score_left ?? null,
    score_right: r.score_right ?? null,
    score_single: r.score_single ?? null,
    final_score: r.final_score,
    pain: !!r.pain,
    clearing_positive: r.clearing_positive ?? null,
    comment: r.comment ?? null,
  }
}

function mapAssessment(r: any): MovementAssessmentRow {
  return {
    id: r.id,
    client_id: r.client_id,
    coach_id: r.coach_id ?? null,
    team_id: r.team_id ?? null,
    status: r.status,
    protocol_version: r.protocol_version,
    assessed_at: r.assessed_at,
    composite_score: r.composite_score ?? null,
    has_pain: !!r.has_pain,
    has_asymmetry: !!r.has_asymmetry,
    risk_band: r.risk_band ?? null,
    consent_confirmed_at: r.consent_confirmed_at ?? null,
    notes: r.notes ?? null,
    last_edited_by: r.last_edited_by ?? null,
  }
}

/** Hub: alumnos del coach + su ultimo final + borrador pendiente. */
export async function listMovementHub(): Promise<MovementHubClient[]> {
  try {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, full_name')
      .or('is_archived.is.null,is_archived.eq.false')
      .order('full_name')
    const clients = (clientsData ?? []) as any[]
    if (clients.length === 0) return []
    const ids = clients.map((c) => c.id)

    const { data: assessData } = await supabase
      .from('movement_assessments')
      .select('id, client_id, status, assessed_at, composite_score, risk_band')
      .in('client_id', ids)
      .order('assessed_at', { ascending: false })
    const rows = (assessData ?? []) as any[]

    const latestByClient = new Map<string, any>()
    const draftByClient = new Map<string, string>()
    for (const r of rows) {
      if (r.status === 'final' && !latestByClient.has(r.client_id)) {
        latestByClient.set(r.client_id, r)
      }
      if (r.status === 'draft' && !draftByClient.has(r.client_id)) {
        draftByClient.set(r.client_id, r.id)
      }
    }

    return clients.map((c) => {
      const lf = latestByClient.get(c.id)
      return {
        client_id: c.id,
        full_name: c.full_name ?? null,
        latest_final: lf
          ? {
              id: lf.id,
              assessed_at: lf.assessed_at,
              composite_score: lf.composite_score ?? null,
              risk_band: lf.risk_band ?? null,
            }
          : null,
        draft_id: draftByClient.get(c.id) ?? null,
      }
    })
  } catch {
    return []
  }
}

/** Nombre del alumno (selector / encabezado). */
export async function getClientName(clientId: string): Promise<string | null> {
  try {
    const { data } = await supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle()
    return (data as any)?.full_name ?? null
  } catch {
    return null
  }
}

async function fetchAssessmentWithItems(assessmentId: string): Promise<MovementAssessmentWithItems | null> {
  const { data: aData } = await supabase
    .from('movement_assessments')
    .select(ASSESS_COLS)
    .eq('id', assessmentId)
    .maybeSingle()
  if (!aData) return null
  const { data: iData } = await supabase
    .from('movement_assessment_items')
    .select(ITEM_COLS)
    .eq('assessment_id', assessmentId)
  return { ...mapAssessment(aData), items: ((iData ?? []) as any[]).map(mapItem) }
}

/** Reporte del alumno: finales (asc por fecha) + borrador pendiente si existe. */
export async function getClientMovementDetail(clientId: string): Promise<{
  clientName: string | null
  finals: MovementAssessmentWithItems[]
  draftId: string | null
}> {
  try {
    const [clientName, { data: aData }] = await Promise.all([
      getClientName(clientId),
      supabase
        .from('movement_assessments')
        .select('id, status, assessed_at')
        .eq('client_id', clientId)
        .order('assessed_at', { ascending: true }),
    ])
    const rows = (aData ?? []) as any[]
    const draftId = rows.find((r) => r.status === 'draft')?.id ?? null
    const finalIds = rows.filter((r) => r.status === 'final').map((r) => r.id)

    const finals: MovementAssessmentWithItems[] = []
    for (const id of finalIds) {
      const full = await fetchAssessmentWithItems(id)
      if (full) finals.push(full)
    }
    return { clientName, finals, draftId }
  } catch {
    return { clientName: null, finals: [], draftId: null }
  }
}

/** Borrador unico del alumno con sus items (retoma cross-device). */
export async function getDraftWithItems(clientId: string): Promise<MovementAssessmentWithItems | null> {
  try {
    const { data: aData } = await supabase
      .from('movement_assessments')
      .select(ASSESS_COLS)
      .eq('client_id', clientId)
      .eq('status', 'draft')
      .maybeSingle()
    if (!aData) return null
    const { data: iData } = await supabase
      .from('movement_assessment_items')
      .select(ITEM_COLS)
      .eq('assessment_id', (aData as any).id)
    return { ...mapAssessment(aData), items: ((iData ?? []) as any[]).map(mapItem) }
  } catch {
    return null
  }
}

export interface WizardItemValues {
  pattern: MovementPatternSlug
  score_left: number | null
  score_right: number | null
  score_single: number | null
  pain: boolean
  clearing_positive: boolean | null
  comment: string | null
}

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * Autosave por paso: crea el borrador (max 1 por alumno) si no existe y upserta el item
 * con final_score recalculado aca (jamas confiar en el cliente). Espeja upsertDraftItem.
 */
export async function upsertDraftItem(
  clientId: string,
  values: WizardItemValues
): Promise<{ assessmentId: string | null; error: string | null }> {
  const parsed = MovementItemInputSchema.safeParse({
    pattern: values.pattern,
    score_left: values.score_left,
    score_right: values.score_right,
    score_single: values.score_single,
    pain: values.pain,
    clearing_positive: values.clearing_positive,
    comment: values.comment,
  })
  if (!parsed.success) {
    return { assessmentId: null, error: parsed.error.issues[0]?.message ?? 'Datos del patron invalidos.' }
  }

  try {
    const userId = await getCurrentUserId()
    if (!userId) return { assessmentId: null, error: 'No autenticado.' }
    const def = movementPatternDef(values.pattern)

    // Borrador existente o nuevo.
    let assessmentId: string
    const existing = await getDraftWithItems(clientId)
    if (existing) {
      assessmentId = existing.id
    } else {
      const { data: created, error: insErr } = await supabase
        .from('movement_assessments')
        .insert({ client_id: clientId, coach_id: userId, status: 'draft', last_edited_by: userId })
        .select('id')
        .single()
      if (insErr || !created) return { assessmentId: null, error: insErr?.message ?? 'No se pudo crear el borrador.' }
      assessmentId = (created as any).id
    }

    const finalScore = finalItemScore({
      pattern: def.slug,
      isPerSide: def.isPerSide,
      scoreLeft: def.isPerSide ? values.score_left : null,
      scoreRight: def.isPerSide ? values.score_right : null,
      scoreSingle: def.isPerSide ? null : values.score_single,
      pain: values.pain,
      clearingPositive: def.hasClearing ? (values.clearing_positive ?? false) : null,
    })

    // Upsert por (assessment_id, pattern): borra el item previo y reinserta (sin onConflict
    // server-side disponible via PostgREST sin constraint nombrado garantizado).
    await supabase
      .from('movement_assessment_items')
      .delete()
      .eq('assessment_id', assessmentId)
      .eq('pattern', def.slug)

    const { error: itemErr } = await supabase.from('movement_assessment_items').insert({
      assessment_id: assessmentId,
      pattern: def.slug,
      is_per_side: def.isPerSide,
      score_left: def.isPerSide ? (values.score_left ?? null) : null,
      score_right: def.isPerSide ? (values.score_right ?? null) : null,
      score_single: def.isPerSide ? null : (values.score_single ?? null),
      final_score: finalScore,
      pain: values.pain,
      clearing_positive: def.hasClearing ? (values.clearing_positive ?? false) : null,
      comment: values.comment?.trim() || null,
    })
    if (itemErr) return { assessmentId, error: itemErr.message }

    await supabase
      .from('movement_assessments')
      .update({ last_edited_by: userId })
      .eq('id', assessmentId)

    return { assessmentId, error: null }
  } catch (e) {
    return { assessmentId: null, error: e instanceof Error ? e.message : 'Error inesperado.' }
  }
}

/**
 * Finaliza el borrador (standalone v1): atestacion explicita del coach + recalculo
 * server-side completo. Estampa consent_confirmed_at (el CHECK lo exige NOT NULL en final).
 */
export async function finalizeAssessment(
  clientId: string,
  assessmentId: string,
  notes: string | null,
  consentAttested: boolean
): Promise<{ error: string | null }> {
  const parsed = MovementFinalizeSchema.safeParse({
    client_id: clientId,
    assessment_id: assessmentId,
    notes,
    consent_attested: consentAttested,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Datos de finalizacion invalidos.' }
  }
  if (!consentAttested) {
    return { error: 'Debes atestar que el alumno consintio el tratamiento de sus datos de salud.' }
  }

  try {
    const userId = await getCurrentUserId()
    if (!userId) return { error: 'No autenticado.' }

    const draft = await getDraftWithItems(clientId)
    if (!draft || draft.id !== assessmentId) {
      return { error: 'Borrador no encontrado (pudo haber sido finalizado o eliminado).' }
    }

    // Recalculo server SIEMPRE (lanza si el protocolo esta incompleto).
    let summary: MovementSummary
    try {
      summary = summarizeAssessment(draft.items.map(itemRowToCalcInput))
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Protocolo incompleto.' }
    }

    const now = new Date().toISOString()
    const { error: updErr } = await supabase
      .from('movement_assessments')
      .update({
        status: 'final',
        composite_score: summary.composite,
        has_pain: summary.hasPain,
        has_asymmetry: summary.hasAsymmetry,
        risk_band: summary.band,
        consent_confirmed_at: now,
        assessed_at: now,
        notes: notes?.trim() || null,
        last_edited_by: userId,
      })
      .eq('id', assessmentId)
    if (updErr) return { error: updErr.message }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error inesperado.' }
  }
}

/** Final inmutable: corregir = eliminar (cascade borra los items) + re-evaluar. */
export async function deleteAssessment(assessmentId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('movement_assessments').delete().eq('id', assessmentId)
    return { error: error ? error.message : null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error inesperado.' }
  }
}

function itemRowToCalcInput(item: MovementAssessmentItemRow): MovementItemInput {
  return {
    pattern: item.pattern,
    isPerSide: item.is_per_side,
    scoreLeft: item.score_left,
    scoreRight: item.score_right,
    scoreSingle: item.score_single,
    pain: item.pain,
    clearingPositive: item.clearing_positive,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. i18n liviano (es-CL) — labels de patrones / bandas / disclaimer
// ─────────────────────────────────────────────────────────────────────────────

export const PATTERN_LABELS: Record<MovementPatternSlug, string> = {
  deep_squat: 'Sentadilla profunda',
  hurdle_step: 'Paso de valla',
  inline_lunge: 'Estocada en línea',
  shoulder_mobility: 'Movilidad de hombro',
  active_straight_leg_raise: 'Elevación activa de pierna recta',
  trunk_stability_pushup: 'Estabilidad de tronco en empuje',
  rotary_stability: 'Estabilidad rotatoria',
}

export const BAND_LABELS: Record<PriorityBand, string> = {
  high: 'Prioridad alta',
  moderate: 'Prioridad media',
  low: 'Prioridad baja',
}

export const MOVEMENT_DISCLAIMER =
  'Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice lesiones; no sustituye evaluación clínica.'
