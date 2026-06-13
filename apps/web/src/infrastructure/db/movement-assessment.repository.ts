import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type {
    MovementAssessment,
    MovementAssessmentItem,
    MovementAssessmentWithItems,
} from '@/domain/assessment/types'

type DB = SupabaseClient<Database>

// Repository del modulo movement_assessment. Cliente USER-scoped: RLS es el techo
// (team pool / standalone / alumno self-select finales). SELECT de columnas
// especificas SIEMPRE (jamas `*`).

const ASSESSMENT_COLUMNS =
    'id, client_id, coach_id, team_id, status, protocol_version, assessed_at, composite_score, has_pain, has_asymmetry, risk_band, consent_confirmed_at, notes, last_edited_by, created_at, updated_at'

const ITEM_COLUMNS =
    'id, assessment_id, pattern, is_per_side, score_left, score_right, score_single, final_score, pain, clearing_positive, comment'

const WITH_ITEMS_SELECT = `${ASSESSMENT_COLUMNS}, movement_assessment_items ( ${ITEM_COLUMNS} )`

type AssessmentWithItemsRow = MovementAssessment & {
    movement_assessment_items: MovementAssessmentItem[]
}

function toWithItems(row: AssessmentWithItemsRow): MovementAssessmentWithItems {
    const { movement_assessment_items, ...assessment } = row
    return { ...assessment, items: movement_assessment_items ?? [] }
}

export async function findAssessmentsByClient(db: DB, clientId: string): Promise<MovementAssessment[]> {
    const { data, error } = await db
        .from('movement_assessments')
        .select(ASSESSMENT_COLUMNS)
        .eq('client_id', clientId)
        .order('assessed_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as unknown as MovementAssessment[]
}

export async function findAssessmentWithItems(
    db: DB,
    assessmentId: string
): Promise<MovementAssessmentWithItems | null> {
    const { data, error } = await db
        .from('movement_assessments')
        .select(WITH_ITEMS_SELECT)
        .eq('id', assessmentId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toWithItems(data as unknown as AssessmentWithItemsRow) : null
}

/** Finales del alumno con items (evolucion + vista del alumno), de mas antigua a mas nueva. */
export async function findFinalAssessmentsWithItemsByClient(
    db: DB,
    clientId: string
): Promise<MovementAssessmentWithItems[]> {
    const { data, error } = await db
        .from('movement_assessments')
        .select(WITH_ITEMS_SELECT)
        .eq('client_id', clientId)
        .eq('status', 'final')
        .order('assessed_at', { ascending: true })
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as AssessmentWithItemsRow[]).map(toWithItems)
}

/** Borrador unico del alumno (indice parcial garantiza maximo 1). */
export async function findDraftWithItemsByClient(
    db: DB,
    clientId: string
): Promise<MovementAssessmentWithItems | null> {
    const { data, error } = await db
        .from('movement_assessments')
        .select(WITH_ITEMS_SELECT)
        .eq('client_id', clientId)
        .eq('status', 'draft')
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data ? toWithItems(data as unknown as AssessmentWithItemsRow) : null
}

export async function insertDraftAssessment(
    db: DB,
    input: { client_id: string; coach_id: string; team_id: string | null; last_edited_by: string }
): Promise<MovementAssessment> {
    const { data, error } = await db
        .from('movement_assessments')
        .insert({
            client_id: input.client_id,
            coach_id: input.coach_id,
            team_id: input.team_id,
            status: 'draft',
            last_edited_by: input.last_edited_by,
        })
        .select(ASSESSMENT_COLUMNS)
        .single()
    if (error) throw new Error(error.message)
    return data as unknown as MovementAssessment
}

export async function upsertAssessmentItem(
    db: DB,
    input: {
        assessment_id: string
        pattern: string
        is_per_side: boolean
        score_left: number | null
        score_right: number | null
        score_single: number | null
        final_score: number
        pain: boolean
        clearing_positive: boolean | null
        comment: string | null
    }
): Promise<void> {
    const { error } = await db
        .from('movement_assessment_items')
        .upsert(input, { onConflict: 'assessment_id,pattern' })
    if (error) throw new Error(error.message)
}

/** Awareness (LOCKED #4): last_edited_by se setea en service en CADA write, no por trigger. */
export async function touchAssessment(db: DB, assessmentId: string, lastEditedBy: string): Promise<void> {
    const { error } = await db
        .from('movement_assessments')
        .update({ last_edited_by: lastEditedBy })
        .eq('id', assessmentId)
        .eq('status', 'draft')
    if (error) throw new Error(error.message)
}

export async function finalizeAssessment(
    db: DB,
    assessmentId: string,
    payload: {
        composite_score: number
        has_pain: boolean
        has_asymmetry: boolean
        risk_band: 'low' | 'moderate' | 'high'
        consent_confirmed_at: string
        assessed_at: string
        notes: string | null
        last_edited_by: string
    }
): Promise<void> {
    const { error } = await db
        .from('movement_assessments')
        .update({ ...payload, status: 'final' })
        .eq('id', assessmentId)
        .eq('status', 'draft') // final inmutable: jamas re-finalizar/editar un final
    if (error) throw new Error(error.message)
}

export async function deleteAssessment(db: DB, assessmentId: string): Promise<void> {
    const { error } = await db.from('movement_assessments').delete().eq('id', assessmentId)
    if (error) throw new Error(error.message)
}

export type LatestFinalRow = Pick<
    MovementAssessment,
    'id' | 'client_id' | 'assessed_at' | 'composite_score' | 'risk_band' | 'has_pain' | 'has_asymmetry'
>

/** Ultimo final por alumno (hub). Tabla fria: trae los finales del set y deduplica en JS. */
export async function findLatestFinalByClients(db: DB, clientIds: string[]): Promise<Map<string, LatestFinalRow>> {
    const latest = new Map<string, LatestFinalRow>()
    if (clientIds.length === 0) return latest
    const { data, error } = await db
        .from('movement_assessments')
        .select('id, client_id, assessed_at, composite_score, risk_band, has_pain, has_asymmetry')
        .in('client_id', clientIds)
        .eq('status', 'final')
        .order('assessed_at', { ascending: false })
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as unknown as LatestFinalRow[]) {
        if (!latest.has(row.client_id)) latest.set(row.client_id, row)
    }
    return latest
}

export async function findDraftIdsByClients(db: DB, clientIds: string[]): Promise<Map<string, string>> {
    const drafts = new Map<string, string>()
    if (clientIds.length === 0) return drafts
    const { data, error } = await db
        .from('movement_assessments')
        .select('id, client_id')
        .in('client_id', clientIds)
        .eq('status', 'draft')
    if (error) throw new Error(error.message)
    for (const row of data ?? []) drafts.set(row.client_id, row.id)
    return drafts
}

/** Fila minima del alumno para resolver SU contexto de modulo (vista del alumno). */
export async function findClientScopeRow(
    db: DB,
    clientId: string
): Promise<{ id: string; full_name: string | null; team_id: string | null; coach_id: string | null } | null> {
    const { data, error } = await db
        .from('clients')
        .select('id, full_name, team_id, coach_id')
        .eq('id', clientId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

/** Nombre del alumno para encabezados del modulo (el acceso YA fue validado por el service). */
export async function findClientBasic(
    db: DB,
    clientId: string
): Promise<{ id: string; full_name: string | null } | null> {
    const { data, error } = await db
        .from('clients')
        .select('id, full_name')
        .eq('id', clientId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

/** Alumnos del workspace activo (espejo 3-vias del patron CoachClientScope; RLS = techo). */
export async function findScopedClientsBasic(
    db: DB,
    coachId: string,
    scope: { orgId: string | null; activeTeamId: string | null }
): Promise<{ id: string; full_name: string | null }[]> {
    let query = db
        .from('clients')
        .select('id, full_name')
        .order('full_name', { ascending: true })
    if (scope.orgId) {
        query = query.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        query = query.is('org_id', null).eq('team_id', scope.activeTeamId)
    } else {
        query = query.eq('coach_id', coachId).is('org_id', null).is('team_id', null)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
}

// ─── Consentimiento (AC7) ───────────────────────────────────────────────────

export async function findActiveHealthConsent(
    db: DB,
    clientId: string
): Promise<{ id: string; granted_at: string | null } | null> {
    const { data, error } = await db
        .from('client_consents')
        .select('id, granted_at')
        .eq('client_id', clientId)
        .eq('purpose', 'health_data_processing')
        .is('revoked_at', null)
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

/** Atestacion del coach standalone (RLS client_consents_standalone_coach_manage la permite). */
export async function insertCoachAttestationConsent(db: DB, clientId: string): Promise<void> {
    const { error } = await db.from('client_consents').insert({
        client_id: clientId,
        purpose: 'health_data_processing',
        granted_at: new Date().toISOString(),
        consent_text_version: 'v1',
        granted_via: 'coach_attestation',
    })
    if (error) throw new Error(error.message)
}

// ─── Marca para print (contexto manda: team => marca del team; standalone => coach) ──

export async function findTeamBrand(
    db: DB,
    teamId: string
): Promise<{ name: string; primary_color: string | null; logo_url: string | null } | null> {
    const { data, error } = await db
        .from('teams')
        .select('name, primary_color, logo_url')
        .eq('id', teamId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}

export async function findCoachBrand(
    db: DB,
    coachId: string
): Promise<{ brand_name: string | null; primary_color: string | null; logo_url: string | null } | null> {
    const { data, error } = await db
        .from('coaches')
        .select('brand_name, primary_color, logo_url')
        .eq('id', coachId)
        .maybeSingle()
    if (error) throw new Error(error.message)
    return data
}
