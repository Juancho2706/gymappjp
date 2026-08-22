import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Server Action del reenvío de confirmación en la WEB.
 *
 * El helper compartido (`lib/auth/resend-confirmation.ts`) NO se mockea a propósito: la mitad de lo
 * que importa acá es el ORDEN en que corren los guards —identificación, coach, estado, throttle—
 * y con el helper mockeado ese orden deja de estar pinneado. Lo único simulado es el borde: la
 * sesión de Supabase, el limitador de Upstash, la DB y Resend.
 *
 * El caso que da nombre a la ronda: la web LEE el ledger. Antes solo escribía, así que alguien
 * podía vaciar los 5 reenvíos del día desde el navegador y dejar el botón de la app dando 429 sin
 * que la web se hubiera frenado nunca.
 */

const UID = '11111111-1111-4111-8111-111111111111'
const OTHER_UID = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-08-22T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

function ago(ms: number): string {
    return new Date(NOW.getTime() - ms).toISOString()
}

const harness = vi.hoisted(() => {
    const state = {
        sessionUserId: null as string | null,
        rateLimit: { ok: true } as { ok: true } | { ok: false; retryAfter: number },
        ledgerRows: [] as { created_at: string }[],
        ledgerError: null as { message: string } | null,
        authUser: null as { id: string; email: string | null; email_confirmed_at?: string | null } | null,
        coach: null as { full_name: string | null; subscription_status: string } | null,
    }
    const auditInserts: Record<string, unknown>[] = []
    /** Stub honesto de GoTrue: solo devuelve el usuario si le preguntan por SU id. */
    const getUserByIdMock = vi.fn(async (id: string) => ({
        data: { user: state.authUser?.id === id ? state.authUser : null },
    }))
    const coachLookupMock = vi.fn()
    const rateLimitKeys: string[] = []
    const rateLimitAuthMock = vi.fn(async (key: string) => {
        rateLimitKeys.push(key)
        return state.rateLimit
    })
    const resendMock = vi.fn(async () => ({ ok: true }) as { ok: boolean; error?: string })
    /** Traza del orden real de las operaciones: es lo que se afirma en el test de secuencia. */
    const steps: string[] = []

    const adminStub = {
        auth: { admin: { getUserById: getUserByIdMock } },
        from: (table: string) => {
            if (table === 'admin_audit_logs') {
                const q = {
                    eq: () => q,
                    gte: () => q,
                    order: () => q,
                    limit: async () => {
                        steps.push('ledger:read')
                        return {
                            data: state.ledgerError ? null : state.ledgerRows,
                            error: state.ledgerError,
                        }
                    },
                }
                return {
                    select: () => q,
                    insert: async (row: Record<string, unknown>) => {
                        steps.push('ledger:write')
                        auditInserts.push(row)
                        return { error: null }
                    },
                }
            }
            if (table === 'coaches') {
                coachLookupMock()
                steps.push('coaches')
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach }) }) }),
                }
            }
            throw new Error(`Tabla inesperada en el stub: ${table}`)
        },
    }

    const supabaseStub = {
        auth: {
            getUser: async () => {
                steps.push('auth:getUser')
                return { data: { user: state.sessionUserId ? { id: state.sessionUserId } : null } }
            },
        },
    }

    return {
        state,
        steps,
        auditInserts,
        adminStub,
        supabaseStub,
        getUserByIdMock,
        coachLookupMock,
        rateLimitAuthMock,
        resendMock,
    }
})

const { state, steps, auditInserts, getUserByIdMock, coachLookupMock, rateLimitAuthMock, resendMock } =
    harness

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.supabaseStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitAuth: harness.rateLimitAuthMock }))
vi.mock('@/lib/auth/send-coach-email-confirmation', () => ({
    resendCoachSignupConfirmationEmail: harness.resendMock,
}))

import { resendConfirmationAction } from './resend.actions'

function form(uid?: string) {
    const fd = new FormData()
    if (uid !== undefined) fd.set('uid', uid)
    return fd
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    steps.length = 0
    auditInserts.length = 0
    state.sessionUserId = null
    state.rateLimit = { ok: true }
    state.ledgerRows = []
    state.ledgerError = null
    state.authUser = { id: UID, email: 'coach@example.com' }
    state.coach = { full_name: 'Josefa Díaz', subscription_status: 'pending_email' }
    resendMock.mockResolvedValue({ ok: true })
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    errorSpy.mockRestore()
})

describe('resendConfirmationAction — identificación', () => {
    it('sin sesión y sin uid ⇒ mensaje de enlace roto y ni una consulta', async () => {
        const result = await resendConfirmationAction({}, form())

        expect(result).toEqual({
            error: 'No pudimos identificar tu cuenta desde este enlace. Vuelve a registrarte o escríbenos a soporte.',
        })
        expect(rateLimitAuthMock).not.toHaveBeenCalled()
        expect(getUserByIdMock).not.toHaveBeenCalled()
        expect(coachLookupMock).not.toHaveBeenCalled()
    })

    it('un uid con formato inválido no se acepta como identidad', async () => {
        const result = await resendConfirmationAction({}, form('no-es-uuid'))

        expect(result.error).toContain('No pudimos identificar tu cuenta')
        expect(getUserByIdMock).not.toHaveBeenCalled()
    })

    it('sin sesión, el uid del enlace del registro SÍ identifica', async () => {
        await resendConfirmationAction({}, form(UID))

        expect(getUserByIdMock).toHaveBeenCalledWith(UID)
        expect(resendMock).toHaveBeenCalledTimes(1)
    })

    it('con sesión, el uid del formData NO cambia el destino: manda la sesión', async () => {
        state.sessionUserId = UID

        const result = await resendConfirmationAction({}, form(OTHER_UID))

        expect(result).toEqual({ ok: true })
        expect(getUserByIdMock).toHaveBeenCalledWith(UID)
        expect(getUserByIdMock).not.toHaveBeenCalledWith(OTHER_UID)
        expect(rateLimitAuthMock).toHaveBeenCalledWith(`resend-confirmation:${UID}`)
        expect(auditInserts[0]).toMatchObject({ target_id: UID })
    })
})

describe('resendConfirmationAction — guards en orden', () => {
    it('la secuencia es: sesión → coaches → ledger → envío', async () => {
        state.sessionUserId = UID

        await resendConfirmationAction({}, form())

        expect(steps).toEqual(['auth:getUser', 'coaches', 'ledger:read', 'ledger:write'])
    })

    it('el limitador de Upstash corta antes de tocar la DB', async () => {
        state.rateLimit = { ok: false, retryAfter: 30 }

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({ error: 'Espera 30s antes de pedir otro reenvío.' })
        expect(getUserByIdMock).not.toHaveBeenCalled()
        expect(steps).toEqual(['auth:getUser'])
    })

    it('uid que no es coach (un alumno, un uid inventado) ⇒ "No encontramos la cuenta"', async () => {
        state.coach = null

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({
            error: 'No encontramos la cuenta. Vuelve a registrarte o escríbenos a soporte.',
        })
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('coach ya activo ⇒ el mensaje que lo manda al login, sin gastar ledger', async () => {
        state.coach = { full_name: 'Josefa Díaz', subscription_status: 'active' }

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({
            error: 'Tu correo ya está confirmado. Puedes iniciar sesión directamente.',
        })
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('`email_confirmed_at` en auth también corta, aunque `coaches` siga en pending_email', async () => {
        state.authUser = { id: UID, email: 'coach@example.com', email_confirmed_at: '2026-08-22T10:00:00Z' }

        const result = await resendConfirmationAction({}, form(UID))

        expect(result.error).toContain('ya está confirmado')
        expect(resendMock).not.toHaveBeenCalled()
    })
})

describe('resendConfirmationAction — el ledger compartido con el móvil', () => {
    it('cooldown de 60 s ⇒ mensaje romo, sin filtrar cuál de los dos frenos fue', async () => {
        state.ledgerRows = [{ created_at: ago(15_000) }]

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({ error: 'Espera un momento antes de volver a reenviar.' })
        expect(resendMock).not.toHaveBeenCalled()
        expect(auditInserts).toEqual([])
    })

    it('tope diario alcanzado desde la app ⇒ la web también queda frenada', async () => {
        state.ledgerRows = [2, 5, 9, 14, 20].map((h) => ({ created_at: ago(h * HOUR) }))

        const result = await resendConfirmationAction({}, form(UID))

        // Mismo texto que el cooldown: el mensaje no dice si faltan 45 s o 4 h. Acá el uid puede
        // venir de la URL, así que cualquier detalle sería un oráculo.
        expect(result).toEqual({ error: 'Espera un momento antes de volver a reenviar.' })
        expect(resendMock).not.toHaveBeenCalled()
    })

    it('ledger ilegible ⇒ fail-CLOSED con el mismo mensaje y log sin PII', async () => {
        state.ledgerError = { message: 'statement timeout' }

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({ error: 'Espera un momento antes de volver a reenviar.' })
        expect(resendMock).not.toHaveBeenCalled()
        expect(errorSpy).toHaveBeenCalledTimes(1)
        const logged = JSON.stringify(errorSpy.mock.calls)
        expect(logged).not.toContain(UID)
        expect(logged).not.toContain('coach@example.com')
    })

    it('envío OK ⇒ `{ ok: true }`, correo al email de auth.users y fila con `surface: web`', async () => {
        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({ ok: true })
        expect(resendMock).toHaveBeenCalledWith({ email: 'coach@example.com', coachName: 'Josefa Díaz' })
        expect(auditInserts).toEqual([
            {
                admin_email: 'system',
                action: 'coach.confirmation_resent',
                target_table: 'coaches',
                target_id: UID,
                payload: { surface: 'web' },
            },
        ])
    })

    it('la fila se RESERVA antes de enviar: si Resend falla, el intento igual quedó contado', async () => {
        resendMock.mockResolvedValue({ ok: false, error: 'Resend 500: upstream' })

        const result = await resendConfirmationAction({}, form(UID))

        expect(result).toEqual({ error: 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.' })
        expect(auditInserts).toHaveLength(1)
        expect(steps).toEqual(['auth:getUser', 'coaches', 'ledger:read', 'ledger:write'])
    })
})
