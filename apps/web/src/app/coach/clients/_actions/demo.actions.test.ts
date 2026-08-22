import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    createServiceRoleClientMock,
    revalidatePathMock,
    redirectMock,
    getDemoClientIdMock,
    deleteDemoStudentMock,
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceRoleClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    redirectMock: vi.fn(() => {
        throw new Error('NEXT_REDIRECT')
    }),
    getDemoClientIdMock: vi.fn(),
    deleteDemoStudentMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
// `vitest.setup.ts` mockea next/navigation solo con los hooks del cliente; acá hace falta
// `redirect`, que el action usa al terminar.
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('@/services/onboarding/demo-student.service', () => ({
    getDemoClientId: getDemoClientIdMock,
    deleteDemoStudent: deleteDemoStudentMock,
}))

import { deleteDemoStudentAction } from './demo.actions'

const DEMO_ID = '00000000-0000-4000-8000-000000000001'

function mockSession(userId: string | null) {
    createClientMock.mockResolvedValue({
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
        },
    })
}

describe('deleteDemoStudentAction (onboarding v2 F3.7)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        createServiceRoleClientMock.mockReturnValue({ __admin: true })
    })

    it('sin sesión no toca nada y jamás crea el cliente de servicio', async () => {
        mockSession(null)

        const result = await deleteDemoStudentAction()

        expect(result).toEqual({ ok: false, error: 'Inicia sesión de nuevo.' })
        expect(createServiceRoleClientMock).not.toHaveBeenCalled()
        expect(deleteDemoStudentMock).not.toHaveBeenCalled()
    })

    it('sin alumno de ejemplo propio no borra nada (el id nunca viene del cliente)', async () => {
        mockSession('coach-1')
        getDemoClientIdMock.mockResolvedValue(null)

        const result = await deleteDemoStudentAction()

        expect(result).toEqual({ ok: false, error: 'No tienes un alumno de ejemplo.' })
        expect(deleteDemoStudentMock).not.toHaveBeenCalled()
        expect(redirectMock).not.toHaveBeenCalled()
    })

    it('verifica la propiedad con el cliente del COACH (RLS) antes de usar service_role', async () => {
        const supabase = {
            auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'coach-1' } } }) },
        }
        createClientMock.mockResolvedValue(supabase)
        getDemoClientIdMock.mockResolvedValue(DEMO_ID)
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })

        await expect(deleteDemoStudentAction()).rejects.toThrow('NEXT_REDIRECT')

        // El chequeo de propiedad corre con el cliente user-scoped, no con el admin.
        expect(getDemoClientIdMock).toHaveBeenCalledWith(supabase, 'coach-1')
        expect(deleteDemoStudentMock).toHaveBeenCalledWith({ __admin: true }, { coachId: 'coach-1' })
    })

    it('borrado exitoso: revalida el directorio y redirige ahí', async () => {
        mockSession('coach-1')
        getDemoClientIdMock.mockResolvedValue(DEMO_ID)
        deleteDemoStudentMock.mockResolvedValue({ ok: true, deleted: true })

        await expect(deleteDemoStudentAction()).rejects.toThrow('NEXT_REDIRECT')

        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/clients')
        expect(redirectMock).toHaveBeenCalledWith('/coach/clients')
    })

    it('tolera `not_implemented` del sembrador: mensaje claro y sin redirección', async () => {
        mockSession('coach-1')
        getDemoClientIdMock.mockResolvedValue(DEMO_ID)
        deleteDemoStudentMock.mockResolvedValue({ ok: false, reason: 'not_implemented' })

        const result = await deleteDemoStudentAction()

        expect(result).toEqual({
            ok: false,
            error: 'El borrado del ejemplo todavía no está disponible.',
        })
        expect(redirectMock).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })
})
