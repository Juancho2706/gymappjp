import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

/**
 * Pantalla de vuelta del checkout MercadoPago (`/coach/subscription/processing`).
 *
 * Lo que este test pinnea es el retiro de Starter (docs/specs/retiro-starter-y-enterprise, S2.7,
 * D2=A): cuando la URL vuelve SIN `?tier` la pantalla ya no inventa un plan.
 *
 *  - Sin tier y con `preapproval_id`: NO se pinta el chip de plan (antes decía «Starter · Mensual»
 *    a un coach que estaba pagando Pro/Elite) y no se toca `create-preference` — el aterrizaje
 *    sigue confirmando el pago contra `confirm-subscription`, que es lo suyo.
 *  - Sin tier y con `from=register` (hay que INICIAR el cobro): no hay POST con un tier inventado
 *    ni `checkout_started` (un funnel con tier falso miente peor que uno sin evento). Se pinta el
 *    copy de `resolveCheckoutError` con la salida a `/pricing`, que la decide la PÁGINA porque
 *    `checkout-errors.ts` es puro y no conoce rutas.
 *
 * `vitest.setup.ts` mockea `next/navigation` para todo el repo con un `useSearchParams` mudo; acá
 * se re-mockea con una query controlable por caso (mismo patrón que `DomainOffBanner.test.tsx`).
 */

const { searchParams } = vi.hoisted(() => ({
    searchParams: { current: new URLSearchParams() },
}))

vi.mock('next/navigation', () => ({
    useSearchParams: () => searchParams.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    usePathname: () => '/coach/subscription/processing',
}))

const { captureCheckoutStarted, captureCheckoutFailed, captureCheckoutConfirmed, captureGatewayOpened } =
    vi.hoisted(() => ({
        captureCheckoutStarted: vi.fn(),
        captureCheckoutFailed: vi.fn(),
        captureCheckoutConfirmed: vi.fn(),
        captureGatewayOpened: vi.fn(),
    }))

vi.mock('@/lib/posthog/events', () => ({
    useCaptureCheckoutStarted: () => captureCheckoutStarted,
    useCaptureCheckoutFailed: () => captureCheckoutFailed,
    useCaptureCheckoutConfirmed: () => captureCheckoutConfirmed,
    useCaptureCheckoutGatewayOpened: () => captureGatewayOpened,
}))

import SubscriptionProcessingPage from './page'

function setQuery(query: string) {
    searchParams.current = new URLSearchParams(query)
}

/** URLs que el componente pidió, en orden. Sirve para afirmar que NUNCA se llamó a un endpoint. */
function requestedUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
    return fetchMock.mock.calls.map((call) => String(call[0]))
}

describe('processing — vuelta del checkout sin ?tier (retiro de Starter, D2=A)', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        setQuery('')
        captureCheckoutStarted.mockClear()
        captureCheckoutFailed.mockClear()
        captureCheckoutConfirmed.mockClear()
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            // El confirm devuelve un estado NO paid-like: la pantalla se queda pooleando.
            text: async () => JSON.stringify({ subscriptionStatus: 'pending' }),
        })
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('MP sin ?tier + preapproval pendiente: sin chip de plan y sin POST a create-preference', async () => {
        setQuery('preapproval_id=2c938084-abc')
        render(<SubscriptionProcessingPage />)

        await waitFor(() => {
            expect(requestedUrls(fetchMock).some((u) => u.includes('confirm-subscription'))).toBe(true)
        })

        // El chip es «<plan> · <ciclo>»: sin tier no se pinta ninguno de los dos.
        expect(screen.queryByText(/·/)).toBeNull()
        expect(screen.queryByText(/Starter/i)).toBeNull()
        expect(requestedUrls(fetchMock).some((u) => u.includes('create-preference'))).toBe(false)
    })

    it('from=register sin tier: copy de error con salida a /pricing, sin POST ni checkout_started', async () => {
        setQuery('from=register')
        render(<SubscriptionProcessingPage />)

        const salida = await screen.findByRole('link', { name: 'Elegir mi plan' })
        expect(salida).toHaveAttribute('href', '/pricing')
        expect(screen.getByText('No pudimos saber qué plan estabas contratando.')).toBeInTheDocument()

        expect(requestedUrls(fetchMock).some((u) => u.includes('create-preference'))).toBe(false)
        expect(captureCheckoutStarted).not.toHaveBeenCalled()
        expect(captureCheckoutFailed).not.toHaveBeenCalled()
    })
})
