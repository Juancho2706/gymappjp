import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MovementAssessmentItem, MovementAssessmentWithItems } from '@/domain/assessment/types'

vi.mock('@/services/entitlements.service', () => ({
    assertModule: vi.fn(),
    hasModule: vi.fn(),
}))
vi.mock('@/services/client/client-scope.service', () => ({
    assertCoachClientReadAccess: vi.fn(),
    getCoachClientScope: vi.fn(),
}))
vi.mock('@/services/team/team.service', () => ({
    logTeamClientAccess: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/infrastructure/db/movement-assessment.repository', () => ({
    findAssessmentsByClient: vi.fn(),
    findAssessmentWithItems: vi.fn(),
    findFinalAssessmentsWithItemsByClient: vi.fn(),
    findDraftWithItemsByClient: vi.fn(),
    insertDraftAssessment: vi.fn(),
    upsertAssessmentItem: vi.fn(),
    touchAssessment: vi.fn(),
    finalizeAssessment: vi.fn(),
    deleteAssessment: vi.fn(),
    findLatestFinalByClients: vi.fn(),
    findDraftIdsByClients: vi.fn(),
    findScopedClientsBasic: vi.fn(),
    findClientBasic: vi.fn(),
    findClientScopeRow: vi.fn(),
    findActiveHealthConsent: vi.fn(),
    insertCoachAttestationConsent: vi.fn(),
    findTeamBrand: vi.fn(),
    findCoachBrand: vi.fn(),
}))

import { assertModule } from '@/services/entitlements.service'
import { assertCoachClientReadAccess } from '@/services/client/client-scope.service'
import { logTeamClientAccess } from '@/services/team/team.service'
import * as repo from '@/infrastructure/db/movement-assessment.repository'
import {
    deleteMovementAssessment,
    finalizeMovementAssessment,
    upsertDraftItem,
} from './movement-assessment.service'

const db = {} as never
const USER = 'coach-1'
const CLIENT = 'client-1'
const TEAM = 'team-1'
const DRAFT_ID = 'draft-1'

const TEAM_ACCESS = { orgId: null, activeTeamId: TEAM, viaTeam: true as const }
const STANDALONE_ACCESS = { orgId: null, activeTeamId: null, viaTeam: false as const }
const ENTERPRISE_ACCESS = { orgId: 'org-1', activeTeamId: null, viaTeam: false as const }

function makeItem(
    pattern: MovementAssessmentItem['pattern'],
    isPerSide: boolean,
    hasClearing: boolean,
    score = 2
): MovementAssessmentItem {
    return {
        id: `item-${pattern}`,
        assessment_id: DRAFT_ID,
        pattern,
        is_per_side: isPerSide,
        score_left: isPerSide ? score : null,
        score_right: isPerSide ? score : null,
        score_single: isPerSide ? null : score,
        final_score: score,
        pain: false,
        clearing_positive: hasClearing ? false : null,
        comment: null,
    }
}

/** Borrador completo (7 patrones, todo 2 => compuesto 14 => banda high). */
function makeFullDraft(): MovementAssessmentWithItems {
    return {
        id: DRAFT_ID,
        client_id: CLIENT,
        coach_id: USER,
        team_id: TEAM,
        status: 'draft',
        protocol_version: 'v1',
        assessed_at: '2026-06-11T12:00:00Z',
        composite_score: null,
        has_pain: false,
        has_asymmetry: false,
        risk_band: null,
        consent_confirmed_at: null,
        notes: null,
        last_edited_by: USER,
        created_at: '2026-06-11T12:00:00Z',
        updated_at: '2026-06-11T12:00:00Z',
        items: [
            makeItem('deep_squat', false, false),
            makeItem('hurdle_step', true, false),
            makeItem('inline_lunge', true, false),
            makeItem('shoulder_mobility', true, true),
            makeItem('active_straight_leg_raise', true, false),
            makeItem('trunk_stability_pushup', false, true),
            makeItem('rotary_stability', true, true),
        ],
    }
}

const finalizeInput = (attested = false) => ({
    client_id: CLIENT,
    assessment_id: DRAFT_ID,
    notes: 'trabajo correctivo de cadera',
    consent_attested: attested,
})

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    delete process.env.DISABLED_MODULES
})

describe('gating (AC6)', () => {
    it('modulo OFF (assertModule lanza) => la mutacion lanza y NO toca el repo', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(assertModule).mockRejectedValue(new Error('Modulo no habilitado: movement_assessment'))
        await expect(
            upsertDraftItem(db, USER, {
                client_id: CLIENT,
                item: { pattern: 'deep_squat', score_single: 2, pain: false },
            })
        ).rejects.toThrow(/Modulo no habilitado/)
        expect(repo.insertDraftAssessment).not.toHaveBeenCalled()
        expect(repo.upsertAssessmentItem).not.toHaveBeenCalled()
    })

    it('contexto enterprise => rechazo v1 ANTES de assertModule', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(ENTERPRISE_ACCESS)
        await expect(finalizeMovementAssessment(db, USER, finalizeInput())).rejects.toThrow(/enterprise/)
        expect(assertModule).not.toHaveBeenCalled()
    })

    it('kill-switch DISABLED_MODULES apaga el modulo antes de todo', async () => {
        process.env.DISABLED_MODULES = 'cardio, movement_assessment'
        await expect(finalizeMovementAssessment(db, USER, finalizeInput())).rejects.toThrow(/operador/)
        expect(assertCoachClientReadAccess).not.toHaveBeenCalled()
    })

    it('assertModule recibe el contexto del ALUMNO: team del pool, no el coach', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(assertModule).mockResolvedValue(undefined)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue({ id: 'c-1', granted_at: null })
        await finalizeMovementAssessment(db, USER, finalizeInput())
        expect(assertModule).toHaveBeenCalledWith(db, 'movement_assessment', { teamId: TEAM })
    })
})

describe('consentimiento (AC7) + consent_confirmed_at en AMBOS contextos', () => {
    beforeEach(() => {
        vi.mocked(assertModule).mockResolvedValue(undefined)
    })

    it('team SIN consentimiento activo => finalize lanza y NO finaliza', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue(null)
        await expect(finalizeMovementAssessment(db, USER, finalizeInput())).rejects.toThrow(/consentimiento/)
        expect(repo.finalizeAssessment).not.toHaveBeenCalled()
    })

    it('standalone SIN atestacion => finalize lanza y NO finaliza', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(STANDALONE_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        await expect(finalizeMovementAssessment(db, USER, finalizeInput(false))).rejects.toThrow(/atestar/)
        expect(repo.finalizeAssessment).not.toHaveBeenCalled()
    })

    it('team CON consentimiento => estampa consent_confirmed_at (jamas NULL en un final)', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue({ id: 'c-1', granted_at: null })
        await finalizeMovementAssessment(db, USER, finalizeInput())
        const payload = vi.mocked(repo.finalizeAssessment).mock.calls[0][2]
        expect(payload.consent_confirmed_at).toBeTruthy()
        expect(Number.isNaN(Date.parse(payload.consent_confirmed_at))).toBe(false)
    })

    it('standalone CON atestacion => crea consentimiento si falta y estampa consent_confirmed_at', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(STANDALONE_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue(null)
        await finalizeMovementAssessment(db, USER, finalizeInput(true))
        expect(repo.insertCoachAttestationConsent).toHaveBeenCalledWith(db, CLIENT)
        const payload = vi.mocked(repo.finalizeAssessment).mock.calls[0][2]
        expect(payload.consent_confirmed_at).toBeTruthy()
    })

    it('standalone con consentimiento previo activo no duplica el registro', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(STANDALONE_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue({ id: 'c-1', granted_at: null })
        await finalizeMovementAssessment(db, USER, finalizeInput(true))
        expect(repo.insertCoachAttestationConsent).not.toHaveBeenCalled()
        expect(repo.finalizeAssessment).toHaveBeenCalled()
    })
})

describe('recalculo server (AC1/AC2)', () => {
    beforeEach(() => {
        vi.mocked(assertModule).mockResolvedValue(undefined)
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue({ id: 'c-1', granted_at: null })
    })

    it('finalize recalcula compuesto/banda desde los items (ignora valores del cliente)', async () => {
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        const { summary } = await finalizeMovementAssessment(db, USER, finalizeInput())
        // 7 items de 2 => 14 => high
        expect(summary).toEqual({ composite: 14, hasPain: false, hasAsymmetry: false, band: 'high' })
        const payload = vi.mocked(repo.finalizeAssessment).mock.calls[0][2]
        expect(payload.composite_score).toBe(14)
        expect(payload.risk_band).toBe('high')
        expect(payload.has_pain).toBe(false)
        expect(payload.has_asymmetry).toBe(false)
    })

    it('finalize con protocolo incompleto (faltan patrones) lanza', async () => {
        const draft = makeFullDraft()
        draft.items = draft.items.slice(0, 5)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(draft)
        await expect(finalizeMovementAssessment(db, USER, finalizeInput())).rejects.toThrow(/incompleto/)
        expect(repo.finalizeAssessment).not.toHaveBeenCalled()
    })

    it('upsertDraftItem recalcula final_score (dolor => 0) y respeta el catalogo', async () => {
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(null)
        vi.mocked(repo.insertDraftAssessment).mockResolvedValue(makeFullDraft())
        const { finalScore } = await upsertDraftItem(db, USER, {
            client_id: CLIENT,
            item: { pattern: 'shoulder_mobility', score_left: 3, score_right: 2, pain: true },
        })
        expect(finalScore).toBe(0)
        const upserted = vi.mocked(repo.upsertAssessmentItem).mock.calls[0][1]
        expect(upserted.final_score).toBe(0)
        expect(upserted.is_per_side).toBe(true)
        expect(upserted.clearing_positive).toBe(false) // patron con clearing: default false, no null
    })
})

describe('awareness + bitacora (LOCKED #4, AC9)', () => {
    beforeEach(() => {
        vi.mocked(assertModule).mockResolvedValue(undefined)
    })

    it('crear borrador setea last_edited_by; retomar borrador hace touch', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(null)
        vi.mocked(repo.insertDraftAssessment).mockResolvedValue(makeFullDraft())
        await upsertDraftItem(db, USER, {
            client_id: CLIENT,
            item: { pattern: 'deep_squat', score_single: 2, pain: false },
        })
        expect(repo.insertDraftAssessment).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ last_edited_by: USER, team_id: TEAM, coach_id: USER })
        )
        expect(repo.touchAssessment).not.toHaveBeenCalled()

        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        await upsertDraftItem(db, USER, {
            client_id: CLIENT,
            item: { pattern: 'deep_squat', score_single: 3, pain: false },
        })
        expect(repo.touchAssessment).toHaveBeenCalledWith(db, DRAFT_ID, USER)
    })

    it('finalize estampa last_edited_by en el payload', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        vi.mocked(repo.findActiveHealthConsent).mockResolvedValue({ id: 'c-1', granted_at: null })
        await finalizeMovementAssessment(db, USER, finalizeInput())
        expect(vi.mocked(repo.finalizeAssessment).mock.calls[0][2].last_edited_by).toBe(USER)
    })

    it('bitacora SOLO viaTeam: team la registra, standalone NO', async () => {
        // team => log
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        await upsertDraftItem(db, USER, {
            client_id: CLIENT,
            item: { pattern: 'deep_squat', score_single: 2, pain: false },
        })
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({
                teamId: TEAM,
                actorCoachId: USER,
                clientId: CLIENT,
                resource: 'movement_assessment',
                action: 'update',
            })
        )

        vi.clearAllMocks()
        vi.mocked(assertModule).mockResolvedValue(undefined)
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(STANDALONE_ACCESS)
        vi.mocked(repo.findDraftWithItemsByClient).mockResolvedValue(makeFullDraft())
        await upsertDraftItem(db, USER, {
            client_id: CLIENT,
            item: { pattern: 'deep_squat', score_single: 2, pain: false },
        })
        expect(logTeamClientAccess).not.toHaveBeenCalled()
    })

    it('delete registra accion delete en team', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findAssessmentWithItems).mockResolvedValue(makeFullDraft())
        await deleteMovementAssessment(db, USER, { client_id: CLIENT, assessment_id: DRAFT_ID })
        expect(repo.deleteAssessment).toHaveBeenCalledWith(db, DRAFT_ID)
        expect(logTeamClientAccess).toHaveBeenCalledWith(
            db,
            expect.objectContaining({ action: 'delete', resource: 'movement_assessment' })
        )
    })

    it('delete con assessment de OTRO alumno => lanza y NO borra (cruce assessment-cliente)', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        const foreign = makeFullDraft()
        foreign.client_id = 'client-standalone-ajeno'
        vi.mocked(repo.findAssessmentWithItems).mockResolvedValue(foreign)
        await expect(
            deleteMovementAssessment(db, USER, { client_id: CLIENT, assessment_id: DRAFT_ID })
        ).rejects.toThrow(/no encontrada/)
        expect(repo.deleteAssessment).not.toHaveBeenCalled()
        expect(logTeamClientAccess).not.toHaveBeenCalled()
    })

    it('delete con assessment inexistente => lanza y NO borra', async () => {
        vi.mocked(assertCoachClientReadAccess).mockResolvedValue(TEAM_ACCESS)
        vi.mocked(repo.findAssessmentWithItems).mockResolvedValue(null)
        await expect(
            deleteMovementAssessment(db, USER, { client_id: CLIENT, assessment_id: 'no-existe' })
        ).rejects.toThrow(/no encontrada/)
        expect(repo.deleteAssessment).not.toHaveBeenCalled()
    })
})
