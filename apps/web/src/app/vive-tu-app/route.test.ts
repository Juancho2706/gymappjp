import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const verifyOtp = vi.fn()
const signOut = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { verifyOtp, signOut } })),
}))

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle }),
            }),
        }),
    })),
}))

import { GET } from './route'

function req(qs: string) {
    return new NextRequest(`https://www.eva-app.cl/vive-tu-app${qs}`)
}

describe('GET /vive-tu-app', () => {
    beforeEach(() => {
        verifyOtp.mockReset()
        signOut.mockReset()
        maybeSingle.mockReset()
    })

    it('sin identificador válido → /login, sin verificar nada', async () => {
        const res = await GET(req('?t=abc&c=../x'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/login')
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('sin token → login del alumno con error', async () => {
        const res = await GET(req('?c=studio-fuerza-qa'))
        expect(res.headers.get('location')).toBe(
            'https://www.eva-app.cl/c/studio-fuerza-qa/login?error=vive_tu_app_expirado'
        )
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('token vencido → login del alumno con error', async () => {
        verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
        const res = await GET(req('?t=tok&c=studio-fuerza-qa'))
        expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok', type: 'magiclink' })
        expect(res.headers.get('location')).toContain('/c/studio-fuerza-qa/login?error=vive_tu_app_expirado')
    })

    it('token válido de un alumno DEMO → dashboard del alumno con la marca del coach', async () => {
        verifyOtp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
        maybeSingle.mockResolvedValue({ data: { id: 'u1', is_demo: true } })
        const res = await GET(req('?t=tok&c=X5UD9X44'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9X44/dashboard')
        expect(signOut).not.toHaveBeenCalled()
    })

    it('token válido de un usuario que NO es demo → cierra la sesión y vuelve al login', async () => {
        verifyOtp.mockResolvedValue({ data: { user: { id: 'coach-1' } }, error: null })
        maybeSingle.mockResolvedValue({ data: null })
        const res = await GET(req('?t=tok&c=studio-fuerza-qa'))
        expect(signOut).toHaveBeenCalledTimes(1)
        expect(res.headers.get('location')).toContain('/c/studio-fuerza-qa/login?error=vive_tu_app_expirado')
    })
})
