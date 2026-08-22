import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendTransactionalEmailMock, scheduleFreeCoachDripSequenceMock, buildFreeCoachWelcomeEmailMock } =
    vi.hoisted(() => ({
        sendTransactionalEmailMock: vi.fn(),
        scheduleFreeCoachDripSequenceMock: vi.fn(),
        buildFreeCoachWelcomeEmailMock: vi.fn(() => ({ subject: 'Bienvenido a EVA', html: '<p>hola</p>' })),
    }))

vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: sendTransactionalEmailMock,
}))

vi.mock('@/lib/email/send-drip-sequence', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/email/send-drip-sequence')>()),
    scheduleFreeCoachDripSequence: scheduleFreeCoachDripSequenceMock,
}))

/** Resumen «todo salió» que devuelve la serie cuando no se dice otra cosa. */
const OK_SUMMARY = { scheduled: 4, deduped: 0, failed: 0, failures: [] }

vi.mock('@/lib/email/transactional-templates', () => ({
    buildFreeCoachWelcomeEmail: buildFreeCoachWelcomeEmailMock,
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendFreeCoachOnboardingEmails } from './free-coach-onboarding'

const admin = {} as SupabaseClient<Database>

const PARAMS = {
    admin,
    coachId: '11111111-1111-4111-8111-111111111111',
    email: 'coach@example.com',
    coachName: 'Coach Test',
    brandName: 'Antigravity Pro',
    inviteCode: 'X5UD9X44',
    appUrl: 'https://www.eva-app.cl',
}

/** Promesa que resuelve/rechaza cuando el test lo decide — así se observa si la función espera. */
function deferred<T = void>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/** Deja correr las microtareas pendientes sin avanzar el reloj. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('sendFreeCoachOnboardingEmails', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        buildFreeCoachWelcomeEmailMock.mockReturnValue({ subject: 'Bienvenido a EVA', html: '<p>hola</p>' })
        sendTransactionalEmailMock.mockResolvedValue({ ok: true })
        scheduleFreeCoachDripSequenceMock.mockResolvedValue(OK_SUMMARY)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('dispara bienvenida + drip con los params esperados', async () => {
        await sendFreeCoachOnboardingEmails(PARAMS)

        expect(buildFreeCoachWelcomeEmailMock).toHaveBeenCalledWith({
            coachName: 'Coach Test',
            brandName: 'Antigravity Pro',
            dashboardUrl: 'https://www.eva-app.cl/coach/dashboard',
            clientsUrl: 'https://www.eva-app.cl/coach/clients',
            subscriptionUrl: 'https://www.eva-app.cl/coach/subscription',
        })
        expect(sendTransactionalEmailMock).toHaveBeenCalledWith({
            to: 'coach@example.com',
            subject: 'Bienvenido a EVA',
            html: '<p>hola</p>',
        })
        // El drip necesita el service-role client + coachId (ledger) y el invite_code (D+1).
        expect(scheduleFreeCoachDripSequenceMock).toHaveBeenCalledWith({
            admin,
            coachId: PARAMS.coachId,
            email: 'coach@example.com',
            coachName: 'Coach Test',
            brandName: 'Antigravity Pro',
            inviteCode: 'X5UD9X44',
        })
    })

    it('si AMBAS patas rechazan resuelve igual (nunca rompe el alta) y loguea sin PII', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        sendTransactionalEmailMock.mockRejectedValue(new Error('resend 500'))
        scheduleFreeCoachDripSequenceMock.mockRejectedValue(new Error('audience 500'))

        await expect(sendFreeCoachOnboardingEmails(PARAMS)).resolves.toBeUndefined()

        expect(warn).toHaveBeenNthCalledWith(1, '[onboarding-email] fallo', 'welcome')
        expect(warn).toHaveBeenNthCalledWith(2, '[onboarding-email] fallo', 'drip')
        // Un rechazo de la serie entera se contabiliza como las 4 caídas.
        expect(error).toHaveBeenCalledWith(
            '[onboarding-emails] drip',
            expect.objectContaining({ coachId: PARAMS.coachId, failed: 4 })
        )
        // Ningún log puede llevar email ni nombre: vive en Vercel, sin retención acotada.
        const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls])
        expect(logged).not.toContain(PARAMS.email)
        expect(logged).not.toContain(PARAMS.coachName)
    })

    // `sendTransactionalEmail` NO rechaza con Resend 4xx/5xx ni sin API key: devuelve `{ ok: false }`.
    // Es el modo de fallo más probable de los dos, así que también tiene que dejar warn.
    it('loguea la bienvenida cuando Resend responde error (resuelve con ok:false, no rechaza)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendTransactionalEmailMock.mockResolvedValue({ ok: false, error: 'Resend 422: domain not verified' })

        await expect(sendFreeCoachOnboardingEmails(PARAMS)).resolves.toBeUndefined()

        expect(warn).toHaveBeenCalledWith('[onboarding-email] fallo', 'welcome')
    })

    /**
     * M-11 / I-4 — el modo de fallo que estaba MUDO: `scheduleCoachEmail` no rechaza cuando Resend
     * responde 4xx/5xx, devuelve `{ ok: false }`. Las cuatro podían caerse dentro del `allSettled`
     * de la serie y el alta se veía impecable en los logs.
     */
    it('las 4 del drip fallan sin rechazar → console.error con el resumen y el coachId', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        scheduleFreeCoachDripSequenceMock.mockResolvedValue({
            scheduled: 0,
            deduped: 0,
            failed: 4,
            failures: [
                { key: 'day1_value', error: 'send_failed' },
                { key: 'day2_pro', error: 'send_failed' },
                { key: 'day7_nutrition', error: 'send_failed' },
                { key: 'day14_last_call', error: 'send_failed' },
            ],
        })

        await sendFreeCoachOnboardingEmails(PARAMS)

        // La pata `drip` no rechazó, así que el warn viejo NO se dispara: sin el resumen esto era
        // exactamente el silencio que el hallazgo describe.
        expect(warn).not.toHaveBeenCalledWith('[onboarding-email] fallo', 'drip')
        expect(error).toHaveBeenCalledWith(
            '[onboarding-emails] drip',
            expect.objectContaining({ coachId: PARAMS.coachId, scheduled: 0, failed: 4 })
        )
    })

    it('serie OK → UNA línea de resumen en warn y ningún error', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        await sendFreeCoachOnboardingEmails(PARAMS)

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith(
            '[onboarding-emails] drip',
            expect.objectContaining({ coachId: PARAMS.coachId, scheduled: 4, failed: 0 })
        )
        expect(error).not.toHaveBeenCalled()
    })

    // El bug real: en Vercel la función se congela al devolver el redirect. Si el helper no espera,
    // los dos POST a Resend mueren con la invocación (19-08: 2 de 5 bienvenidas perdidas).
    it('NO resuelve hasta que ambas promesas se asientan', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const welcome = deferred<{ ok: true }>()
        const drip = deferred<typeof OK_SUMMARY>()
        sendTransactionalEmailMock.mockReturnValue(welcome.promise)
        scheduleFreeCoachDripSequenceMock.mockReturnValue(drip.promise)

        let settled = false
        const pending = sendFreeCoachOnboardingEmails(PARAMS).then(() => {
            settled = true
        })

        await flush()
        expect(settled).toBe(false)

        welcome.resolve({ ok: true })
        await flush()
        expect(settled).toBe(false) // el drip todavía está en vuelo

        drip.resolve(OK_SUMMARY)
        await pending
        expect(settled).toBe(true)
    })
})
