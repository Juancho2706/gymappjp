import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

/**
 * Vuelta de Webpay/Flow (`/coach/subscription/flow-processing`) cuando la tarjeta NO quedó inscrita.
 *
 * Caso Fraga gym (28-09): la coach volvió de Webpay sin tarjeta (Flow `customer/get` sin
 * `registerDate`), la pantalla giró «Confirmando tu tarjeta con Webpay...» y se fue a los 49 s sin
 * saber qué pasó. Lo que este test pinnea:
 *   1. los primeros segundos siguen siendo «Procesando» (una tarjeta recién inscrita no se acusa);
 *   2. pasado el margen, se explica que no hubo cobro, cómo pasar el «Es mi correo» y se ofrece
 *      volver al selector de medio;
 *   3. el poll NO se corta: si la tarjeta aparece tarde, el alta sigue como siempre;
 *   4. `creating:true` (tarjeta inscrita, sub en creación) jamás se acusa como tarjeta faltante.
 */

const { searchParams } = vi.hoisted(() => ({
    searchParams: { current: new URLSearchParams('tier=elite&cycle=monthly') },
}))

vi.mock('next/navigation', () => ({
    useSearchParams: () => searchParams.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    usePathname: () => '/coach/subscription/flow-processing',
}))

const { captureCheckoutConfirmed } = vi.hoisted(() => ({ captureCheckoutConfirmed: vi.fn() }))

vi.mock('@/lib/posthog/events', () => ({
    useCaptureCheckoutConfirmed: () => captureCheckoutConfirmed,
}))

import FlowProcessingPage from './page'

function jsonResponse(body: Record<string, unknown>) {
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }
}

/** Avanza el reloj falso y deja correr los ticks async del poll. */
async function advance(ms: number) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

describe('flow-processing — vuelta de Webpay sin tarjeta inscrita', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        vi.useFakeTimers()
        captureCheckoutConfirmed.mockClear()
        fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, enrolled: false }))
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('los primeros segundos sigue «Procesando», sin acusar la tarjeta', async () => {
        render(<FlowProcessingPage />)
        // Último tick antes del margen de 30 s (los ticks van cada 4 s).
        await advance(26_000)

        expect(screen.getByText('Procesando tu suscripción')).toBeTruthy()
        expect(screen.queryByText('Tu tarjeta no quedó inscrita')).toBeNull()
    })

    it('pasado el margen explica que no hubo cobro y ofrece volver a elegir medio', async () => {
        render(<FlowProcessingPage />)
        await advance(34_000)

        expect(screen.getByText('Tu tarjeta no quedó inscrita')).toBeTruthy()
        expect(screen.queryByText('Procesando tu suscripción')).toBeNull()
        expect(screen.getByText(/No se hizo ningún cobro/)).toBeTruthy()
        expect(screen.getByText(/marca «Es mi correo»/)).toBeTruthy()
        // Decisión del owner (28-09): no empujar a Mercado Pago desde acá.
        expect(screen.queryByText(/Mercado Pago/)).toBeNull()

        const back = screen.getByRole('link', { name: 'Volver a elegir cómo pagar' })
        expect(back.getAttribute('href')).toBe('/coach/subscription')
        expect(screen.getByRole('link', { name: 'Escribir a soporte' }).getAttribute('href')).toContain('mailto:')
        // «Ir a reactivación» confundía a una coach free en su primer pago.
        expect(screen.queryByRole('link', { name: 'Ir a reactivación' })).toBeNull()
    })

    it('el poll sigue: si la tarjeta aparece tarde, el alta termina como siempre', async () => {
        render(<FlowProcessingPage />)
        await advance(34_000)
        expect(screen.getByText('Tu tarjeta no quedó inscrita')).toBeTruthy()

        const callsWithHint = fetchMock.mock.calls.length
        fetchMock.mockResolvedValue(jsonResponse({ ok: true, status: 'active' }))
        await advance(4_000)

        expect(fetchMock.mock.calls.length).toBeGreaterThan(callsWithHint)
        expect(captureCheckoutConfirmed).toHaveBeenCalledTimes(1)
        expect(captureCheckoutConfirmed).toHaveBeenCalledWith(
            expect.objectContaining({ tier: 'elite', gateway: 'flow', result: 'active' })
        )
    })

    it('tarjeta inscrita con la sub en creación (creating:true) no se acusa como faltante', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ ok: true, enrolled: true, creating: true }))
        render(<FlowProcessingPage />)
        await advance(34_000)

        expect(screen.getByText('Procesando tu suscripción')).toBeTruthy()
        expect(screen.queryByText('Tu tarjeta no quedó inscrita')).toBeNull()
    })
})
