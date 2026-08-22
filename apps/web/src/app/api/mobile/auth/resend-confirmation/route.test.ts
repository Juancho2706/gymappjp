import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Reenvío del correo de confirmación DESDE LA APP (W4 del embudo Free→Pro).
 *
 * Lo que se pinnea acá es el borde de seguridad, no la felicidad del camino: el endpoint jamás
 * puede (a) mandar un correo a una dirección que llegó en el body, (b) contestar distinto según el
 * uid exista o no, (c) dejar que alguien insista sin techo, ni (d) escupir un 500 —que ya sería
 * contestar distinto— cuando algo revienta después de haber resuelto la identidad.
 */

const UID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-08-22T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function ago(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString()
}

const harness = vi.hoisted(() => {
    const state = {
        ipAllowed: true,
        ledgerRows: [] as { created_at: string }[],
        ledgerError: null as { message: string } | null,
        authUser: null as { id: string; email: string | null; email_confirmed_at?: string | null } | null,
        coach: null as { full_name: string | null; subscription_status: string } | null,
        auditInsertError: null as { message: string } | null,
    }
    const auditInserts: Record<string, unknown>[] = []
    const getUserByIdMock = vi.fn(async () => ({ data: { user: state.authUser } }))
    const coachLookupMock = vi.fn()
    const resendMock = vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string })

    // Query builder mínimo: el endpoint hace un select encadenado sobre `admin_audit_logs`, un
    // insert sobre la misma tabla, y un `select().eq().maybeSingle()` sobre `coaches`. Cualquier
    // otra tabla LANZA: un stub que contesta a todo esconde una consulta nueva que nadie revisó.
    const adminStub = {
        auth: { admin: { getUserById: getUserByIdMock } },
        from: (table: string) => {
            if (table === 'admin_audit_logs') {
                const q = {
                    eq: () => q,
                    gte: () => q,
                    order: () => q,
                    limit: async () => ({
                        data: state.ledgerError ? null : state.ledgerRows,
                        error: state.ledgerError,
                    }),
                }
                return {
                    select: () => q,
                    insert: async (row: Record<string, unknown>) => {
                        auditInserts.push(row)
                        if (!state.auditInsertError) {
                            // La reserva queda VISIBLE para la siguiente lectura, igual que en la DB:
                            // es lo único que hace que el segundo intento choque contra el cooldown.
                            state.ledgerRows = [
                                { created_at: new Date().toISOString() },
                                ...state.ledgerRows,
                            ]
                        }
                        return { error: state.auditInsertError }
                    },
                }
            }
            if (table === 'coaches') {
                coachLookupMock()
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach }) }) }),
                }
            }
            throw new Error(`Tabla inesperada en el stub: ${table}`)
        },
    }

    return { state, auditInserts, adminStub, getUserByIdMock, coachLookupMock, resendMock }
})

const { state, auditInserts, getUserByIdMock, coachLookupMock, resendMock } = harness

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))

vi.mock('@/lib/rate-limit', () => ({
    clientIpFromRequest: () => '203.0.113.7',
    rateLimitAuth: async () =>
        harness.state.ipAllowed ? { ok: true } : { ok: false, retryAfter: 30 },
}))

vi.mock('@/lib/auth/send-coach-email-confirmation', () => ({
    resendCoachSignupConfirmationEmail: harness.resendMock,
}))

import { POST } from './route'

function req(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    auditInserts.length = 0
    state.ipAllowed = true
    state.ledgerRows = []
    state.ledgerError = null
    state.authUser = { id: UID, email: 'coach@example.com' }
    state.coach = { full_name: 'Josefa Díaz', subscription_status: 'pending_email' }
    state.auditInsertError = null
    // `clearAllMocks` limpia llamadas pero NO implementaciones: sin esto, el `mockRejectedValue` de
    // un test de excepción se filtra a todos los siguientes y los deja pasando por la razón
    // equivocada (todo sale 200 neutro, que es justo lo que varios casos afirman).
    getUserByIdMock.mockImplementation(async () => ({ data: { user: state.authUser } }))
    resendMock.mockResolvedValue({ ok: true })
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
})

describe('POST /api/mobile/auth/resend-confirmation', () => {
    it('coach pending: reenvía al email de `auth.users` y anota el ledger', async () => {
        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(resendMock).toHaveBeenCalledTimes(1)
        expect(resendMock).toHaveBeenCalledWith({ email: 'coach@example.com', coachName: 'Josefa Díaz' })
        expect(auditInserts).toEqual([
            {
                admin_email: 'system',
                action: 'coach.confirmation_resent',
                target_table: 'coaches',
                target_id: UID,
                payload: { surface: 'mobile' },
            },
        ])
    })

    it('el email del body es DECORADO: el destino sale siempre de auth.users', async () => {
        await POST(req({ uid: UID, email: 'atacante@evil.com' }))

        expect(resendMock).toHaveBeenCalledWith({ email: 'coach@example.com', coachName: 'Josefa Díaz' })
        expect(JSON.stringify(resendMock.mock.calls)).not.toContain('evil.com')
    })

    it('uid inexistente ⇒ 200 neutro, sin envío y sin ledger (no es un oráculo de cuentas)', async () => {
        state.authUser = null

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('uid de un ALUMNO (existe en auth, no en `coaches`) ⇒ 200 neutro y sin envío', async () => {
        state.coach = null

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(coachLookupMock).toHaveBeenCalledTimes(1)
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('`auth.users.email` nulo ⇒ 200 neutro, sin envío y sin mirar `coaches`', async () => {
        state.authUser = { id: UID, email: null }

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(coachLookupMock).not.toHaveBeenCalled()
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('coach ya confirmado ⇒ 200 neutro, sin envío', async () => {
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'active' }

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('`email_confirmed_at` en auth gana sobre un `coaches` regresado a pending_email', async () => {
        state.authUser = { id: UID, email: 'coach@example.com', email_confirmed_at: '2026-08-22T10:00:00Z' }
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'pending_email' }

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it.each(['pending_payment', 'past_due', 'canceled', 'PENDING_EMAIL'])(
        'subscription_status %s ⇒ 200 neutro sin envío (solo `pending_email` exacto califica)',
        async (status) => {
            state.coach = { full_name: 'Josefa Díaz', subscription_status: status }

            const res = await POST(req({ uid: UID }))

            expect(res.status).toBe(200)
            expect(await res.json()).toEqual({ ok: true })
            expect(resendMock).not.toHaveBeenCalled()
            expect(auditInserts).toEqual([])
        }
    )

    it('segundo intento dentro de los 60 s ⇒ 429 con Retry-After y sin tocar GoTrue', async () => {
        state.ledgerRows = [{ created_at: ago(15_000) }]

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('45')
        expect(await res.json()).toMatchObject({ code: 'RATE_LIMIT', retryAfter: 45 })
        expect(getUserByIdMock).not.toHaveBeenCalled()
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('el 6.º del día ⇒ 429 aunque el cooldown esté cumplido', async () => {
        state.ledgerRows = [2, 5, 9, 14, 20].map((h) => ({ created_at: ago(h * HOUR) }))

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(429)
        expect(await res.json()).toMatchObject({ code: 'RATE_LIMIT', retryAfter: 4 * 60 * 60 })
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('5 envíos viejos pero el último hace 2 h ⇒ deja pasar el reenvío legítimo', async () => {
        state.ledgerRows = [2, 30, 31, 32, 33].map((h) => ({ created_at: ago(h * HOUR) }))

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(resendMock).toHaveBeenCalledTimes(1)
    })

    it('ledger ilegible ⇒ fail-CLOSED (429), no se manda nada a ciegas', async () => {
        state.ledgerError = { message: 'db down' }

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('60')
        expect(resendMock).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalled()
    })

    it('la fila del ledger se RESERVA antes de enviar: si Resend falla igual consume el cupo', async () => {
        resendMock.mockResolvedValue({ ok: false, error: 'Resend 500: upstream' })

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        // El ledger cuenta INTENTOS: sin esta fila, cada fallo de Resend sería vía libre para
        // disparar `generateLink` sin techo.
        expect(auditInserts).toHaveLength(1)
        expect(errorSpy).toHaveBeenCalled()
    })

    it('una EXCEPCIÓN del envío (p. ej. `fetch failed`) ⇒ 200 `{ ok: true }`, nunca un 500', async () => {
        // El 500 solo puede ocurrir después de resolver la identidad ⇒ sería el oráculo que el
        // guard 6 evita: "este uid existe y está sin confirmar".
        resendMock.mockRejectedValue(new Error('fetch failed'))

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(errorSpy).toHaveBeenCalled()
    })

    it('una excepción de GoTrue al resolver la identidad también sale neutra', async () => {
        getUserByIdMock.mockRejectedValue(new Error('gotrue unreachable'))

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('dos POST seguidos con el MISMO uid válido ⇒ 200 y después 429 (la reserva se ve)', async () => {
        const first = await POST(req({ uid: UID }))
        const second = await POST(req({ uid: UID }))

        expect(first.status).toBe(200)
        expect(second.status).toBe(429)
        expect(await second.json()).toMatchObject({ code: 'RATE_LIMIT', retryAfter: 60 })
        expect(resendMock).toHaveBeenCalledTimes(1)
    })

    it('dos POST seguidos con un uid INEXISTENTE ⇒ 200 y 200 (el 429 no se regala)', async () => {
        // El diferencial con el caso de arriba (200 → 429) es el oráculo parcial documentado en el
        // guard 6: cerrarlo exigiría escribir el ledger para uids arbitrarios, o sea regalar un
        // vector de inserts sin autenticar. Con 122 bits de uid, adivinar no es un ataque.
        state.authUser = null

        const first = await POST(req({ uid: UID }))
        const second = await POST(req({ uid: UID }))

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(auditInserts).toEqual([])
    })

    it('body inválido ⇒ 400 y ni una consulta', async () => {
        for (const body of [{}, { uid: 'no-es-uuid' }, { uid: '' }, { uid: 123 }, 'no-json']) {
            const res = await POST(req(body))
            expect(res.status).toBe(400)
            expect(await res.json()).toMatchObject({ code: 'VALIDATION_ERROR' })
        }
        expect(getUserByIdMock).not.toHaveBeenCalled()
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('el limitador por IP corta antes de parsear el body', async () => {
        state.ipAllowed = false

        const res = await POST(req({ uid: UID }))

        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('30')
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('ningún log lleva el uid, el correo del coach ni una arroba suelta', async () => {
        state.authUser = null
        await POST(req({ uid: UID }))

        state.authUser = { id: UID, email: 'coach@example.com' }
        state.ledgerRows = []
        // El cuerpo del 4xx de Resend REPITE la dirección de destino: es la fuga real, y el log
        // solo puede quedarse con el encabezado.
        resendMock.mockResolvedValue({
            ok: false,
            error: 'Resend 422: {"message":"Invalid `to` field: coach@example.com"}',
        })
        await POST(req({ uid: UID }))

        state.ledgerRows = []
        resendMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND api.resend.com'))
        await POST(req({ uid: UID }))

        state.ledgerRows = []
        state.ledgerError = { message: 'timeout' }
        await POST(req({ uid: UID }))

        const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls])
        expect(logged).not.toContain(UID)
        expect(logged).not.toContain('coach@example.com')
        expect(logged).not.toContain('@')
    })
})
