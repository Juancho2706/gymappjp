import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `getAllCoachesPaginated` llama la RPC `get_admin_coaches_paginated` a través de
 * `(admin.rpc as any)`: ese `as any` deja el mapeo fila→`CoachListItem` SIN red de typecheck.
 * Si la RPC cambia un nombre de columna, TypeScript no dice nada y el panel pinta `NaN`/`undefined`
 * en silencio. Estos tests pinnean el contrato de columnas a mano (W4 de «Vive tu app» directo).
 *
 * Contexto 26-08: la RPC dejó de contar al alumno DEMO en `client_count`/`active_client_count`
 * (migración `20260826010542`) y sumó `demo_client_count` (`20260826011239`) y el sort por
 * actividad sobre `coach_last_active_at` (`20260826022428`). Las dos columnas nuevas entran acá.
 */

const {
    createServiceRoleClientMock,
    rpcMock,
    findAdminCoachesFallbackMock,
    findAdminCoachBillingRowsMock,
    findActiveCouponRedemptionsByIdsMock,
} = vi.hoisted(() => ({
    createServiceRoleClientMock: vi.fn(),
    rpcMock: vi.fn(),
    findAdminCoachesFallbackMock: vi.fn(),
    findAdminCoachBillingRowsMock: vi.fn(),
    findActiveCouponRedemptionsByIdsMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('@/infrastructure/db', () => ({
    countActiveAdminCoaches: vi.fn(),
    countBetaAdminInvites: vi.fn(),
    findActiveCouponRedemptionsByIds: findActiveCouponRedemptionsByIdsMock,
    findAdminCoachBillingRows: findAdminCoachBillingRowsMock,
    findAdminAuditLogs: vi.fn(),
    findAdminBasicCoaches: vi.fn(),
    findAdminCoachesFallback: findAdminCoachesFallbackMock,
    findAdminClientsForDashboard: vi.fn(),
    findExpiringSoonAdminCoaches: vi.fn(),
    findPaidAdminCoachTiers: vi.fn(),
    findPendingPaymentAdminCoaches: vi.fn(),
    findRecentAdminCoachSignups: vi.fn(),
}))

import { getAllCoachesPaginated } from './admin.queries'

/** Fila tal como la devuelve HOY la RPC (bigints ya serializados a number por PostgREST). */
function rpcRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'coach-1',
        full_name: 'Juan Pérez',
        brand_name: 'JPL',
        slug: 'jpl',
        subscription_tier: 'free',
        subscription_status: 'active',
        billing_cycle: 'monthly',
        payment_provider: 'none',
        max_clients: 1,
        current_period_end: null,
        trial_ends_at: null,
        created_at: '2026-08-01T00:00:00.000Z',
        client_count: 1,
        active_client_count: 1,
        demo_client_count: 1,
        days_until_expiry: null,
        utilization_pct: 100,
        last_activity_at: '2026-08-20T00:00:00.000Z',
        coach_last_active_at: '2026-08-24T00:00:00.000Z',
        auth_email: 'jpl@example.com',
        total_count: 1,
        ...overrides,
    }
}

/** Las 23 claves que el panel consume de cada coach. Cambiar esta lista es cambiar el contrato. */
const COACH_LIST_ITEM_KEYS = [
    'id',
    'full_name',
    'brand_name',
    'slug',
    'subscription_tier',
    'subscription_status',
    'billing_cycle',
    'payment_provider',
    'max_clients',
    'current_period_end',
    'trial_ends_at',
    'created_at',
    'client_count',
    'active_client_count',
    'demo_client_count',
    'expires_at',
    'days_until_expiry',
    'utilization_pct',
    'last_activity_at',
    'coach_last_active_at',
    'auth_email',
    'monthly_revenue',
    'lifecycle_stage',
]

beforeEach(() => {
    vi.clearAllMocks()
    createServiceRoleClientMock.mockReturnValue({ rpc: rpcMock })
    rpcMock.mockResolvedValue({ data: [rpcRow()], error: null })
    findAdminCoachBillingRowsMock.mockResolvedValue([])
    findActiveCouponRedemptionsByIdsMock.mockResolvedValue([])
})

describe('getAllCoachesPaginated — contrato de columnas de get_admin_coaches_paginated', () => {
    it('llama la RPC con los 8 parámetros y sus defaults', async () => {
        await getAllCoachesPaginated({ page: 3, pageSize: 20 })

        expect(rpcMock).toHaveBeenCalledTimes(1)
        expect(rpcMock).toHaveBeenCalledWith('get_admin_coaches_paginated', {
            p_search: null,
            p_status: null,
            p_tier: null,
            p_beta: null,
            p_sort: 'created_at',
            p_dir: 'desc',
            p_limit: 20,
            p_offset: 40,
        })
    })

    it('propaga búsqueda, filtros y el sort por actividad del coach', async () => {
        await getAllCoachesPaginated({
            search: 'jpl',
            status: 'active',
            tier: 'free',
            beta: false,
            sort: 'activity',
            dir: 'asc',
        })

        expect(rpcMock.mock.calls[0][1]).toMatchObject({
            p_search: 'jpl',
            p_status: 'active',
            p_tier: 'free',
            p_beta: false,
            p_sort: 'activity',
            p_dir: 'asc',
        })
    })

    it('mapea la fila completa: ni una columna de la RPC se pierde ni se inventa', async () => {
        const { coaches, total } = await getAllCoachesPaginated({})

        expect(total).toBe(1)
        expect(coaches).toHaveLength(1)
        expect(Object.keys(coaches[0]).sort()).toEqual([...COACH_LIST_ITEM_KEYS].sort())
        expect(coaches[0]).toEqual({
            id: 'coach-1',
            full_name: 'Juan Pérez',
            brand_name: 'JPL',
            slug: 'jpl',
            subscription_tier: 'free',
            subscription_status: 'active',
            billing_cycle: 'monthly',
            payment_provider: 'none',
            max_clients: 1,
            current_period_end: null,
            trial_ends_at: null,
            created_at: '2026-08-01T00:00:00.000Z',
            client_count: 1,
            active_client_count: 1,
            demo_client_count: 1,
            expires_at: null,
            days_until_expiry: null,
            utilization_pct: 100,
            last_activity_at: '2026-08-20T00:00:00.000Z',
            coach_last_active_at: '2026-08-24T00:00:00.000Z',
            auth_email: 'jpl@example.com',
            monthly_revenue: 0,
            lifecycle_stage: 'active_healthy',
        })
    })

    it('demo_client_count y coach_last_active_at viajan tal cual (columnas de 26-08)', async () => {
        rpcMock.mockResolvedValue({
            data: [rpcRow({ client_count: 0, active_client_count: 0, demo_client_count: 1, utilization_pct: 0 })],
            error: null,
        })

        const { coaches } = await getAllCoachesPaginated({})

        // Free recién abierto: SOLO tiene el demo ⇒ cupo 0/1, pero el admin ve que el demo existe.
        expect(coaches[0].client_count).toBe(0)
        expect(coaches[0].active_client_count).toBe(0)
        expect(coaches[0].demo_client_count).toBe(1)
        expect(coaches[0].coach_last_active_at).toBe('2026-08-24T00:00:00.000Z')
    })

    it('RPC vieja (sin las columnas nuevas) degrada a 0/null en vez de NaN/undefined', async () => {
        const row = rpcRow()
        delete (row as Record<string, unknown>).demo_client_count
        delete (row as Record<string, unknown>).coach_last_active_at
        rpcMock.mockResolvedValue({ data: [row], error: null })

        const { coaches } = await getAllCoachesPaginated({})

        expect(coaches[0].demo_client_count).toBe(0)
        expect(Number.isNaN(coaches[0].demo_client_count)).toBe(false)
        expect(coaches[0].coach_last_active_at).toBeNull()
    })

    it('los bigint serializados como string se normalizan a número', async () => {
        rpcMock.mockResolvedValue({
            data: [rpcRow({ client_count: '7', active_client_count: '5', demo_client_count: '1', utilization_pct: '70.0' })],
            error: null,
        })

        const { coaches } = await getAllCoachesPaginated({})

        expect(coaches[0].client_count).toBe(7)
        expect(coaches[0].active_client_count).toBe(5)
        expect(coaches[0].demo_client_count).toBe(1)
        expect(coaches[0].utilization_pct).toBe(70)
    })

    it('total sale de total_count de la primera fila (no del largo de la página)', async () => {
        rpcMock.mockResolvedValue({
            data: [rpcRow({ id: 'a', total_count: 137 }), rpcRow({ id: 'b', total_count: 137 })],
            error: null,
        })

        const { coaches, total } = await getAllCoachesPaginated({ pageSize: 2 })

        expect(coaches).toHaveLength(2)
        expect(total).toBe(137)
    })

    it('con filtros que la RPC no soporta trae el universo y pagina en memoria', async () => {
        rpcMock.mockResolvedValue({
            data: [
                rpcRow({ id: 'mp', payment_provider: 'mercadopago', total_count: 2 }),
                rpcRow({ id: 'flow', payment_provider: 'flow', total_count: 2 }),
            ],
            error: null,
        })

        const { coaches, total } = await getAllCoachesPaginated({ provider: 'flow', pageSize: 50 })

        expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_limit: 1000, p_offset: 0 })
        expect(coaches.map((c) => c.id)).toEqual(['flow'])
        // `total` es el del universo filtrado, no el `total_count` crudo (ROTO-2/ROTO-5).
        expect(total).toBe(1)
    })

    it('RPC caída → fallback directo a coaches, con las columnas nuevas neutras', async () => {
        rpcMock.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })
        findAdminCoachesFallbackMock.mockResolvedValue([
            {
                id: 'coach-9',
                full_name: 'Sin RPC',
                brand_name: null,
                slug: 'sin-rpc',
                subscription_tier: 'pro',
                subscription_status: 'active',
                billing_cycle: 'monthly',
                payment_provider: 'mercadopago',
                max_clients: 25,
                current_period_end: null,
                trial_ends_at: null,
                created_at: '2026-08-01T00:00:00.000Z',
            },
        ])

        const { coaches, total } = await getAllCoachesPaginated({})

        expect(total).toBe(1)
        expect(Object.keys(coaches[0]).sort()).toEqual([...COACH_LIST_ITEM_KEYS].sort())
        expect(coaches[0].client_count).toBe(0)
        expect(coaches[0].active_client_count).toBe(0)
        expect(coaches[0].demo_client_count).toBe(0)
        expect(coaches[0].coach_last_active_at).toBeNull()
    })

    it('RPC caída y fallback vacío → lista vacía, sin explotar', async () => {
        rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
        findAdminCoachesFallbackMock.mockResolvedValue(null)

        await expect(getAllCoachesPaginated({})).resolves.toEqual({ coaches: [], total: 0 })
    })
})

describe('getAllCoachesPaginated — MRR neto y vencimiento real (30-09)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-09-30T21:00:00Z')) // 18:00 de Chile
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    const proRow = (overrides: Record<string, unknown>) =>
        rpcRow({ subscription_tier: 'pro', subscription_status: 'active', max_clients: 30, ...overrides })

    it('MRR descuenta el cupón vivo (MDR 50 % ⇒ $14.995) y solo cuenta a quien paga de verdad', async () => {
        rpcMock.mockResolvedValue({
            data: [
                proRow({ id: 'mdr', payment_provider: 'flow' }),
                proRow({ id: 'movens', payment_provider: 'flow' }),
                proRow({ id: 'demo', payment_provider: 'mercadopago' }),
                proRow({ id: 'olympus', payment_provider: 'flow', subscription_status: 'canceled' }),
            ],
            error: null,
        })
        findAdminCoachBillingRowsMock.mockResolvedValue([
            { id: 'mdr', subscription_mp_id: null, subscription_provider_external_id: 'sus_qd', active_coupon_redemption_id: 'red-1' },
            { id: 'movens', subscription_mp_id: null, subscription_provider_external_id: 'sus_e9', active_coupon_redemption_id: null },
            // Cuenta demo: tier pro + provider MP pero SIN suscripción en el gateway.
            { id: 'demo', subscription_mp_id: null, subscription_provider_external_id: null, active_coupon_redemption_id: null },
        ])
        findActiveCouponRedemptionsByIdsMock.mockResolvedValue([
            { id: 'red-1', discount_value_snapshot: { code: 'X', type: 'percent', value: 50, target: 'total' }, applied_cycles_remaining: null },
        ])

        const { coaches } = await getAllCoachesPaginated({})
        const mrr = Object.fromEntries(coaches.map((c) => [c.id, c.monthly_revenue]))

        expect(mrr).toEqual({ mdr: 14995, movens: 29990, demo: 0, olympus: 0 })
        // Solo viajan a la DB los activos con gateway (el cancelado ni se consulta).
        expect(findAdminCoachBillingRowsMock.mock.calls[0][1]).toEqual(['mdr', 'movens', 'demo'])
        expect(findActiveCouponRedemptionsByIdsMock.mock.calls[0][1]).toEqual(['red-1'])
    })

    it('Flow: el día guardado como UTC se lee como cobro a las 00:00 de Chile del día siguiente', async () => {
        rpcMock.mockResolvedValue({
            data: [
                proRow({
                    id: 'movens',
                    payment_provider: 'flow',
                    current_period_end: '2026-10-01T00:00:00+00:00',
                    days_until_expiry: 0, // lo que decía la RPC («0d»)
                }),
            ],
            error: null,
        })

        const { coaches } = await getAllCoachesPaginated({})

        expect(coaches[0].current_period_end).toBe('2026-10-01T00:00:00+00:00')
        expect(coaches[0].expires_at).toBe('2026-10-02T03:00:00.000Z')
        expect(coaches[0].days_until_expiry).toBe(1)
    })

    it('MercadoPago conserva su instante; trial sin período usa trial_ends_at', async () => {
        rpcMock.mockResolvedValue({
            data: [
                proRow({ id: 'mp', payment_provider: 'mercadopago', current_period_end: '2026-10-26T15:14:07+00:00' }),
                proRow({ id: 'trial', subscription_status: 'trialing', trial_ends_at: '2026-10-03T12:00:00+00:00' }),
            ],
            error: null,
        })

        const { coaches } = await getAllCoachesPaginated({})

        expect(coaches[0].expires_at).toBe('2026-10-26T15:14:07.000Z')
        expect(coaches[0].days_until_expiry).toBe(25)
        expect(coaches[1].expires_at).toBe('2026-10-03T12:00:00.000Z')
        expect(coaches[1].lifecycle_stage).toBe('new_trial')
    })
})
