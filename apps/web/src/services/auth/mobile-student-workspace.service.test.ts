import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    findCoach: vi.fn(),
    findClient: vi.fn(),
    findOrgCoach: vi.fn(),
    listClientWorkspaces: vi.fn(),
    setLastWorkspace: vi.fn(),
}))

vi.mock('@/infrastructure/db/mobile-student-workspace.repository', () => ({
    findMobileStudentCoach: (...args: unknown[]) => mocks.findCoach(...args),
    findMobileStudentClient: (...args: unknown[]) => mocks.findClient(...args),
    findActiveMobileStudentOrgCoach: (...args: unknown[]) => mocks.findOrgCoach(...args),
}))

vi.mock('./workspace.service', () => ({
    listClientWorkspaces: (...args: unknown[]) => mocks.listClientWorkspaces(...args),
    setLastWorkspace: (...args: unknown[]) => mocks.setLastWorkspace(...args),
}))

import { validateMobileStudentWorkspace } from './mobile-student-workspace.service'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const COACH_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_COACH_ID = '33333333-3333-4333-8333-333333333333'
const ORG_ID = '44444444-4444-4444-8444-444444444444'
const SPLIT_CLIENT_ID = '55555555-5555-4555-8555-555555555555'
const db = { __tag: 'service-role-db' } as never

beforeEach(() => {
    vi.clearAllMocks()
    mocks.findCoach.mockResolvedValue({
        data: { id: COACH_ID, slug: 'coach-jp' },
        error: null,
    })
    mocks.findClient.mockResolvedValue({
        data: {
            id: USER_ID,
            force_password_change: false,
            is_active: true,
            is_archived: false,
        },
        error: null,
    })
    mocks.findOrgCoach.mockResolvedValue({ data: null, error: null })
    mocks.listClientWorkspaces.mockResolvedValue([{
        type: 'student_standalone',
        userId: USER_ID,
        clientId: USER_ID,
        coachId: COACH_ID,
        label: 'Entrenar',
        slug: 'coach-jp',
    }])
    mocks.setLastWorkspace.mockResolvedValue({})
})

describe('validateMobileStudentWorkspace', () => {
    it('autoriza standalone solo con la fila del bearer y registra preferencia', async () => {
        mocks.findClient.mockResolvedValue({
            data: {
                id: USER_ID,
                force_password_change: true,
                is_active: true,
                is_archived: false,
            },
            error: null,
        })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: true,
            forcePasswordChange: true,
        })
        expect(mocks.listClientWorkspaces).toHaveBeenCalledWith(db, USER_ID)
        expect(mocks.findClient).toHaveBeenCalledWith(db, USER_ID)
        expect(mocks.setLastWorkspace).toHaveBeenCalledWith(db, expect.objectContaining({
            type: 'student_standalone',
            userId: USER_ID,
            clientId: USER_ID,
            coachId: COACH_ID,
        }))
        expect(mocks.findOrgCoach).not.toHaveBeenCalled()
    })

    it('autoriza enterprise cuando clients ya apunta al coach solicitado', async () => {
        mocks.listClientWorkspaces.mockResolvedValue([{
            type: 'student_enterprise',
            userId: USER_ID,
            clientId: USER_ID,
            orgId: ORG_ID,
            coachId: COACH_ID,
            label: 'EVA Org',
            slug: 'coach-jp',
        }])

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: true,
            forcePasswordChange: false,
        })
        expect(mocks.setLastWorkspace).toHaveBeenCalledWith(db, expect.objectContaining({
            type: 'student_enterprise',
            userId: USER_ID,
            clientId: USER_ID,
            orgId: ORG_ID,
            coachId: COACH_ID,
        }))
    })

    it('autoriza otro coach solo si pertenece activamente a la organización exacta del alumno', async () => {
        mocks.listClientWorkspaces.mockResolvedValue([{
            type: 'student_enterprise',
            userId: USER_ID,
            clientId: USER_ID,
            orgId: ORG_ID,
            coachId: OTHER_COACH_ID,
            label: 'EVA Org',
            slug: 'otro-coach',
        }])
        mocks.findOrgCoach.mockResolvedValue({
            data: { id: 'member-1', organizations: { name: 'EVA Org' } },
            error: null,
        })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: true,
            forcePasswordChange: false,
        })
        expect(mocks.findOrgCoach).toHaveBeenCalledWith(db, ORG_ID, COACH_ID)
        expect(mocks.setLastWorkspace).toHaveBeenCalledWith(db, expect.objectContaining({
            type: 'student_enterprise',
            userId: USER_ID,
            clientId: USER_ID,
            orgId: ORG_ID,
            coachId: COACH_ID,
        }))
    })

    it('rechaza otro coach si no existe la membresía enterprise exacta', async () => {
        mocks.listClientWorkspaces.mockResolvedValue([{
            type: 'student_enterprise',
            userId: USER_ID,
            clientId: USER_ID,
            orgId: ORG_ID,
            coachId: OTHER_COACH_ID,
            label: 'EVA Org',
            slug: 'otro-coach',
        }])

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: false,
            reason: 'access_denied',
        })
        expect(mocks.setLastWorkspace).not.toHaveBeenCalled()
    })

    it('rechaza una cuenta pausada sin registrar preferencia', async () => {
        mocks.findClient.mockResolvedValue({
            data: {
                id: USER_ID,
                force_password_change: false,
                is_active: false,
                is_archived: false,
            },
            error: null,
        })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: false,
            reason: 'account_paused',
        })
        expect(mocks.setLastWorkspace).not.toHaveBeenCalled()
    })

    it('rechaza una cuenta archivada', async () => {
        mocks.findClient.mockResolvedValue({
            data: {
                id: USER_ID,
                force_password_change: false,
                is_active: true,
                is_archived: true,
            },
            error: null,
        })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: false,
            reason: 'account_paused',
        })
        expect(mocks.setLastWorkspace).not.toHaveBeenCalled()
    })

    it('resuelve identidades divididas por account_id y lee el clientId de la membresía', async () => {
        mocks.listClientWorkspaces.mockResolvedValue([{
            type: 'student_standalone',
            userId: USER_ID,
            clientId: SPLIT_CLIENT_ID,
            coachId: COACH_ID,
            label: 'Entrenar',
            slug: 'coach-jp',
        }])
        mocks.findClient.mockResolvedValue({
            data: {
                id: SPLIT_CLIENT_ID,
                force_password_change: false,
                is_active: true,
                is_archived: false,
            },
            error: null,
        })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: true,
            forcePasswordChange: false,
        })
        expect(mocks.findClient).toHaveBeenCalledWith(db, SPLIT_CLIENT_ID)
        expect(mocks.setLastWorkspace).toHaveBeenCalledWith(db, expect.objectContaining({
            userId: USER_ID,
            clientId: SPLIT_CLIENT_ID,
            coachId: COACH_ID,
        }))
    })

    it('falla cerrado ante errores de dependencia', async () => {
        mocks.findClient.mockResolvedValue({ data: null, error: 'db unavailable' })

        await expect(validateMobileStudentWorkspace(db, USER_ID, COACH_ID)).resolves.toEqual({
            ok: false,
            reason: 'dependency_error',
        })
        expect(mocks.setLastWorkspace).not.toHaveBeenCalled()
    })
})
