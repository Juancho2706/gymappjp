import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Puerta WEB (cookie) de la limpieza del huérfano de Google. Se pinnea el contrato de la ruta:
 * sin sesión 401 y cero escrituras; con sesión actúa SOLO sobre el usuario de la cookie, con el
 * contexto `post_google_auth`, y responde `{ ok: true }` haya borrado o no.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '66666666-6666-4666-8666-666666666666'
    const state = { user: { id: USER_ID } as { id: string } | null }
    const calls: Array<Record<string, unknown>> = []
    const deleteGoogleOrphanAuthUserMock = vi.fn(async (params: Record<string, unknown>) => {
        calls.push(params)
        return { deleted: true as const }
    })
    const adminStub = { tag: 'admin' }
    const serverStub = { auth: { getUser: async () => ({ data: { user: state.user } }) } }
    return { USER_ID, state, calls, deleteGoogleOrphanAuthUserMock, adminStub, serverStub }
})

const { USER_ID, state, calls, deleteGoogleOrphanAuthUserMock } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.serverStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/auth/google-orphan-cleanup', () => ({
    deleteGoogleOrphanAuthUser: harness.deleteGoogleOrphanAuthUserMock,
}))

import { POST } from './route'

beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
    state.user = { id: USER_ID }
})

describe('POST /api/auth/google-orphan-cleanup', () => {
    it('sin sesión: 401 y no toca nada', async () => {
        state.user = null

        const res = await POST()

        expect(res.status).toBe(401)
        expect(deleteGoogleOrphanAuthUserMock).not.toHaveBeenCalled()
    })

    it('con sesión: limpia al usuario de la COOKIE con el contexto web y responde ok', async () => {
        const res = await POST()

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(calls).toEqual([{ admin: harness.adminStub, userId: USER_ID, context: 'post_google_auth' }])
    })

    it('la respuesta no le cuenta al cliente si hubo borrado', async () => {
        deleteGoogleOrphanAuthUserMock.mockResolvedValueOnce({ deleted: false, reason: 'has_rows' } as never)

        const res = await POST()

        expect(await res.json()).toEqual({ ok: true })
    })
})
