import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { assertModule, hasModule } from '@/services/entitlements.service'
import { assertCoachClientReadAccess, getCoachClientScope } from '@/services/client/client-scope.service'
import { logTeamClientAccess } from '@/services/team/team.service'
import * as repo from '@/infrastructure/db/movement-assessment.repository'
import {
    MOVEMENT_PROTOCOL_VERSION,
    finalItemScore,
    movementPatternDef,
    summarizeAssessment,
    type MovementItemInput as CalcItemInput,
    type MovementSummary,
} from '@eva/calc'
import type {
    MovementDeleteInput,
    MovementDraftUpsertInput,
    MovementFinalizeInput,
} from '@eva/schemas/screening'
import type {
    MovementAssessment,
    MovementAssessmentItem,
    MovementAssessmentWithItems,
    MovementPatternSlug,
} from '@/domain/assessment/types'

type DB = SupabaseClient<Database>

/**
 * Service del Screening de Movimiento de Ingreso (modulo `movement_assessment`).
 * TODA action/query del modulo pasa por aca, en ESTE orden (specs/movida-screening):
 *   1. kill-switch de operador (env DISABLED_MODULES) — ANTES de todo
 *   2. scoping 3-vias del workspace ACTIVO (guards compartidos client-scope.service)
 *   3. rechazo enterprise (v1: el modulo no se ofrece en contexto org)
 *   4. assertModule por contexto del ALUMNO (pool => su team manda; LOCKED #7)
 *   5. mutaciones: gate de consentimiento (AC7) — finalize estampa consent_confirmed_at
 *      en AMBOS contextos (CHECK movement_assessments_final_complete lo exige)
 *   6. recalculo SIEMPRE server-side con @eva/calc (jamas confiar en el cliente)
 *   7. last_edited_by = userId en cada write (awareness LOCKED #4, en service NO trigger)
 *   8. bitacora best-effort en contexto team (team_access_logs, AC9)
 */

const MODULE_KEY = 'movement_assessment' as const
const ERROR_TAG = '[module:movement_assessment]'
const RESOURCE = 'movement_assessment'

export class MovementAssessmentError extends Error {
    constructor(message: string) {
        super(`${ERROR_TAG} ${message}`)
        this.name = 'MovementAssessmentError'
    }
}

/**
 * Kill-switch de operador EVA: env runtime `DISABLED_MODULES` (CSV de ModuleKey).
 * Se cambia en Vercel sin migracion ni release; apaga el modulo para TODOS.
 * Nota: el PLAN lo ubica en entitlements.service.ts (compartido) — vive aca hasta el
 * cableado central para no tocar archivos compartidos en paralelo.
 */
export function isMovementModuleKilled(): boolean {
    const csv = process.env.DISABLED_MODULES ?? ''
    return csv
        .split(',')
        .map((s) => s.trim())
        .includes(MODULE_KEY)
}

export type MovementClientContext = { viaTeam: boolean; teamId: string | null }

/** Contexto + gates para operar sobre UN alumno (el contexto del ALUMNO manda). */
export async function resolveMovementClientContext(
    db: DB,
    userId: string,
    clientId: string
): Promise<MovementClientContext> {
    if (isMovementModuleKilled()) {
        throw new MovementAssessmentError('Modulo deshabilitado temporalmente por el operador.')
    }
    const access = await assertCoachClientReadAccess(db, userId, clientId)
    if (access.orgId) {
        throw new MovementAssessmentError('Modulo no disponible en contexto enterprise (v1).')
    }
    await assertModule(
        db,
        MODULE_KEY,
        access.viaTeam ? { teamId: access.activeTeamId } : { coachId: userId }
    )
    return { viaTeam: access.viaTeam, teamId: access.activeTeamId }
}

/** Contexto + gates a nivel workspace (hub, sin alumno especifico). */
export async function resolveMovementWorkspaceContext(
    db: DB,
    userId: string
): Promise<{ orgId: string | null; activeTeamId: string | null }> {
    if (isMovementModuleKilled()) {
        throw new MovementAssessmentError('Modulo deshabilitado temporalmente por el operador.')
    }
    const scope = await getCoachClientScope(db, userId)
    if (scope.orgId) {
        throw new MovementAssessmentError('Modulo no disponible en contexto enterprise (v1).')
    }
    await assertModule(
        db,
        MODULE_KEY,
        scope.activeTeamId ? { teamId: scope.activeTeamId } : { coachId: userId }
    )
    return scope
}

function itemRowToCalcInput(item: MovementAssessmentItem): CalcItemInput {
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

async function logAccess(
    db: DB,
    ctx: MovementClientContext,
    userId: string,
    clientId: string,
    action: 'view' | 'create' | 'update' | 'delete' | 'pdf_generate',
    metadata?: Record<string, string>
): Promise<void> {
    if (!ctx.viaTeam || !ctx.teamId) return
    // Best-effort (logTeamClientAccess nunca lanza): la bitacora no rompe el flujo.
    await logTeamClientAccess(db, {
        teamId: ctx.teamId,
        actorCoachId: userId,
        clientId,
        resource: RESOURCE,
        action,
        metadata: metadata ?? {},
    })
}

// ─── Queries ────────────────────────────────────────────────────────────────

export type MovementHubData = {
    viaTeam: boolean
    clients: {
        client_id: string
        full_name: string | null
        latest_final: repo.LatestFinalRow | null
        draft_id: string | null
    }[]
}

export async function getMovementHubData(db: DB, userId: string): Promise<MovementHubData> {
    const scope = await resolveMovementWorkspaceContext(db, userId)
    const clients = await repo.findScopedClientsBasic(db, userId, scope)
    const ids = clients.map((c) => c.id)
    const [latest, drafts] = await Promise.all([
        repo.findLatestFinalByClients(db, ids),
        repo.findDraftIdsByClients(db, ids),
    ])
    return {
        viaTeam: scope.activeTeamId != null,
        clients: clients.map((c) => ({
            client_id: c.id,
            full_name: c.full_name,
            latest_final: latest.get(c.id) ?? null,
            draft_id: drafts.get(c.id) ?? null,
        })),
    }
}

export type MovementClientDetail = {
    ctx: MovementClientContext
    clientName: string | null
    assessments: MovementAssessment[]
    finals: MovementAssessmentWithItems[]
}

/** Detalle del alumno (reporte + historial + evolucion). Registra `view` en bitacora team. */
export async function getClientMovementDetail(
    db: DB,
    userId: string,
    clientId: string
): Promise<MovementClientDetail> {
    const ctx = await resolveMovementClientContext(db, userId, clientId)
    const [client, assessments, finals] = await Promise.all([
        repo.findClientBasic(db, clientId),
        repo.findAssessmentsByClient(db, clientId),
        repo.findFinalAssessmentsWithItemsByClient(db, clientId),
    ])
    await logAccess(db, ctx, userId, clientId, 'view')
    return { ctx, clientName: client?.full_name ?? null, assessments, finals }
}

export type MovementWizardData = {
    ctx: MovementClientContext
    clientName: string | null
    draft: MovementAssessmentWithItems | null
    hasActiveConsent: boolean
}

export async function getMovementWizardData(
    db: DB,
    userId: string,
    clientId: string
): Promise<MovementWizardData> {
    const ctx = await resolveMovementClientContext(db, userId, clientId)
    const [client, draft, consent] = await Promise.all([
        repo.findClientBasic(db, clientId),
        repo.findDraftWithItemsByClient(db, clientId),
        repo.findActiveHealthConsent(db, clientId),
    ])
    return { ctx, clientName: client?.full_name ?? null, draft, hasActiveConsent: consent != null }
}

export type MovementPrintData = {
    assessment: MovementAssessmentWithItems
    clientName: string | null
    brandName: string
    brandColor: string | null
    logoUrl: string | null
}

/** Datos para la pagina print (marca del CONTEXTO). Registra `pdf_generate` en team. */
export async function getMovementPrintData(
    db: DB,
    userId: string,
    clientId: string,
    assessmentId: string
): Promise<MovementPrintData> {
    const ctx = await resolveMovementClientContext(db, userId, clientId)
    const [assessment, client] = await Promise.all([
        repo.findAssessmentWithItems(db, assessmentId),
        repo.findClientBasic(db, clientId),
    ])
    if (!assessment || assessment.client_id !== clientId || assessment.status !== 'final') {
        throw new MovementAssessmentError('Evaluacion no encontrada.')
    }
    let brandName = 'EVA'
    let brandColor: string | null = null
    let logoUrl: string | null = null
    if (ctx.viaTeam && ctx.teamId) {
        const team = await repo.findTeamBrand(db, ctx.teamId)
        if (team) {
            brandName = team.name
            brandColor = team.primary_color
            logoUrl = team.logo_url
        }
    } else {
        const coach = await repo.findCoachBrand(db, userId)
        if (coach) {
            brandName = coach.brand_name ?? brandName
            brandColor = coach.primary_color
            logoUrl = coach.logo_url
        }
    }
    await logAccess(db, ctx, userId, clientId, 'pdf_generate', { assessment_id: assessmentId })
    return { assessment, clientName: client?.full_name ?? null, brandName, brandColor, logoUrl }
}

export type StudentMovementView = {
    enabled: boolean
    clientName: string | null
    finals: MovementAssessmentWithItems[]
}

/**
 * Vista del ALUMNO (read-only, solo finales — RLS self-select es el techo).
 * `db` = cliente request-scoped del alumno. `entitlementsDb` = cliente service-role
 * SOLO para leer enabled_modules (el alumno no puede SELECT en teams/coaches por RLS);
 * se usa despues de verificar que la fila del cliente es del propio usuario.
 */
export async function getStudentMovementView(
    db: DB,
    entitlementsDb: DB,
    userId: string
): Promise<StudentMovementView> {
    if (isMovementModuleKilled()) return { enabled: false, clientName: null, finals: [] }
    // Identidad legacy: clients.id = auth.uid() (mismo criterio que dashboard/check-in del alumno).
    const client = await repo.findClientScopeRow(db, userId)
    if (!client) return { enabled: false, clientName: null, finals: [] }
    const enabled = await hasModule(
        entitlementsDb,
        MODULE_KEY,
        client.team_id ? { teamId: client.team_id } : { coachId: client.coach_id }
    )
    if (!enabled) return { enabled: false, clientName: client.full_name, finals: [] }
    const finals = await repo.findFinalAssessmentsWithItemsByClient(db, client.id)
    return { enabled: true, clientName: client.full_name, finals }
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────

/**
 * Autosave por paso del wizard: crea el borrador si no existe (maximo 1 por alumno,
 * indice parcial) y upserta el item con `final_score` recalculado server-side.
 */
export async function upsertDraftItem(
    db: DB,
    userId: string,
    input: MovementDraftUpsertInput
): Promise<{ assessmentId: string; finalScore: number }> {
    const ctx = await resolveMovementClientContext(db, userId, input.client_id)
    const def = movementPatternDef(input.item.pattern as MovementPatternSlug)

    let assessmentId: string
    let created = false
    const existing = await repo.findDraftWithItemsByClient(db, input.client_id)
    if (existing) {
        assessmentId = existing.id
    } else {
        const draft = await repo.insertDraftAssessment(db, {
            client_id: input.client_id,
            coach_id: userId,
            team_id: ctx.teamId,
            last_edited_by: userId,
        })
        assessmentId = draft.id
        created = true
    }

    // Recalculo server del puntaje final del item (jamas confiar en el cliente).
    const finalScore = finalItemScore({
        pattern: def.slug,
        isPerSide: def.isPerSide,
        scoreLeft: def.isPerSide ? input.item.score_left : null,
        scoreRight: def.isPerSide ? input.item.score_right : null,
        scoreSingle: def.isPerSide ? null : input.item.score_single,
        pain: input.item.pain,
        clearingPositive: def.hasClearing ? (input.item.clearing_positive ?? false) : null,
    })

    await repo.upsertAssessmentItem(db, {
        assessment_id: assessmentId,
        pattern: def.slug,
        is_per_side: def.isPerSide,
        score_left: def.isPerSide ? (input.item.score_left ?? null) : null,
        score_right: def.isPerSide ? (input.item.score_right ?? null) : null,
        score_single: def.isPerSide ? null : (input.item.score_single ?? null),
        final_score: finalScore,
        pain: input.item.pain,
        clearing_positive: def.hasClearing ? (input.item.clearing_positive ?? false) : null,
        comment: input.item.comment?.trim() || null,
    })

    // Awareness LOCKED #4: last_edited_by en cada write.
    if (!created) await repo.touchAssessment(db, assessmentId, userId)

    await logAccess(db, ctx, userId, input.client_id, created ? 'create' : 'update', {
        assessment_id: assessmentId,
        pattern: def.slug,
    })
    return { assessmentId, finalScore }
}

/**
 * Finaliza el borrador (AC7): consentimiento bloqueante + recalculo server completo.
 * Estampa `consent_confirmed_at` en AMBOS contextos — el CHECK
 * `movement_assessments_final_complete` exige la columna NOT NULL para status='final';
 * dejarla NULL en la via team romperia TODA finalizacion del pool en runtime.
 */
export async function finalizeMovementAssessment(
    db: DB,
    userId: string,
    input: MovementFinalizeInput
): Promise<{ assessmentId: string; summary: MovementSummary }> {
    const ctx = await resolveMovementClientContext(db, userId, input.client_id)

    const draft = await repo.findDraftWithItemsByClient(db, input.client_id)
    if (!draft || draft.id !== input.assessment_id) {
        throw new MovementAssessmentError('Borrador no encontrado (pudo haber sido finalizado o eliminado).')
    }

    let consentConfirmedAt: string
    if (ctx.viaTeam) {
        // TEAM: el consentimiento health_data_processing activo es obligatorio (sin el, NO se finaliza).
        const consent = await repo.findActiveHealthConsent(db, input.client_id)
        if (!consent) {
            throw new MovementAssessmentError(
                'El alumno no tiene consentimiento de datos de salud activo. Debe aceptarlo en su app antes de finalizar.'
            )
        }
        consentConfirmedAt = new Date().toISOString()
    } else {
        // STANDALONE: atestacion explicita del coach (crea/verifica el registro de consentimiento).
        if (!input.consent_attested) {
            throw new MovementAssessmentError(
                'Debes atestar que el alumno consintio el tratamiento de sus datos de salud.'
            )
        }
        const consent = await repo.findActiveHealthConsent(db, input.client_id)
        if (!consent) await repo.insertCoachAttestationConsent(db, input.client_id)
        consentConfirmedAt = new Date().toISOString()
    }

    // Recalculo server SIEMPRE (lanza si el protocolo esta incompleto — faltan patrones).
    const summary = summarizeAssessment(draft.items.map(itemRowToCalcInput))

    await repo.finalizeAssessment(db, draft.id, {
        composite_score: summary.composite,
        has_pain: summary.hasPain,
        has_asymmetry: summary.hasAsymmetry,
        risk_band: summary.band,
        consent_confirmed_at: consentConfirmedAt,
        assessed_at: new Date().toISOString(),
        notes: input.notes?.trim() || null,
        last_edited_by: userId,
    })

    await logAccess(db, ctx, userId, input.client_id, 'update', {
        assessment_id: draft.id,
        event: 'finalize',
        protocol_version: MOVEMENT_PROTOCOL_VERSION,
    })
    return { assessmentId: draft.id, summary }
}

/** Final inmutable: corregir = eliminar (queda `delete` en bitacora) y re-evaluar. */
export async function deleteMovementAssessment(
    db: DB,
    userId: string,
    input: MovementDeleteInput
): Promise<void> {
    const ctx = await resolveMovementClientContext(db, userId, input.client_id)
    // Cruce assessment ↔ alumno gateado ANTES de borrar: el gate (assertModule + scope
    // 3-vias) se evaluo sobre input.client_id; sin este cruce, un coach con workspace
    // TEAM activo podria borrar evaluaciones de sus alumnos STANDALONE (modulo OFF)
    // pasando un client_id del pool — las policies RLS standalone/team son permisivas
    // independientes del workspace activo — y la bitacora team_access_logs (AC9)
    // quedaria contra el client_id equivocado (datos de salud, Ley 21.719).
    const assessment = await repo.findAssessmentWithItems(db, input.assessment_id)
    if (!assessment || assessment.client_id !== input.client_id) {
        throw new MovementAssessmentError('Evaluacion no encontrada.')
    }
    await repo.deleteAssessment(db, input.assessment_id)
    await logAccess(db, ctx, userId, input.client_id, 'delete', { assessment_id: input.assessment_id })
}
