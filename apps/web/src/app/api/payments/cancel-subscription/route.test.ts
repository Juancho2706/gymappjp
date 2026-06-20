import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── FIX-2: cancel-subscription gains rateLimitPayment(user.id) + jsonRateLimited right after the
// auth check (audit medium). Mirrors the addons/route.test.ts mock pattern. The service-role admin
// is a chainable query builder: select→eq→maybeSingle returns the coach; update→eq returns {error};
// insert resolves; the coach_addons select→eq→eq returns no live add-ons by default.
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

let coachRow: Record<string, unknown> | null
// coach_addons que devuelve el SELECT de filas vivas self_service (P2). Default: ninguna.
let liveSelfServiceAddons: Array<Record<string, unknown>> = []
const cancelAtProviderCalls: string[] = []
// Update patches por tabla (P0-3 clear del superseded + P2 schedule de add-ons).
const coachUpdatePatches: Array<Record<string, unknown>> = []
const addonUpdates: Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = []

// A terminal builder node that both AWAITS to a PostgREST-like { data, error } and exposes
// chainable .eq()/.is()/.maybeSingle() so single-eq (coaches.update), double/triple-eq
// (coach_addons.update/select) and .is('expires_at', null) shapes all resolve. Captura los filtros
// .eq()/.is() encadenados para que los tests puedan aseverar el scoping (source='self_service', etc.).
function terminal(
    result: { data?: unknown; error: unknown },
    onFilter?: (col: string, value: unknown) => void
) {
    const node: Record<string, unknown> = {
        eq: vi.fn((col: string, value: unknown) => {
            onFilter?.(col, value)
            return terminal(result, onFilter)
        }),
        is: vi.fn((col: string, value: unknown) => {
            onFilter?.(col, value)
            return terminal(result, onFilter)
        }),
        maybeSingle: vi.fn(async () => result),
        then: (resolve: (v: unknown) => unknown) => resolve(result),
    }
    return node
}

function makeAdmin() {
    return {
        from: vi.fn((table: string) => ({
            select: vi.fn(() =>
                table === 'coaches'
                    ? { eq: vi.fn(() => terminal({ data: coachRow, error: null })) } // .eq('id').maybeSingle()
                    : { eq: vi.fn(() => terminal({ data: liveSelfServiceAddons, error: null })) } // coach_addons live
            ),
            update: vi.fn((patch: Record<string, unknown>) => {
                if (table === 'coaches') coachUpdatePatches.push(patch)
                if (table === 'coach_addons') {
                    const filters: Array<[string, unknown]> = []
                    addonUpdates.push({ patch, filters })
                    return terminal({ data: null, error: null }, (col, value) => filters.push([col, value]))
                }
                return terminal({ data: null, error: null })
            }),
            insert: vi.fn(async () => ({ error: null })),
            // clearUpgradeInFlight (P0-4) hace subscription_events.delete().eq() — sin este nodo el
            // builder no expone .delete y la ruta loguea un console.error best-effort cada corrida
            // (ruido cosmético, el test igual da 200). El terminal resuelve a {data:[],error:null}.
            delete: vi.fn(() => terminal({ data: [], error: null })),
        })),
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

vi.mock('@/services/auth/workspace-permissions.service', async (orig) => {
    return await orig<typeof import('@/services/auth/workspace-permissions.service')>()
})

const rateLimitPayment = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rate-limit', () => ({
    rateLimitPayment: (...a: unknown[]) => rateLimitPayment(...a),
    jsonRateLimited: (retryAfter: number) =>
        new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }),
}))

const cancelCheckoutAtProvider = vi.fn(async (id: string) => {
    cancelAtProviderCalls.push(id)
})
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(a[0] as string),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

import { POST } from './route'

function makeRequest(body: unknown = {}): Request {
    return new Request('http://localhost/api/payments/cancel-subscription', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

beforeEach(() => {
    vi.clearAllMocks()
    cancelAtProviderCalls.length = 0
    coachUpdatePatches.length = 0
    addonUpdates.length = 0
    liveSelfServiceAddons = []
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    coachRow = {
        id: 'coach-1',
        subscription_mp_id: 'preapproval-1',
        payment_provider: 'mercadopago',
        current_period_end: '2026-07-01T00:00:00.000Z',
        superseded_mp_preapproval_id: null,
    }
})

describe('POST /api/payments/cancel-subscription — FIX-2 rate limit', () => {
    it('429 cuando el rate limit dispara — ANTES de cancelar en el provider', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ reason: 'me voy' }))
        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('30')
        // No se llegó a tocar el provider de pagos.
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
        // Se rate-limitea por user.id (de la sesión).
        expect(rateLimitPayment).toHaveBeenCalledWith('coach-1')
    })

    it('200 cuando el rate limit pasa (la cancelación procede)', async () => {
        const res = await POST(makeRequest({ reason: 'me voy' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-1')
    })

    it('401 sin sesión: ni siquiera consulta el rate limit', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
        expect(rateLimitPayment).not.toHaveBeenCalled()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P0-3 — CANCEL TAMBIÉN EL PREAPPROVAL SUPERSEDED EN VUELO. Si el coach cancela mientras un cambio
// de plan está pendiente (un nuevo preapproval reemplazó al viejo pero el viejo quedó como backstop
// en superseded_mp_preapproval_id), cancelar solo subscription_mp_id dejaría al VIEJO cobrando. La
// ruta cancela AMBOS y limpia el marcador superseded.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/cancel-subscription — P0-3 cancela el superseded también', () => {
    it('con superseded en vuelo: cancela el actual Y el superseded, y limpia el marcador', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        const res = await POST(makeRequest({ reason: 'cambio de idea' }))
        expect(res.status).toBe(200)
        // Cancela el preapproval vigente Y el superseded (ambos para que ninguno siga cobrando).
        expect(cancelAtProviderCalls).toContain('preapproval-1')
        expect(cancelAtProviderCalls).toContain('preapproval-OLD')
        // Limpia el marcador superseded (update con superseded_mp_preapproval_id: null).
        const clear = coachUpdatePatches.find(
            (p) => p.superseded_mp_preapproval_id === null && Object.keys(p).length === 1
        )
        expect(clear).toBeTruthy()
    })

    it('sin superseded (null): solo cancela el vigente (no hay nada que limpiar)', async () => {
        coachRow!.superseded_mp_preapproval_id = null
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect(cancelAtProviderCalls).toEqual(['preapproval-1'])
        // No hay update de solo-superseded.
        const clear = coachUpdatePatches.find(
            (p) => 'superseded_mp_preapproval_id' in p && Object.keys(p).length === 1
        )
        expect(clear).toBeFalsy()
    })

    it('un fallo al cancelar el superseded NO tumba la cancelación (best-effort, loguea)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        // El primer cancel (vigente) OK; el segundo (superseded) falla con un error genérico.
        cancelCheckoutAtProvider.mockImplementation(async (id: string) => {
            cancelAtProviderCalls.push(id)
            if (id === 'preapproval-OLD') throw new Error('MercadoPago PUT failed (500)')
        })
        const res = await POST(makeRequest({}))
        // La cancelación de la suscripción igual responde 200.
        expect(res.status).toBe(200)
        expect(cancelAtProviderCalls).toContain('preapproval-OLD')
    })

    it('superseded === vigente (no es un upgrade real) → no lo cancela dos veces', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-1'
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        // Solo un cancel del vigente; el guard superseded !== checkoutId evita el doble cancel.
        expect(cancelAtProviderCalls).toEqual(['preapproval-1'])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P2 — al cancelar: (1) add-ons ACTIVE self_service → cancel_pending con expires_at = corte;
// (2) add-ons YA en cancel_pending con expires_at NULL → fijarles expires_at = corte (sin esto
// quedan ON para siempre porque el cron de expiry filtra por expires_at no-null); (3) NUNCA barrer
// los admin_grant (cortesía del CEO) — el sweep filtra por source='self_service'.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/cancel-subscription — P2 schedule de add-ons (source=self_service)', () => {
    it('add-on ACTIVE self_service → cancel_pending con expires_at = current_period_end, scoping self_service', async () => {
        liveSelfServiceAddons = [{ id: 'addon-1' }] // hay 1 add-on activo self_service
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        // Update (1): status cancel_pending + expires_at = corte.
        const sched = addonUpdates.find((u) => u.patch.status === 'cancel_pending')
        expect(sched).toBeTruthy()
        expect(sched!.patch.expires_at).toBe('2026-07-01T00:00:00.000Z') // current_period_end
        // El scoping del sweep filtra por source='self_service' (jamás los admin_grant).
        expect(sched!.filters).toContainEqual(['source', 'self_service'])
        expect(sched!.filters).toContainEqual(['status', 'active'])
    })

    it('P2 — add-ons en cancel_pending con expires_at NULL → se les fija expires_at = corte (filtrado self_service)', async () => {
        // Sin add-ons ACTIVE (liveSelfServiceAddons vacío): el segundo update (expires_at backfill)
        // corre igual, filtrando status=cancel_pending + source=self_service + expires_at IS NULL.
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const backfill = addonUpdates.find(
            (u) =>
                u.patch.expires_at === '2026-07-01T00:00:00.000Z' &&
                Object.keys(u.patch).length === 1
        )
        expect(backfill).toBeTruthy()
        // Scoping: cancel_pending + self_service + expires_at IS NULL.
        expect(backfill!.filters).toContainEqual(['status', 'cancel_pending'])
        expect(backfill!.filters).toContainEqual(['source', 'self_service'])
        expect(backfill!.filters).toContainEqual(['expires_at', null])
    })

    it('el SELECT de filas vivas filtra por source=self_service (no barre cortesías admin_grant)', async () => {
        // Verificamos vía los filtros del update (1): nunca toca admin_grant.
        liveSelfServiceAddons = [{ id: 'addon-1' }]
        await POST(makeRequest({}))
        for (const u of addonUpdates) {
            // Ningún update de coach_addons debe scopear a source distinto de self_service.
            const sourceFilter = u.filters.find(([col]) => col === 'source')
            if (sourceFilter) expect(sourceFilter[1]).toBe('self_service')
        }
    })

    it('un fallo en el schedule de add-ons NO tumba la cancelación base (best-effort)', async () => {
        liveSelfServiceAddons = [{ id: 'addon-1' }]
        // El update de coach_addons lanza; la cancelación base (ya hecha arriba) no debe caerse.
        const failingAdmin = makeAdmin()
        const origFrom = failingAdmin.from
        failingAdmin.from = vi.fn((table: string) => {
            const builder = origFrom(table)
            if (table === 'coach_addons') {
                builder.update = vi.fn(() => {
                    throw new Error('coach_addons update failed')
                })
            }
            return builder
        })
        fakeAdmin = failingAdmin
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
    })
})
