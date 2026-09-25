import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

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

describe('processing — alta paga: cotiza al cargar y crea el checkout recién al elegir medio (QA 24-09)', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    /** Body JSON de la llamada N a create-preference. */
    function preferenceBody(n: number): Record<string, unknown> {
        const calls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('create-preference'))
        return JSON.parse(String((calls[n]?.[1] as RequestInit | undefined)?.body ?? '{}'))
    }

    beforeEach(() => {
        setQuery('from=register&tier=pro&cycle=monthly')
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    checkoutUrl: 'https://pasarela.test/checkout',
                    amountClp: 29990,
                    tier: 'pro',
                    billingCycle: 'monthly',
                }),
        })
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('al cargar solo cotiza: no se crea un checkout en la pasarela para mostrar el precio', async () => {
        render(<SubscriptionProcessingPage />)

        await screen.findByRole('button', { name: /Continuar a MercadoPago/ })
        expect(requestedUrls(fetchMock).filter((u) => u.includes('create-preference'))).toHaveLength(1)
        expect(preferenceBody(0)).toMatchObject({ tier: 'pro', billingCycle: 'monthly', quoteOnly: true })
        expect(screen.getByText('$29.990')).toBeInTheDocument()
    })

    it('el checkout de MP se crea al apretar el botón, y la página que revive del bfcache devuelve la card', async () => {
        render(<SubscriptionProcessingPage />)

        fireEvent.click(await screen.findByRole('button', { name: /Continuar a MercadoPago/ }))
        expect(await screen.findByText('Redirigiendo a Mercado Pago...')).toBeInTheDocument()
        expect(preferenceBody(1)).toMatchObject({ tier: 'pro', gateway: 'mercadopago' })
        expect(preferenceBody(1)).not.toHaveProperty('quoteOnly')

        // El navegador restaura la página desde el bfcache al volver con «atrás».
        const pageshow = new Event('pageshow') as PageTransitionEvent
        Object.defineProperty(pageshow, 'persisted', { value: true })
        act(() => {
            window.dispatchEvent(pageshow)
        })

        expect(await screen.findByRole('button', { name: /Continuar a MercadoPago/ })).toBeEnabled()
    })
})

describe('processing — una sola salida según el caso (QA 24-09)', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ subscriptionStatus: 'pending' }),
            })
        )
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('alta desde el registro: vuelve al panel (el coach Free no tiene nada que reactivar)', async () => {
        setQuery('from=register')
        render(<SubscriptionProcessingPage />)

        const salida = await screen.findByRole('link', { name: 'Volver al panel — tu cuenta queda activa igual' })
        expect(salida).toHaveAttribute('href', '/coach/dashboard')
        expect(screen.queryByText('Ir a reactivación')).toBeNull()
    })

    it('vuelta de un pago: «Volver a mi suscripción» (el gate lleva a reactivación solo al bloqueado)', async () => {
        setQuery('preapproval_id=2c938084-abc&tier=pro&cycle=monthly')
        render(<SubscriptionProcessingPage />)

        const salidas = await screen.findAllByRole('link', { name: 'Volver a mi suscripción' })
        expect(salidas).toHaveLength(1)
        expect(salidas[0]).toHaveAttribute('href', '/coach/subscription')
        expect(screen.queryByText('Ir a reactivación')).toBeNull()
    })
})
