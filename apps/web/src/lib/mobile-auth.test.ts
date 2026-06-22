import { describe, it, expect, vi, beforeEach } from 'vitest'
import { errors as joseErrors } from 'jose'

const { jwtVerifyMock, getUserMock } = vi.hoisted(() => ({
    jwtVerifyMock: vi.fn(),
    getUserMock: vi.fn(),
}))

vi.mock('jose', async (importOriginal) => {
    const actual = await importOriginal<typeof import('jose')>()
    return { ...actual, jwtVerify: jwtVerifyMock }
})

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({ auth: { getUser: getUserMock } }),
}))

import { verifyMobileBearer, isUnambiguousTokenError } from './mobile-auth'

beforeEach(() => {
    jwtVerifyMock.mockReset()
    getUserMock.mockReset()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
})

describe('isUnambiguousTokenError — clasificación (rechazar local vs degradar a red)', () => {
    it('expirado -> rechazar local (true)', () => {
        expect(isUnambiguousTokenError(new joseErrors.JWTExpired('expired', {} as any))).toBe(true)
    })
    it('claim iss/aud + firma/JWKS/alg/desconocido -> degradar a getUser (false)', () => {
        // claim iss/aud puede ser drift de env sobre un token legítimo -> NO 401 duro, degrada.
        expect(isUnambiguousTokenError(new joseErrors.JWTClaimValidationFailed('bad iss', {} as any))).toBe(false)
        expect(isUnambiguousTokenError(new joseErrors.JWSSignatureVerificationFailed())).toBe(false)
        expect(isUnambiguousTokenError(new Error('jwks fetch failed'))).toBe(false)
        expect(isUnambiguousTokenError(new joseErrors.JWKSNoMatchingKey())).toBe(false)
    })
})

describe('verifyMobileBearer', () => {
    it('token válido -> ok vía jose, SIN llamar a getUser (cero red)', async () => {
        jwtVerifyMock.mockResolvedValue({ payload: { sub: 'user-1' } })
        const r = await verifyMobileBearer('valid.jwt.token')
        expect(r).toEqual({ ok: true, userId: 'user-1', via: 'jose' })
        expect(getUserMock).not.toHaveBeenCalled()
    })

    it('token EXPIRADO -> 401 local, sin fallback a getUser', async () => {
        jwtVerifyMock.mockRejectedValue(new joseErrors.JWTExpired('expired', {} as any))
        const r = await verifyMobileBearer('expired.jwt')
        expect(r).toEqual({ ok: false, status: 401 })
        expect(getUserMock).not.toHaveBeenCalled()
    })

    it('claim iss/aud mismatch (token válido del propio proyecto) -> DEGRADA a getUser y pasa', async () => {
        // Causa del incidente prod: token ES256 legítimo cuyo iss/aud no matchea la aserción
        // local estricta (drift de env). Antes daba 401 duro; ahora degrada a getUser (autoritativo).
        jwtVerifyMock.mockRejectedValue(new joseErrors.JWTClaimValidationFailed('unexpected iss', {} as any))
        getUserMock.mockResolvedValue({ data: { user: { id: 'coach-real' } }, error: null })
        const r = await verifyMobileBearer('valid.but.iss.mismatch')
        expect(r).toEqual({ ok: true, userId: 'coach-real', via: 'getUser' })
        expect(getUserMock).toHaveBeenCalledOnce()
    })

    it('claim mismatch + getUser RECHAZA (token ajeno/inválido) -> 401, no abre acceso', async () => {
        jwtVerifyMock.mockRejectedValue(new joseErrors.JWTClaimValidationFailed('bad aud', {} as any))
        getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
        const r = await verifyMobileBearer('foreign.or.bad')
        expect(r).toEqual({ ok: false, status: 401 })
        expect(getUserMock).toHaveBeenCalledOnce()
    })

    it('JWKS inalcanzable -> DEGRADA a getUser (no 401 por caída de infra)', async () => {
        jwtVerifyMock.mockRejectedValue(new Error('fetch failed: jwks.json'))
        getUserMock.mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
        const r = await verifyMobileBearer('some.token')
        expect(r).toEqual({ ok: true, userId: 'user-2', via: 'getUser' })
        expect(getUserMock).toHaveBeenCalledOnce()
    })

    it('token HS legacy (firma no resuelve) -> degrada a getUser', async () => {
        jwtVerifyMock.mockRejectedValue(new joseErrors.JWSSignatureVerificationFailed())
        getUserMock.mockResolvedValue({ data: { user: { id: 'legacy-user' } }, error: null })
        const r = await verifyMobileBearer('hs256.legacy.token')
        expect(r).toEqual({ ok: true, userId: 'legacy-user', via: 'getUser' })
    })

    it('JWKS caído Y getUser rechaza -> 401 (no abre acceso)', async () => {
        jwtVerifyMock.mockRejectedValue(new Error('network'))
        getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
        const r = await verifyMobileBearer('bad.token')
        expect(r).toEqual({ ok: false, status: 401 })
    })

    it('jose ok pero payload sin sub -> 401', async () => {
        jwtVerifyMock.mockResolvedValue({ payload: { aud: 'authenticated' } })
        const r = await verifyMobileBearer('no.sub.token')
        expect(r).toEqual({ ok: false, status: 401 })
        expect(getUserMock).not.toHaveBeenCalled()
    })

    it('token vacío -> 401 sin tocar jose ni getUser', async () => {
        const r = await verifyMobileBearer('')
        expect(r).toEqual({ ok: false, status: 401 })
        expect(jwtVerifyMock).not.toHaveBeenCalled()
        expect(getUserMock).not.toHaveBeenCalled()
    })

    it('sin NEXT_PUBLIC_SUPABASE_URL -> usa getUser directo (no arma JWKS)', async () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
        getUserMock.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null })
        const r = await verifyMobileBearer('t')
        expect(r).toEqual({ ok: true, userId: 'u3', via: 'getUser' })
        expect(jwtVerifyMock).not.toHaveBeenCalled()
    })
})
