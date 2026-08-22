import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La ÚNICA transición `pending_email → active` del coach Free. Lo que se pinnea: la puerta (solo
 * confirmado + free + pending), la idempotencia (UPDATE condicional con filas devueltas) y que un
 * correo que falla jamás deshace una activación ni lanza.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

const harness = vi.hoisted(() => {
    const state = {
        authUser: null as { email: string | null; email_confirmed_at: string | null } | null,
        coach: null as Record<string, unknown> | null,
        flipped: [{ id: '11111111-1111-4111-8111-111111111111' }] as Array<{ id: string }>,
        updateError: null as { message: string } | null,
    }
    const updates: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = []
    const getUserByIdMock = vi.fn(async () => ({ data: { user: state.authUser } }))
    const sendMock = vi.fn(async () => undefined)

    const adminStub = {
        auth: { admin: { getUserById: getUserByIdMock } },
        from: (table: string) => {
            if (table !== 'coaches') throw new Error(`Tabla inesperada: ${table}`)
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach }) }) }),
                update: (patch: Record<string, unknown>) => {
                    const entry = { patch, filters: [] as Array<[string, unknown]> }
                    updates.push(entry)
                    const chain = {
                        eq: (col: string, val: unknown) => {
                            entry.filters.push([col, val])
                            return chain
                        },
                        select: async () => ({ data: state.updateError ? null : state.flipped, error: state.updateError }),
                    }
                    return chain
                },
            }
        },
    }

    return { state, updates, adminStub, getUserByIdMock, sendMock }
})

const { state, updates, adminStub, getUserByIdMock, sendMock } = harness

vi.mock('@/lib/email/free-coach-onboarding', () => ({ sendFreeCoachOnboardingEmails: harness.sendMock }))

import { activateConfirmedFreeCoach } from './activate-confirmed-coach'

const PENDING_FREE = {
    id: USER_ID,
    subscription_status: 'pending_email',
    subscription_tier: 'free',
    full_name: 'Josefa Díaz',
    brand_name: 'Studio Fuerza',
    invite_code: 'X5UD9X44',
}

function run(extra: Partial<Parameters<typeof activateConfirmedFreeCoach>[0]> = {}) {
    return activateConfirmedFreeCoach({
        admin: adminStub as never,
        userId: USER_ID,
        appUrl: 'https://www.eva-app.cl',
        ...extra,
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    updates.length = 0
    state.authUser = { email: 'coach@example.com', email_confirmed_at: '2026-08-22T13:22:42Z' }
    state.coach = { ...PENDING_FREE }
    state.flipped = [{ id: USER_ID }]
    state.updateError = null
    getUserByIdMock.mockImplementation(async () => ({ data: { user: state.authUser } }))
    sendMock.mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('activateConfirmedFreeCoach — el camino feliz', () => {
    it('sin `authUser` lee al usuario con service-role, activa con UPDATE condicional y manda los correos', async () => {
        const result = await run()

        expect(result).toEqual({ activated: true, emails: 'sent' })
        expect(getUserByIdMock).toHaveBeenCalledWith(USER_ID)
        expect(updates).toHaveLength(1)
        expect(updates[0]!.patch).toEqual({ subscription_status: 'active' })
        // La condición de carrera vive en el WHERE: id + estado previo.
        expect(updates[0]!.filters).toEqual([
            ['id', USER_ID],
            ['subscription_status', 'pending_email'],
        ])
        expect(sendMock).toHaveBeenCalledWith({
            admin: adminStub,
            coachId: USER_ID,
            email: 'coach@example.com',
            coachName: 'Josefa Díaz',
            brandName: 'Studio Fuerza',
            inviteCode: 'X5UD9X44',
            appUrl: 'https://www.eva-app.cl',
        })
    })

    it('con `authUser` del caller NO vuelve a consultar GoTrue', async () => {
        const result = await run({ authUser: state.authUser })
        expect(result.activated).toBe(true)
        expect(getUserByIdMock).not.toHaveBeenCalled()
    })

    it('`confirmedNow` vale aunque el objeto del OTP venga sin `email_confirmed_at`', async () => {
        const result = await run({ authUser: { email: 'coach@example.com', email_confirmed_at: null }, confirmedNow: true })
        expect(result.activated).toBe(true)
        expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('un correo que REVIENTA no deshace la activación ni lanza', async () => {
        sendMock.mockRejectedValueOnce(new Error('Resend 500'))
        const result = await run()
        expect(result).toEqual({ activated: true, emails: 'failed' })
        expect(updates).toHaveLength(1)
    })
})

describe('activateConfirmedFreeCoach — la puerta', () => {
    it('email sin confirmar en GoTrue ⇒ no toca `coaches` ni manda nada', async () => {
        state.authUser = { email: 'coach@example.com', email_confirmed_at: null }
        expect(await run()).toEqual({ activated: false, reason: 'not_confirmed' })
        expect(updates).toHaveLength(0)
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('usuario sin email ⇒ `no_email`', async () => {
        state.authUser = { email: null, email_confirmed_at: '2026-08-22T13:22:42Z' }
        expect(await run()).toEqual({ activated: false, reason: 'no_email' })
    })

    it('sin fila en `coaches` (un alumno, por ejemplo) ⇒ `not_found`', async () => {
        state.coach = null
        expect(await run()).toEqual({ activated: false, reason: 'not_found' })
        expect(updates).toHaveLength(0)
    })

    it('coach de plan PAGO en pending_email ⇒ `not_free` (esa serie de correos es solo del Free)', async () => {
        state.coach = { ...PENDING_FREE, subscription_tier: 'pro' }
        expect(await run()).toEqual({ activated: false, reason: 'not_free' })
        expect(updates).toHaveLength(0)
    })

    it('coach ya activo ⇒ `not_pending`, cero correos (idempotencia por lectura)', async () => {
        state.coach = { ...PENDING_FREE, subscription_status: 'active' }
        expect(await run()).toEqual({ activated: false, reason: 'not_pending' })
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('otro caller ganó la carrera (UPDATE sin filas) ⇒ `raced`, cero correos (idempotencia por escritura)', async () => {
        state.flipped = []
        expect(await run()).toEqual({ activated: false, reason: 'raced' })
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('UPDATE con error ⇒ `update_failed` y cero correos', async () => {
        state.updateError = { message: 'connection reset' }
        expect(await run()).toEqual({ activated: false, reason: 'update_failed' })
        expect(sendMock).not.toHaveBeenCalled()
    })
})
