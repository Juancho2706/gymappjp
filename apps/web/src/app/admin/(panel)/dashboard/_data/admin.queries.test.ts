import { beforeEach, describe, expect, it, vi } from 'vitest'

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

const { createServiceRoleClientMock, rpcMock, findAdminCoachesFallbackMock } = vi.hoisted(() => ({
    createServiceRoleClientMock: vi.fn(),
    rpcMock: vi.fn(),
    findAdminCoachesFallbackMock: vi.fn(),
}))

vi.mock('next/cache', () => ({ unstable_noStore: vi.fn() }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('@/infrastructure/db', () => ({
    countActiveAdminCoaches: vi.fn(),
    countBetaAdminInvites: vi.fn(),
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

/** Las 22 claves que el panel consume de cada coach. Cambiar esta lista es cambiar el contrato. */
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
