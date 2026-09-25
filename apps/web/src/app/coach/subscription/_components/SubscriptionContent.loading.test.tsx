import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

/**
 * QA del owner 24-09: la pantalla de Suscripción «cargaba por partes» — el historial vacío y
 * «Cancelar suscripción» aparecían al instante, el plan y los planes segundos después, y la
 * tarjeta del cupón en otro momento porque pedía subscription-status por su cuenta.
 *
 * Contrato: mientras llega subscription-status se ve UN loader y nada más; al llegar se pinta todo
 * junto, con UNA sola llamada al endpoint (la tarjeta del cupón usa el estado del padre).
 */

// Router ESTABLE como el de Next: el mock global de vitest.setup crea uno nuevo por render, y el
// efecto de carga (deps [router]) se re-dispararía por un artefacto del test.
const { stableRouter } = vi.hoisted(() => ({
    stableRouter: { push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, refresh: () => {} },
}))
vi.mock('next/navigation', () => ({
    useRouter: () => stableRouter,
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/coach/settings',
}))

vi.mock('@/lib/posthog/events', () => ({
    useCaptureCheckoutStarted: () => vi.fn(),
    useCaptureCheckoutFailed: () => vi.fn(),
}))

import { SubscriptionContent } from './SubscriptionContent'

const STATUS_PAYLOAD = {
    coach: {
        id: 'coach-1',
        subscription_tier: 'free',
        subscription_status: 'active',
        max_clients: 1,
        created_at: '2026-09-01T00:00:00.000Z',
        billing_cycle: 'monthly',
        current_period_end: null,
        payment_provider: 'mercadopago',
        subscription_provider: 'mercadopago',
    },
    events: [],
    addons: [],
    billing: { baseClp: 0, addonsClp: 0, totalClp: 0, baseBeforeDiscountClp: 0, discountClp: 0 },
    activeCoupon: null,
    activeClientCount: 0,
    changeCardEnabled: false,
}

describe('SubscriptionContent — carga inicial sin «por partes»', () => {
    let resolveStatus: (value: unknown) => void
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchMock = vi.fn(
            () =>
                new Promise((resolve) => {
                    resolveStatus = resolve
                })
        )
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('mientras carga: solo el loader, ninguna sección suelta', () => {
        render(<SubscriptionContent embedded />)

        expect(screen.getByText('Cargando tu suscripción')).toBeInTheDocument()
        expect(screen.queryByText('Historial de pagos')).toBeNull()
        expect(screen.queryByText('Cancelar suscripción')).toBeNull()
        expect(screen.queryByText('Código de descuento')).toBeNull()
    })

    it('al llegar el estado se pinta todo junto, con una sola llamada al endpoint', async () => {
        render(<SubscriptionContent embedded />)

        await act(async () => {
            resolveStatus({ ok: true, json: async () => STATUS_PAYLOAD })
        })

        expect(await screen.findByText('Historial de pagos')).toBeInTheDocument()
        expect(screen.getByText('Código de descuento')).toBeInTheDocument()
        expect(screen.getByText('Cambiar plan')).toBeInTheDocument()
        expect(screen.queryByText('Cargando tu suscripción')).toBeNull()
        const statusCalls = fetchMock.mock.calls.filter((call) =>
            String(call[0]).includes('/api/payments/subscription-status')
        )
        expect(statusCalls).toHaveLength(1)
    })
})
