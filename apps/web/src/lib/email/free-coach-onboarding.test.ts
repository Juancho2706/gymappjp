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

vi.mock('@/lib/email/send-drip-sequence', () => ({
    scheduleFreeCoachDripSequence: scheduleFreeCoachDripSequenceMock,
}))

vi.mock('@/lib/email/transactional-templates', () => ({
    buildFreeCoachWelcomeEmail: buildFreeCoachWelcomeEmailMock,
}))

import { sendFreeCoachOnboardingEmails } from './free-coach-onboarding'

const PARAMS = {
    email: 'coach@example.com',
    coachName: 'Coach Test',
    brandName: 'Antigravity Pro',
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
        scheduleFreeCoachDripSequenceMock.mockResolvedValue(undefined)
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
        expect(scheduleFreeCoachDripSequenceMock).toHaveBeenCalledWith({
            email: 'coach@example.com',
            coachName: 'Coach Test',
            brandName: 'Antigravity Pro',
        })
    })

    it('si AMBAS patas rechazan resuelve igual (nunca rompe el alta) y loguea 2 warns sin PII', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendTransactionalEmailMock.mockRejectedValue(new Error('resend 500'))
        scheduleFreeCoachDripSequenceMock.mockRejectedValue(new Error('audience 500'))

        await expect(sendFreeCoachOnboardingEmails(PARAMS)).resolves.toBeUndefined()

        expect(warn).toHaveBeenCalledTimes(2)
        expect(warn).toHaveBeenNthCalledWith(1, '[onboarding-email] fallo', 'welcome')
        expect(warn).toHaveBeenNthCalledWith(2, '[onboarding-email] fallo', 'drip')
        // Ningún warn puede llevar email ni nombre: el log vive en Vercel, sin retención acotada.
        const logged = warn.mock.calls.flat().join(' ')
        expect(logged).not.toContain(PARAMS.email)
        expect(logged).not.toContain(PARAMS.coachName)
    })

    // `sendTransactionalEmail` NO rechaza con Resend 4xx/5xx ni sin API key: devuelve `{ ok: false }`.
    // Es el modo de fallo más probable de los dos, así que también tiene que dejar warn.
    it('loguea la bienvenida cuando Resend responde error (resuelve con ok:false, no rechaza)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendTransactionalEmailMock.mockResolvedValue({ ok: false, error: 'Resend 422: domain not verified' })

        await expect(sendFreeCoachOnboardingEmails(PARAMS)).resolves.toBeUndefined()

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledWith('[onboarding-email] fallo', 'welcome')
    })

    // El bug real: en Vercel la función se congela al devolver el redirect. Si el helper no espera,
    // los dos POST a Resend mueren con la invocación (19-08: 2 de 5 bienvenidas perdidas).
    it('NO resuelve hasta que ambas promesas se asientan', async () => {
        const welcome = deferred<{ ok: true }>()
        const drip = deferred()
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

        drip.resolve()
        await pending
        expect(settled).toBe(true)
    })
})
