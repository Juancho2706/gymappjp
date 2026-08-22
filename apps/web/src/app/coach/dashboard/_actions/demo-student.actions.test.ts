import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, createServiceRoleClientMock, revalidatePathMock, deleteDemoStudentMock } =
    vi.hoisted(() => ({
        createClientMock: vi.fn(),
        createServiceRoleClientMock: vi.fn(),
        revalidatePathMock: vi.fn(),
        deleteDemoStudentMock: vi.fn(),
    }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/services/onboarding/demo-student.service', () => ({
    deleteDemoStudent: deleteDemoStudentMock,
}))

import { deleteDemoStudentAction } from './demo-student.actions'

function setup(user: { id: string } | null = { id: 'coach-1' }) {
    createClientMock.mockResolvedValue({
        auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    })
    const insert = vi.fn(async () => ({ error: null }))
    const admin = { from: vi.fn(() => ({ insert })) }
    createServiceRoleClientMock.mockReturnValue(admin)
    return { admin, insert }
}

describe('deleteDemoStudentAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sin sesión no llama al servicio', async () => {
        setup(null)
        await expect(deleteDemoStudentAction()).resolves.toEqual({ ok: false, error: 'No autenticado' })
        expect(deleteDemoStudentMock).not.toHaveBeenCalled()
    })

    it('borra con el cliente ADMIN y con el coach de la SESIÓN (el body no aporta identidad)', async () => {
        const { admin, insert } = setup()
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })

        const result = await deleteDemoStudentAction()

        expect(deleteDemoStudentMock).toHaveBeenCalledWith(admin, { coachId: 'coach-1' })
        expect(result).toEqual({ ok: true, deleted: true })
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({ coach_id: 'coach-1', event_type: 'demo_deleted' })
        )
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard')
    })

    it('el stub de W3 (`not_implemented`) no se disfraza de éxito', async () => {
        setup()
        deleteDemoStudentMock.mockResolvedValue({ ok: false, reason: 'not_implemented' })

        const result = await deleteDemoStudentAction()

        expect(result.ok).toBe(false)
        expect(result).toEqual({
            ok: false,
            error: 'El borrado del ejemplo todavía no está disponible.',
        })
    })

    it('un fallo del servicio no revalida ni miente', async () => {
        setup()
        deleteDemoStudentMock.mockResolvedValue({ ok: false, reason: 'error' })

        const result = await deleteDemoStudentAction()

        expect(result.ok).toBe(false)
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('el evento `demo_deleted` que falla no rompe el borrado', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        createClientMock.mockResolvedValue({
            auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } } })) },
        })
        createServiceRoleClientMock.mockReturnValue({
            from: vi.fn(() => ({ insert: vi.fn(async () => ({ error: { message: 'check violation' } })) })),
        })
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })

        await expect(deleteDemoStudentAction()).resolves.toEqual({ ok: true, deleted: true })
        spy.mockRestore()
    })
})
