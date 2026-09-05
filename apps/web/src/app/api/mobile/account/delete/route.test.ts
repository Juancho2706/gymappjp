import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Baja de cuenta EN-APP (Guideline 5.1.1(v)) — lo que este archivo pinnea es UNA cosa: al darse de
 * baja, los correos que le quedaban AGENDADOS al coach en Resend se cancelan, y ese intento NUNCA
 * puede impedir el ban.
 *
 * Por qué importa: `DangerZone` (web) y la hoja equivalente de RN prometen «Serás desuscripto de
 * todos los emails de EVA». Sin esta cancelación el drip de venta (agendado a 2 y 14 días en el
 * alta) seguía llegando a una casilla cuya cuenta la app ya declaró eliminada — un problema legal y
 * reputacional, no cosmético.
 *
 * Y al revés: el ban es lo ÚNICO que cierra la cuenta de verdad. Si Resend está caído, la baja
 * sigue; el fallo viaja como `warning` para que soporte lo persiga. Ese es el mismo contrato
 * best-effort que ya tenía el teardown de billing.
 */

const COACH_ID = '11111111-1111-4111-8111-111111111111'

const harness = vi.hoisted(() => {
    const state = {
        /** Fila `coaches` (null = el que se da de baja es un alumno, no un coach). */
        coachRow: null as Record<string, unknown> | null,
        /** `cancelCoachEmails` explota (red caída, env sin API key). */
        cancelThrows: false,
        /** Quedan agendados que no se pudieron cancelar. */
        cancelFailed: 0,
        banError: null as { message: string } | null,
        /** T9: GoTrue no pudo revocar las sesiones. */
        signOutError: null as { message: string } | null,
    }
    /** Orden real de efectos: sirve para probar que la cancelación va ANTES del ban. */
    const order: string[] = []

    const cancelCoachEmailsMock = vi.fn(async () => {
        order.push('cancelCoachEmails')
        if (state.cancelThrows) throw new Error('resend 503')
        return { cancelled: 2, alreadySent: 0, failed: state.cancelFailed }
    })

    const updateUserByIdMock = vi.fn(async () => {
        order.push('ban')
        return { error: state.banError }
    })

    const signOutMock = vi.fn(async () => {
        order.push('signOut')
        return { data: null, error: state.signOutError }
    })

    const inserts: { table: string; row: Record<string, unknown> }[] = []

    const adminStub = {
        auth: {
            getUser: vi.fn(async () => ({ data: { user: { id: COACH_ID } }, error: null })),
            admin: { updateUserById: updateUserByIdMock, signOut: signOutMock },
        },
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: table === 'coaches' ? state.coachRow : null,
                        error: null,
                    }),
                }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
            insert: async (row: Record<string, unknown>) => {
                inserts.push({ table, row })
                return { error: null }
            },
        }),
    }

    return { state, order, inserts, cancelCoachEmailsMock, updateUserByIdMock, signOutMock, adminStub }
})

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => harness.adminStub,
}))
vi.mock('@/lib/rate-limit', () => ({
    rateLimitAuth: async () => ({ ok: true }),
    jsonRateLimited: () => new Response(null, { status: 429 }),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProviderForCoach: () => ({
        name: 'mercadopago',
        cancelCheckoutAtProvider: vi.fn(async () => {}),
    }),
    getPaymentsProvider: () => ({
        name: 'mercadopago',
        cancelCheckoutAtProvider: vi.fn(async () => {}),
    }),
}))
vi.mock('@/services/email/coach-email-ledger.service', () => ({
    cancelCoachEmails: harness.cancelCoachEmailsMock,
}))

import { POST } from './route'

function request() {
    return new NextRequest('https://app.eva-app.cl/api/mobile/account/delete', {
        method: 'POST',
        headers: { authorization: 'Bearer token-de-prueba' },
    })
}

/** Coach sin suscripción viva: el teardown de billing no hace nada y no ensucia el test. */
const COACH_SIN_SUB = {
    id: COACH_ID,
    subscription_status: 'canceled',
    subscription_mp_id: null,
    subscription_provider: null,
    subscription_provider_external_id: null,
    superseded_mp_preapproval_id: null,
}

describe('POST /api/mobile/account/delete — correos agendados', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        harness.order.length = 0
        harness.inserts.length = 0
        harness.state.coachRow = { ...COACH_SIN_SUB }
        harness.state.cancelThrows = false
        harness.state.cancelFailed = 0
        harness.state.banError = null
        harness.state.signOutError = null
    })

    it('cancela TODO lo agendado del coach y lo hace antes del ban', async () => {
        const res = await POST(request())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })

        // `'*'` y no las keys del drip: se va la cuenta entera, no una serie.
        expect(harness.cancelCoachEmailsMock).toHaveBeenCalledTimes(1)
        expect(harness.cancelCoachEmailsMock).toHaveBeenCalledWith(harness.adminStub, COACH_ID, '*')
        expect(harness.order).toEqual(['cancelCoachEmails', 'ban', 'signOut'])
    })

    it('si la cancelación explota, la cuenta se da de baja igual (con warning)', async () => {
        harness.state.cancelThrows = true

        const res = await POST(request())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, warnings: ['EMAIL_CANCEL_FAILED'] })
        // Lo único que no es negociable: el ban corrió.
        expect(harness.updateUserByIdMock).toHaveBeenCalledTimes(1)
    })

    it('agendados que Resend no pudo cancelar ⇒ warning parcial, la baja sigue', async () => {
        harness.state.cancelFailed = 3

        const res = await POST(request())

        await expect(res.json()).resolves.toEqual({ ok: true, warnings: ['EMAIL_CANCEL_PARTIAL'] })
        expect(harness.updateUserByIdMock).toHaveBeenCalledTimes(1)
    })

    it('un ALUMNO que se da de baja no toca el ledger (no tiene correos de coach)', async () => {
        harness.state.coachRow = null

        const res = await POST(request())

        expect(res.status).toBe(200)
        expect(harness.cancelCoachEmailsMock).not.toHaveBeenCalled()
        expect(harness.updateUserByIdMock).toHaveBeenCalledTimes(1)
    })
})

/**
 * T9 de `specs/account-deletion` — revocacion INMEDIATA de las sesiones activas.
 *
 * El bug que cierra: el ban (`ban_duration`) corta login y refresh, pero NO invalida un access token
 * ya emitido, que sigue validando por firma hasta que expira (~1 h). Durante esa hora la cuenta que
 * la app declara «eliminada» seguia pudiendo leer y escribir — en el propio dispositivo y en
 * cualquier otro con sesion abierta.
 */
describe('POST /api/mobile/account/delete — revocacion de sesiones (T9)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        harness.order.length = 0
        harness.inserts.length = 0
        harness.state.coachRow = { ...COACH_SIN_SUB }
        harness.state.cancelThrows = false
        harness.state.cancelFailed = 0
        harness.state.banError = null
        harness.state.signOutError = null
    })

    it('revoca TODAS las sesiones (scope global) con el bearer del request, despues del ban', async () => {
        const res = await POST(request())

        expect(res.status).toBe(200)
        // `'global'` y no `'local'`: se van todas las sesiones del usuario, no solo la de este device.
        expect(harness.signOutMock).toHaveBeenCalledTimes(1)
        expect(harness.signOutMock).toHaveBeenCalledWith('token-de-prueba', 'global')
        // Despues del ban: si GoTrue rechaza la revocacion, la cuenta ya quedo cerrada igual.
        expect(harness.order.indexOf('ban')).toBeLessThan(harness.order.indexOf('signOut'))
    })

    it('si la revocacion falla, la baja sigue con warning (el ban ya cerro la cuenta)', async () => {
        harness.state.signOutError = { message: 'gotrue 503' }

        const res = await POST(request())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, warnings: ['SESSION_REVOKE_FAILED'] })
    })

    it('un ALUMNO tambien queda con las sesiones revocadas', async () => {
        harness.state.coachRow = null

        const res = await POST(request())

        expect(res.status).toBe(200)
        expect(harness.signOutMock).toHaveBeenCalledWith('token-de-prueba', 'global')
    })

    it('sin ban no hay revocacion: la cuenta sigue viva y no se le matan las sesiones', async () => {
        harness.state.banError = { message: 'gotrue 500' }

        const res = await POST(request())

        expect(res.status).toBe(500)
        expect(harness.signOutMock).not.toHaveBeenCalled()
    })
})
