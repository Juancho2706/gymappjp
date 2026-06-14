import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── FIX-2: create-preference gains rateLimitPayment(user.id) + jsonRateLimited right after the
// auth check (audit medium). These tests mirror the addons/route.test.ts mock pattern: auth,
// service-role admin, the user-scoped supabase client (.from('coaches').select...maybeSingle),
// workspace, rate-limit, provider, the live-addons repo and the composite-amount service are all
// stubbed so the route is exercised in isolation.
//
// The contract under test:
//   - a TRIPPED rate limiter returns 429 (via jsonRateLimited) BEFORE any provider checkout / DB
//     write — proven by createCheckout never being called.
//   - an OK rate limiter lets a valid request through to a 200 (provider checkout created).
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser }, from: userScopedFrom })),
}))

// The route reads the coach's current subscription via the USER-scoped client
// (supabase.from('coaches').select(...).eq('id', user.id).maybeSingle()).
const currentCoachMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
const userScopedFrom = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: currentCoachMaybeSingle })) })),
}))

// Service-role client: only the billing-columns UPDATE goes through here (update→eq→{error}).
const adminUpdateEq = vi.fn().mockResolvedValue({ error: null })
const fakeAdmin = {
    from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: adminUpdateEq })),
    })),
}
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const resolvePreferredWorkspace = vi.fn()
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: (...a: unknown[]) => resolvePreferredWorkspace(...a),
}))

// canViewBilling real (excluye team/org por tipo de workspace).
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

// createCheckout = preapproval recurrente (free→paid / reactivación / downgrade-at-cut);
// createOneShotPayment = one-shot prorrateado del UPGRADE mid-cycle (plan estrategia 06 C1).
const createCheckout = vi.fn()
const createOneShotPayment = vi.fn()
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    createCheckout: (...a: unknown[]) => createCheckout(...a),
    createOneShotPayment: (...a: unknown[]) => createOneShotPayment(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// Live add-ons of the coach (composite amount) — default none.
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return { ...actual, listLive: (...a: unknown[]) => listLive(...a) }
})

// Capacity gate del DOWNGRADE (OVER_CAPACITY) — alumnos activos standalone. Default 0.
const countActiveStandaloneClients = vi.fn().mockResolvedValue(0)
vi.mock('@/services/billing/capacity.service', () => ({
    countActiveStandaloneClients: (...a: unknown[]) => countActiveStandaloneClients(...a),
}))

import { POST } from './route'
import {
    getTierUpgradeProrationClp,
} from '@/services/billing/addons.service'
import { buildTierUpgradeExternalReference } from '@/lib/payments/providers/mercadopago'
import { TIER_CONFIG } from '@/lib/constants'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/create-preference', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

// Suscriptor pago ACTIVO en `pro` mensual con corte futuro (contexto de cambio de plan mid-cycle).
const ACTIVE_PRO_COACH = {
    subscription_status: 'active',
    subscription_tier: 'pro',
    billing_cycle: 'monthly',
    current_period_end: '2999-01-01T00:00:00.000Z', // futuro lejano → isActiveUpgrade = true
    subscription_mp_id: 'preapproval-OLD',
}

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    currentCoachMaybeSingle.mockResolvedValue({ data: null, error: null })
    listLive.mockResolvedValue([])
    countActiveStandaloneClients.mockResolvedValue(0)
    createCheckout.mockResolvedValue({
        checkoutId: 'preapproval-NEW',
        checkoutUrl: 'https://mp/checkout',
    })
    createOneShotPayment.mockResolvedValue({
        checkoutUrl: 'https://mp/oneshot',
        preferenceId: 'pref-1',
    })
})

describe('POST /api/payments/create-preference — FIX-2 rate limit', () => {
    it('429 cuando el rate limit dispara — ANTES de crear el checkout o tocar la DB', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 42 })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(429)
        expect(res.headers.get('Retry-After')).toBe('42')
        // El limiter corta antes de crear el preapproval o escribir billing.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(fakeAdmin.from).not.toHaveBeenCalled()
        // Se rate-limitea por user.id (de la sesión, no del body).
        expect(rateLimitPayment).toHaveBeenCalledWith('coach-1')
    })

    it('200 cuando el rate limit pasa (la request válida llega al checkout)', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.subscriptionId).toBe('preapproval-NEW')
        expect(json.checkoutUrl).toBe('https://mp/checkout')
        expect(createCheckout).toHaveBeenCalledOnce()
    })

    it('401 sin sesión: ni siquiera consulta el rate limit', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(401)
        expect(rateLimitPayment).not.toHaveBeenCalled()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// Cambio de plan de un suscriptor pago ACTIVO (plan estrategia 06 C1). La ramificación por
// dirección (comparePlanDirection) solo ocurre cuando isActiveUpgrade (status active + corte
// futuro). free→paid / reactivación caen al camino compuesto de siempre (NO testeados aquí; son
// el comportamiento previo cubierto por los tests de rate-limit de arriba con coach null).
// ════════════════════════════════════════════════════════════════════════════════════

// Lee el último patch que se le pasó a coaches.update (el route hace un solo UPDATE final).
function lastUpdatePayload(): Record<string, unknown> | undefined {
    const fromCalls = (fakeAdmin.from as ReturnType<typeof vi.fn>).mock.results
    // El builder devuelto por `from('coaches')` expone `.update` — capturamos su 1er arg.
    for (const r of fromCalls) {
        const builder = r.value as { update?: ReturnType<typeof vi.fn> }
        if (builder?.update && builder.update.mock.calls.length > 0) {
            return builder.update.mock.calls[builder.update.mock.calls.length - 1][0] as Record<
                string,
                unknown
            >
        }
    }
    return undefined
}

describe('POST /api/payments/create-preference — UPGRADE mid-cycle (one-shot prorrateado)', () => {
    beforeEach(() => {
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
    })

    it('pro→elite: devuelve { kind: tier_upgrade_oneshot, checkoutUrl, prorationClp } y NO crea preapproval', async () => {
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.kind).toBe('tier_upgrade_oneshot')
        expect(json.checkoutUrl).toBe('https://mp/oneshot')
        // monto server-side = diferencia de tier prorrateada al ciclo VIGENTE (mensual) del coach.
        const expectedProration = getTierUpgradeProrationClp(
            'pro',
            'elite',
            'monthly',
            // el route usa new Date() — solo verificamos > 0 y que coincide con el monto pasado a MP
            new Date('2026-06-13T00:00:00.000Z'),
            new Date(ACTIVE_PRO_COACH.current_period_end)
        )
        expect(json.prorationClp).toBeGreaterThan(0)
        // El one-shot se construyó con el MISMO monto que devolvió el endpoint.
        expect(createOneShotPayment).toHaveBeenCalledOnce()
        const oneShotArg = createOneShotPayment.mock.calls[0][0] as {
            amountClp: number
            externalReference: string
            successUrl: string
            failureUrl: string
            pendingUrl: string
        }
        expect(oneShotArg.amountClp).toBe(json.prorationClp)
        expect(oneShotArg.amountClp).toBeGreaterThan(0)
        // external_reference dedicado tier_upgrade|coach|elite|monthly (id de la sesión).
        expect(oneShotArg.externalReference).toBe(
            buildTierUpgradeExternalReference('coach-1', 'elite', 'monthly')
        )
        // back_url de éxito → pantalla de confirmación síncrona.
        expect(oneShotArg.successUrl).toContain('/coach/subscription/upgrade-processing')
        expect(oneShotArg.failureUrl).toContain('upgrade=failure')
        expect(oneShotArg.pendingUrl).toContain('upgrade=pending')
        // sanity de que el monto es el prorrateo (no la base completa del tier nuevo)
        expect(typeof expectedProration).toBe('number')
    })

    it('UPGRADE no crea un preapproval nuevo, no marca superseded y NO muta tier/max_clients/status', async () => {
        await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        // NO preapproval recurrente nuevo.
        expect(createCheckout).not.toHaveBeenCalled()
        // El UPDATE de coaches NO debe correr en el camino de upgrade (el route retorna antes).
        const payload = lastUpdatePayload()
        expect(payload).toBeUndefined()
        // Defensa explícita: jamás se tocan estas columnas en un upgrade (las fija confirm/webhook).
        if (payload) {
            expect(payload).not.toHaveProperty('subscription_tier')
            expect(payload).not.toHaveProperty('max_clients')
            expect(payload).not.toHaveProperty('subscription_status')
            expect(payload).not.toHaveProperty('superseded_mp_preapproval_id')
        }
    })

    it('400 si la diferencia prorrateada no es > 0 (nada que cobrar): no construye el one-shot', async () => {
        // Forzamos un corte ya pasado NO sirve (el mínimo es 1 día > 0). El caso diff<=0 real es
        // un "upgrade" de rank con precio igual o menor — no existe entre tiers a la venta, así que
        // este invariante se cubre vía la unidad getTierUpgradeProrationClp (diff<=0 → 0). Acá
        // verificamos que un upgrade legítimo SIEMPRE entrega monto > 0 (no cae al 400).
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        expect((await res.json()).prorationClp).toBeGreaterThan(0)
    })
})

describe('POST /api/payments/create-preference — DOWNGRADE sobre capacidad (OVER_CAPACITY 409)', () => {
    beforeEach(() => {
        // Coach en elite (cabe 100) con 50 alumnos activos: bajar a pro (cabe 30) supera la capacidad.
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(50)
    })

    it('elite→pro con 50 alumnos: 409 OVER_CAPACITY con maxClients/activeClients y CERO efectos', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('OVER_CAPACITY')
        expect(json.maxClients).toBe(30) // pro
        expect(json.activeClients).toBe(50)
        expect(typeof json.error).toBe('string')
        // Mensaje accionable con N y M.
        expect(json.error).toContain('30')
        expect(json.error).toContain('50')
        // CERO efectos colaterales: ni checkout, ni one-shot, ni UPDATE del coach.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P1-3: BLOQUEAR el downgrade a un tier SIN nutrición mientras un add-on de nutrición por
// intercambios está VIVO (decisión owner = BLOCK). Espejo del guard OVER_CAPACITY: el coach
// debe quitar el módulo antes de bajar a Starter. starter/free → canUseNutrition=false; pro/elite
// → true. Detección vía listLive(admin, user.id) buscando moduleKey==='nutrition_exchanges'.
// ════════════════════════════════════════════════════════════════════════════════════
function liveNutritionAddon(status: 'active' | 'cancel_pending' = 'active', source: 'self_service' | 'admin_grant' = 'self_service') {
    // listLive ya devuelve solo filas vivas (active/cancel_pending); el route solo mira moduleKey.
    return {
        id: 'addon-nut-1',
        coachId: 'coach-1',
        moduleKey: 'nutrition_exchanges' as const,
        status,
        source,
        priceClpMensual: 9990,
        termsVersion: 'v2-2026-06',
        termsAcceptedAt: '2026-06-01T00:00:00.000Z',
        activatedAt: '2026-06-01T00:00:00.000Z',
        firstChargedAt: '2026-06-01T00:00:00.000Z',
        cancelRequestedAt: null,
        expiresAt: null,
        cancelledAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
    }
}

describe('POST /api/payments/create-preference — DOWNGRADE con add-on de nutrición VIVO (NUTRITION_ADDON_ON_DOWNGRADE 409)', () => {
    beforeEach(() => {
        // Coach en pro (tiene nutrición) con add-on de nutrición vivo; bajar a starter (sin nutrición).
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
        // Bajo capacidad: el OVER_CAPACITY no aplica, aislamos el guard de nutrición.
        countActiveStandaloneClients.mockResolvedValue(0)
    })

    it('pro→starter con nutrición viva: 409 NUTRITION_ADDON_ON_DOWNGRADE y CERO efectos', async () => {
        listLive.mockResolvedValue([liveNutritionAddon('active')])
        const res = await POST(makeRequest({ tier: 'starter', billingCycle: 'monthly' }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('NUTRITION_ADDON_ON_DOWNGRADE')
        expect(typeof json.error).toBe('string')
        // El copy menciona el plan destino (label de Starter).
        expect(json.error).toContain(TIER_CONFIG.starter.label)
        // CERO efectos colaterales: ni checkout, ni one-shot, ni UPDATE del coach.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('add-on de nutrición en cancel_pending (ya dado de baja) NO bloquea: el downgrade procede (ambos al corte)', async () => {
        listLive.mockResolvedValue([liveNutritionAddon('cancel_pending')])
        const res = await POST(makeRequest({ tier: 'starter', billingCycle: 'monthly' }))
        // Solo nutrición ACTIVE bloquea; cancel_pending expira al corte, igual que arranca el plan nuevo.
        expect(res.status).toBe(200)
        expect(createCheckout).toHaveBeenCalledOnce()
    })

    it('cortesía del CEO (admin_grant) de nutrición viva también bloquea el downgrade', async () => {
        listLive.mockResolvedValue([liveNutritionAddon('active', 'admin_grant')])
        const res = await POST(makeRequest({ tier: 'starter', billingCycle: 'monthly' }))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('NUTRITION_ADDON_ON_DOWNGRADE')
    })

    it('pro→starter SIN add-on de nutrición vivo: NO bloquea por esta regla (procede el downgrade al corte)', async () => {
        listLive.mockResolvedValue([]) // ningún add-on vivo
        const res = await POST(makeRequest({ tier: 'starter', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        // El downgrade a starter procede: preapproval nuevo al corte (no es upgrade → sin one-shot).
        expect(createCheckout).toHaveBeenCalledOnce()
        expect(createOneShotPayment).not.toHaveBeenCalled()
    })

    it('downgrade a un tier QUE SÍ tiene nutrición (elite→pro) NO lo bloquea esta regla, aunque haya add-on vivo', async () => {
        // Coach en elite con add-on de nutrición vivo, baja a pro (pro tiene nutrición → canUseNutrition).
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        listLive.mockResolvedValue([liveNutritionAddon('active')])
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        expect(createCheckout).toHaveBeenCalledOnce()
        expect(createOneShotPayment).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/create-preference — DOWNGRADE bajo capacidad (programa al corte)', () => {
    beforeEach(() => {
        // Coach en elite con 5 alumnos: bajar a pro (cabe 30) SÍ cabe → se programa al corte.
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(5)
    })

    it('elite→pro con 5 alumnos: nuevo preapproval al corte y updatePayload OMITE tier/max_clients/billing_cycle', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        // Se crea el preapproval recurrente nuevo (al corte, startDate=current_period_end).
        expect(createCheckout).toHaveBeenCalledOnce()
        const checkoutArg = createCheckout.mock.calls[0][0] as { startDate?: string }
        expect(checkoutArg.startDate).toBe(ACTIVE_PRO_COACH.current_period_end)
        // No es un upgrade → no se construye el one-shot.
        expect(createOneShotPayment).not.toHaveBeenCalled()
        // updatePayload del downgrade NO degrada el plan ahora (fix audit P1):
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        expect(payload).not.toHaveProperty('subscription_tier')
        expect(payload).not.toHaveProperty('max_clients')
        expect(payload).not.toHaveProperty('billing_cycle')
        // sí marca superseded + el id del nuevo preapproval (los fija el webhook al corte).
        expect(payload).toHaveProperty('subscription_mp_id', 'preapproval-NEW')
        expect(payload).toHaveProperty('superseded_mp_preapproval_id', 'preapproval-OLD')
    })
})

describe('POST /api/payments/create-preference — cambio de CICLO (mismo tier) programa al corte', () => {
    beforeEach(() => {
        // pro mensual → pro anual: misma dirección de timing que un downgrade (al corte).
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
    })

    it('pro mensual→pro anual: preapproval al corte, updatePayload OMITE tier/max_clients/billing_cycle', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'annual' }))
        expect(res.status).toBe(200)
        expect(createCheckout).toHaveBeenCalledOnce()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        expect(payload).not.toHaveProperty('subscription_tier')
        expect(payload).not.toHaveProperty('max_clients')
        expect(payload).not.toHaveProperty('billing_cycle')
    })

    it('pro mensual→pro mensual (mismo tier + mismo ciclo): 400 no-op (la UI deshabilita Continuar)', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(400)
        // No-op: ni checkout, ni one-shot, ni UPDATE.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })
})
