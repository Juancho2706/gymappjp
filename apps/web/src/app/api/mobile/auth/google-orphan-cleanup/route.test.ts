import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Puerta MÓVIL (Bearer) de la limpieza del huérfano de Google. Se pinnea: sin bearer 401
 * `MISSING_TOKEN`; token que `getUser` rechaza 401 `INVALID_TOKEN`; con token válido el usuario
 * sale del TOKEN (nunca del cuerpo), el contexto es `mobile_post_google_auth` y la respuesta es
 * `{ ok: true }` haya borrado o no.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '77777777-7777-4777-8777-777777777777'
    const state = { user: { id: USER_ID } as { id: string } | null }
    const tokensSeen: string[] = []
    const calls: Array<Record<string, unknown>> = []
    const deleteGoogleOrphanAuthUserMock = vi.fn(async (params: Record<string, unknown>) => {
        calls.push(params)
        return { deleted: true as const }
    })
    const adminStub = {
        auth: {
            getUser: async (token: string) => {
                tokensSeen.push(token)
                return state.user
                    ? { data: { user: state.user }, error: null }
                    : { data: { user: null }, error: { message: 'invalid token' } }
            },
        },
    }
    return { USER_ID, state, tokensSeen, calls, deleteGoogleOrphanAuthUserMock, adminStub }
})

const { USER_ID, state, tokensSeen, calls, deleteGoogleOrphanAuthUserMock } = harness

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/auth/google-orphan-cleanup', () => ({
    deleteGoogleOrphanAuthUser: harness.deleteGoogleOrphanAuthUserMock,
}))

import { POST } from './route'

const URL = 'http://localhost/api/mobile/auth/google-orphan-cleanup'

function request(token: string | null = 'valid-token', body?: unknown) {
    return new NextRequest(URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    tokensSeen.length = 0
    calls.length = 0
    state.user = { id: USER_ID }
})

describe('POST /api/mobile/auth/google-orphan-cleanup', () => {
    it('sin bearer: 401 MISSING_TOKEN y cero escrituras', async () => {
        const res = await POST(request(null))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'MISSING_TOKEN' })
        expect(deleteGoogleOrphanAuthUserMock).not.toHaveBeenCalled()
    })

    it('token que `getUser` rechaza: 401 INVALID_TOKEN y cero escrituras', async () => {
        state.user = null

        const res = await POST(request('token-muerto'))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
        expect(deleteGoogleOrphanAuthUserMock).not.toHaveBeenCalled()
    })

    it('con token válido: el usuario sale del TOKEN (no del cuerpo), contexto móvil, responde ok', async () => {
        const AJENO = '88888888-8888-4888-8888-888888888888'

        const res = await POST(request('valid-token', { userId: AJENO }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(tokensSeen).toEqual(['valid-token'])
        expect(calls).toEqual([{ admin: harness.adminStub, userId: USER_ID, context: 'mobile_post_google_auth' }])
    })

    it('la respuesta no le cuenta al cliente si hubo borrado', async () => {
        deleteGoogleOrphanAuthUserMock.mockResolvedValueOnce({ deleted: false, reason: 'no_user' } as never)

        expect(await (await POST(request())).json()).toEqual({ ok: true })
    })
})
