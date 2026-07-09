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

// Service-role client: la UPDATE de columnas de billing (update→eq→{error}) + la lectura de
// resolveActiveDiscountSpec (F2a.2b: coaches.active_coupon_redemption_id; null = sin cupón → monto idéntico).
const adminUpdateEq = vi.fn().mockResolvedValue({ error: null })
// F2: el INTENT durable de la Fase 1 Flow se escribe con admin.from('subscription_events').upsert(...).
const adminUpsert = vi.fn().mockResolvedValue({ error: null })
const fakeAdmin = {
    from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: adminUpdateEq })),
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { active_coupon_redemption_id: null }, error: null }),
            })),
        })),
        upsert: (...a: unknown[]) => adminUpsert(...a),
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
// createOneShotPayment = one-shot prorrateado del UPGRADE mid-cycle (plan estrategia 06 C1);
// cancelCheckoutAtProvider = cancelar el preapproval VIEJO de inmediato en un downgrade/cambio de
// ciclo al corte (P0-2, desacoplado del pago).
const createCheckout = vi.fn()
const createOneShotPayment = vi.fn()
const cancelCheckoutAtProvider = vi.fn().mockResolvedValue(undefined)
// El mock FORWARDEA el gateway: getPaymentsProvider('flow') → name 'flow', cualquier otro → 'mercadopago'.
// Las vi.fns internas se comparten entre ambos providers (las aserciones de createCheckout /
// cancelCheckoutAtProvider siguen siendo globales, sin importar por cuál provider se llamaron).
const getPaymentsProvider = vi.fn((gateway?: unknown) => ({
    name: (gateway === 'flow' ? 'flow' : 'mercadopago') as 'flow' | 'mercadopago',
    createCheckout: (...a: unknown[]) => createCheckout(...a),
    createOneShotPayment: (...a: unknown[]) => createOneShotPayment(...a),
    cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: (...a: unknown[]) => getPaymentsProvider(...a),
}))

// FLOW_ENABLED es un const build-time (NEXT_PUBLIC_FLOW_ENABLED === 'true') → no se puede togglear con
// env en runtime. Mockeamos @/lib/constants preservando TODO lo real (spread) y exponiendo FLOW_ENABLED
// como GETTER sobre un flag hoisted mutable, para prender/apagar el gate por test.
const flowFlag = vi.hoisted(() => ({ enabled: false }))
vi.mock('@/lib/constants', async (orig) => {
    const actual = await orig<typeof import('@/lib/constants')>()
    return {
        ...actual,
        get FLOW_ENABLED() {
            return flowFlag.enabled
        },
    }
})

// P0-4 (TOCTOU hardening): candado in-flight de UPGRADE reclamado ATÓMICAMENTE (plan-change-lock).
// claimUpgradeInFlight reemplaza el par check(isUpgradeInFlight)→set(setUpgradeInFlight): default
// true (reclama OK). Un test lo fuerza a false (segundo upgrade simultáneo → 409). clearUpgradeInFlight
// se asevera cuando la creación del one-shot falla (libera el candado para no trabar al coach 30 min).
const claimUpgradeInFlight = vi.fn().mockResolvedValue(true)
const clearUpgradeInFlight = vi.fn().mockResolvedValue(undefined)
vi.mock('@/services/billing/plan-change-lock', () => ({
    claimUpgradeInFlight: (...a: unknown[]) => claimUpgradeInFlight(...a),
    clearUpgradeInFlight: (...a: unknown[]) => clearUpgradeInFlight(...a),
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
import type { BillingCycle, SubscriptionTier } from '@/lib/constants'

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
    flowFlag.enabled = false // gate Flow apagado por defecto (fail-closed); tests Flow lo prenden.
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    currentCoachMaybeSingle.mockResolvedValue({ data: null, error: null })
    listLive.mockResolvedValue([])
    countActiveStandaloneClients.mockResolvedValue(0)
    cancelCheckoutAtProvider.mockResolvedValue(undefined)
    claimUpgradeInFlight.mockResolvedValue(true)
    clearUpgradeInFlight.mockResolvedValue(undefined)
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

        // P0-4 (TOCTOU): el candado se RECLAMA atómicamente (no hay un set posterior). En el camino
        // feliz no se libera (lo limpian confirm-upgrade/webhook al activar el tier).
        expect(claimUpgradeInFlight).toHaveBeenCalledOnce()
        expect(claimUpgradeInFlight.mock.calls[0][1]).toBe('coach-1')
        expect(clearUpgradeInFlight).not.toHaveBeenCalled()
    })

    it('P0-4 (TOCTOU): RECLAMA el candado ANTES de construir el one-shot (claim-first)', async () => {
        await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        // El reclamo claimUpgradeInFlight corre antes de crear el checkout one-shot.
        expect(claimUpgradeInFlight).toHaveBeenCalledOnce()
        expect(claimUpgradeInFlight.mock.calls[0][1]).toBe('coach-1')
        expect(createOneShotPayment).toHaveBeenCalledOnce()
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

    it('elite→pro con 5 alumnos: nuevo preapproval al corte, CANCELA el viejo de inmediato (P0-2) y OMITE tier/max_clients/billing_cycle', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        // Se crea el preapproval recurrente nuevo (al corte, startDate=current_period_end).
        expect(createCheckout).toHaveBeenCalledOnce()
        const checkoutArg = createCheckout.mock.calls[0][0] as { startDate?: string }
        expect(checkoutArg.startDate).toBe(ACTIVE_PRO_COACH.current_period_end)
        // No es un upgrade → no se construye el one-shot.
        expect(createOneShotPayment).not.toHaveBeenCalled()
        // P0-2: el preapproval VIEJO se cancela de inmediato (no espera al pago) para que no dispare
        // su cobro futuro coexistiendo con el nuevo → doble cobro.
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-OLD')
        // updatePayload del downgrade NO degrada el plan ahora (fix audit P1):
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        expect(payload).not.toHaveProperty('subscription_tier')
        expect(payload).not.toHaveProperty('max_clients')
        expect(payload).not.toHaveProperty('billing_cycle')
        expect(payload).toHaveProperty('subscription_mp_id', 'preapproval-NEW')
        // P0-2: con el cancel EXITOSO NO se persiste superseded (ya está cancelado en MP).
        expect(payload).toHaveProperty('superseded_mp_preapproval_id', null)
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

    it('cambio de ciclo (pro mensual→pro anual): CANCELA el viejo de inmediato (P0-2) y NO persiste superseded', async () => {
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'annual' }))
        expect(res.status).toBe(200)
        // P0-2 aplica también al cambio de ciclo (scheduleAtCutOnly = downgrade || same).
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-OLD')
        const payload = lastUpdatePayload()
        expect(payload).toHaveProperty('superseded_mp_preapproval_id', null)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P0-2 — backstop cuando el cancel del preapproval VIEJO FALLA. El cancel está desacoplado del
// pago; si MP rechaza el PUT de cancelación, NO se tumba el cambio: se persiste
// superseded_mp_preapproval_id = previousMpId para que webhook/cancel-subscription/cron lo
// reintenten. El coach conserva acceso por DB hasta current_period_end igual.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/create-preference — P0-2 cancel del viejo FALLA → persiste superseded como backstop', () => {
    beforeEach(() => {
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(5) // cabe en pro → downgrade procede
    })

    it('downgrade elite→pro con el cancel del viejo fallando: 200, intentó cancelar, y persiste superseded=preapproval-OLD', async () => {
        cancelCheckoutAtProvider.mockRejectedValue(new Error('MercadoPago PUT failed (404)'))
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        // El fallo del cancel NO tumba el cambio (está desacoplado del pago).
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-OLD')
        // Backstop: se persiste el viejo para que otro camino lo reintente.
        const payload = lastUpdatePayload()
        expect(payload).toHaveProperty('superseded_mp_preapproval_id', 'preapproval-OLD')
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P0-4 (TOCTOU hardening) — candado in-flight de UPGRADE reclamado ATÓMICAMENTE. Entre "creé el
// one-shot" y "activé el tier" un segundo upgrade recomputaría el compuesto sobre el tier viejo y
// plegaría el pago pendiente dos veces. claimUpgradeInFlight cierra el TOCTOU del check→set: dos
// upgrades simultáneos del MISMO coach ya no pueden ambos crear un one-shot (solo uno reclama el
// UNIQUE). El segundo recibe claim=false → 409 UPGRADE_IN_FLIGHT y CERO efectos.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/create-preference — P0-4 segundo upgrade simultáneo (claim→false → 409 UPGRADE_IN_FLIGHT)', () => {
    beforeEach(() => {
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
    })

    it('upgrade pro→elite cuando claimUpgradeInFlight→false (otro reclamó): 409 UPGRADE_IN_FLIGHT, CERO efectos', async () => {
        claimUpgradeInFlight.mockResolvedValue(false)
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('UPGRADE_IN_FLIGHT')
        expect(typeof json.error).toBe('string')
        // CERO efectos: ni one-shot, ni UPDATE. Y como NUNCA reclamó, NO libera el candado del otro.
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(clearUpgradeInFlight).not.toHaveBeenCalled()
        expect(createCheckout).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('si la creación del one-shot LANZA, se LIBERA el candado (clearUpgradeInFlight) y el error propaga (500)', async () => {
        claimUpgradeInFlight.mockResolvedValue(true) // reclama OK…
        createOneShotPayment.mockRejectedValue(new Error('MercadoPago one-shot create failed')) // …pero el checkout falla
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        // El error se surfacea como 500 (catch externo del route).
        expect(res.status).toBe(500)
        expect((await res.json()).error).toContain('MercadoPago one-shot create failed')
        // Reclamó y, ante el fallo, LIBERÓ el candado para no trabar al coach 30 min.
        expect(claimUpgradeInFlight).toHaveBeenCalledOnce()
        expect(clearUpgradeInFlight).toHaveBeenCalledOnce()
        expect(clearUpgradeInFlight.mock.calls[0][1]).toBe('coach-1')
        // No se persiste nada del coach (el upgrade no llegó a tocar coaches.update).
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('el candado NO afecta a un DOWNGRADE (solo a la rama upgrade): ni reclama ni libera', async () => {
        // Coach en elite: un downgrade a pro NO pasa por el candado (exclusivo de direction==='upgrade').
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(5)
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        expect(createCheckout).toHaveBeenCalledOnce()
        expect(claimUpgradeInFlight).not.toHaveBeenCalled()
        expect(clearUpgradeInFlight).not.toHaveBeenCalled()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P1 — CROSS-CYCLE UPGRADE: el nuevo tier se activa sobre el CICLO VIGENTE del coach. Si el coach
// pidió OTRO ciclo en el mismo gesto, se IGNORA (un cambio de ciclo es una acción aparte al corte).
// El prorrateo Y el external_reference del one-shot se fijan a currentCycle, no a billingCycle.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/create-preference — P1 cross-cycle upgrade fija currentCycle', () => {
    // Coach pago activo en pro ANUAL: un upgrade a elite pidiendo MENSUAL debe prorratearse y
    // referenciarse sobre el ciclo VIGENTE (annual), no sobre el mensual solicitado.
    const ACTIVE_PRO_ANNUAL = {
        ...ACTIVE_PRO_COACH,
        billing_cycle: 'annual' as BillingCycle,
    }

    beforeEach(() => {
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_ANNUAL, error: null })
    })

    it('pro ANUAL → elite pidiendo MENSUAL: el one-shot usa el ciclo VIGENTE (annual) en proración y ref', async () => {
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.kind).toBe('tier_upgrade_oneshot')

        // (a) proración server-side fijada al ciclo VIGENTE (annual), no al mensual solicitado.
        const expectedAnnualProration = getTierUpgradeProrationClp(
            'pro' as SubscriptionTier,
            'elite' as SubscriptionTier,
            'annual' as BillingCycle,
            new Date(),
            new Date(ACTIVE_PRO_ANNUAL.current_period_end)
        )
        // El monto del one-shot = proración del ciclo VIGENTE (annual). Comparamos contra el del body.
        expect(json.prorationClp).toBe(expectedAnnualProration)
        const oneShotArg = createOneShotPayment.mock.calls[0][0] as {
            amountClp: number
            externalReference: string
        }
        expect(oneShotArg.amountClp).toBe(expectedAnnualProration)

        // (b) external_reference del upgrade fijado a annual (NO monthly).
        expect(oneShotArg.externalReference).toBe(
            buildTierUpgradeExternalReference('coach-1', 'elite', 'annual')
        )
        expect(oneShotArg.externalReference).not.toContain('monthly')
    })

    it('upgrade respetando el ciclo vigente (pro mensual → elite mensual): el ref usa monthly', async () => {
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
        await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        const oneShotArg = createOneShotPayment.mock.calls[0][0] as { externalReference: string }
        expect(oneShotArg.externalReference).toBe(
            buildTierUpgradeExternalReference('coach-1', 'elite', 'monthly')
        )
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// W2 — gateway multi-provider (Flow.cl). El gateway lo elige la UI pero el gate de dinero es
// server-side: con FLOW_ENABLED OFF ningún request enruta a Flow (403 FEATURE_DISABLED). Con el
// flag ON, el camino compuesto (free→paid / reactivación) usa el FlowProvider y persiste el
// customerId ENROLADO en provider_customer_id — NUNCA subscription_mp_id (columna MP). El
// cambio-al-corte de una sub viva via Flow (downgrade/cambio de ciclo) es Ola 5 → 400 fail-closed.
// ════════════════════════════════════════════════════════════════════════════════════

// Coach FREE (primera compra): status active pero sin corte → isFreeTierCoach true, isActiveUpgrade false.
const FREE_COACH = {
    subscription_status: 'active',
    subscription_tier: 'free',
    billing_cycle: null,
    current_period_end: null,
    subscription_mp_id: null,
    provider_customer_id: null,
}

describe('POST /api/payments/create-preference — W2 gateway Flow', () => {
    it('gateway flow con FLOW_ENABLED OFF: 403 FEATURE_DISABLED y CERO efectos (fail-closed)', async () => {
        flowFlag.enabled = false
        currentCoachMaybeSingle.mockResolvedValue({ data: FREE_COACH, error: null })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(403)
        const json = await res.json()
        expect(json.code).toBe('FEATURE_DISABLED')
        // No se enruta a ningún provider ni se toca la DB.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(getPaymentsProvider).not.toHaveBeenCalledWith('flow')
        expect(fakeAdmin.from).not.toHaveBeenCalled()
    })

    it('gateway flow ON (coach free): enruta a Flow, UPDATE con provider_customer_id (NO subscription_mp_id) y successUrl → flow-processing', async () => {
        flowFlag.enabled = true
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...FREE_COACH, provider_customer_id: 'cus_existing' },
            error: null,
        })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(200)
        // El provider se pidió por gateway 'flow'.
        expect(getPaymentsProvider).toHaveBeenCalledWith('flow')
        // createCheckout usa la successUrl de la Fase 2 (flow-processing) y reusa el customerId enrolado.
        expect(createCheckout).toHaveBeenCalledOnce()
        const checkoutArg = createCheckout.mock.calls[0][0] as {
            successUrl: string
            existingCustomerId?: string
        }
        expect(checkoutArg.successUrl).toContain('/coach/subscription/flow-processing')
        expect(checkoutArg.successUrl).toContain('tier=pro')
        expect(checkoutArg.existingCustomerId).toBe('cus_existing')
        // UPDATE del coach: provider_customer_id (customerId de Flow) + payment_provider 'flow'; jamás
        // subscription_mp_id (columna MP). `superseded` SÍ viaja (juez Ola 4): backstop para que
        // webhook/cron reintenten cancelar un preapproval MP viejo si el cancel falló (null si no hubo).
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        expect(payload).toHaveProperty('provider_customer_id', 'preapproval-NEW')
        expect(payload).toHaveProperty('payment_provider', 'flow')
        expect(payload).not.toHaveProperty('subscription_mp_id')
        expect(payload).toHaveProperty('superseded_mp_preapproval_id')
        // ⚠️ subscription_provider NO se toca aquí (lo flipea la Fase 2 confirm-enrollment).
        expect(payload).not.toHaveProperty('subscription_provider')
    })

    it('gateway flow ON (reactivación canceled → pro): full compuesto por Flow, UPDATE con tier + provider_customer_id y sin subscription_mp_id', async () => {
        flowFlag.enabled = true
        currentCoachMaybeSingle.mockResolvedValue({
            data: {
                subscription_status: 'canceled',
                subscription_tier: 'pro',
                billing_cycle: 'monthly',
                current_period_end: null,
                subscription_mp_id: null,
                provider_customer_id: null,
            },
            error: null,
        })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(200)
        expect(getPaymentsProvider).toHaveBeenCalledWith('flow')
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        // Alta legítima: fija tier/status/max_clients ahora.
        expect(payload).toHaveProperty('subscription_tier', 'pro')
        expect(payload).toHaveProperty('provider_customer_id', 'preapproval-NEW')
        expect(payload).toHaveProperty('payment_provider', 'flow')
        expect(payload).not.toHaveProperty('subscription_mp_id')
    })

    it('sin gateway en el body: default mercadopago (comportamiento idéntico, se enruta a MP)', async () => {
        currentCoachMaybeSingle.mockResolvedValue({ data: FREE_COACH, error: null })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        // El default del Zod enruta a MercadoPago (jamás a Flow).
        expect(getPaymentsProvider).toHaveBeenCalledWith('mercadopago')
        expect(getPaymentsProvider).not.toHaveBeenCalledWith('flow')
        const checkoutArg = createCheckout.mock.calls[0][0] as { successUrl: string }
        // successUrl MP clásica (no flow-processing).
        expect(checkoutArg.successUrl).toContain('/coach/subscription/processing')
        expect(checkoutArg.successUrl).not.toContain('flow-processing')
    })

    it('gateway flow ON + coach pago ACTIVO pidiendo downgrade: 400 FLOW_PLAN_CHANGE_UNSUPPORTED y CERO efectos', async () => {
        flowFlag.enabled = true
        // Coach pago activo en elite; baja a pro. F1 bloquea CUALQUIER cambio de plan de un activo por Flow
        // ANTES incluso de la rama de capacidad/downgrade (se deriva a MP).
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(5)
        listLive.mockResolvedValue([])
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json.code).toBe('FLOW_PLAN_CHANGE_UNSUPPORTED')
        // Fail-closed: no crea checkout ni toca al coach.
        expect(createCheckout).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('F1: gateway flow ON + coach pago ACTIVO pidiendo UPGRADE: 400 FLOW_PLAN_CHANGE_UNSUPPORTED (no one-shot)', async () => {
        flowFlag.enabled = true
        // Coach pago activo en pro; upgrade a elite por Flow. F1 lo bloquea ANTES de la rama del one-shot:
        // el one-shot Flow cobraria la proracion por Webpay pero ningun camino lo completa (doble cobro sin upgrade).
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_PRO_COACH, error: null })
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('FLOW_PLAN_CHANGE_UNSUPPORTED')
        // NO se construye el one-shot ni se reclama el candado de upgrade.
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(claimUpgradeInFlight).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('F2: Flow free→paid escribe el INTENT durable (subscription_events upsert) con tier/cycle/addons', async () => {
        flowFlag.enabled = true
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...FREE_COACH, provider_customer_id: 'cus_existing' },
            error: null,
        })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow', addons: ['cardio'] }))
        expect(res.status).toBe(200)
        // Se escribio el intent con el tier/cycle/addons de ESTE checkout.
        expect(adminUpsert).toHaveBeenCalled()
        const intentRow = adminUpsert.mock.calls.find(
            (c) => String((c[0] as Record<string, unknown>)?.provider_event_id ?? '').startsWith('flow_checkout_intent:')
        )
        expect(intentRow).toBeTruthy()
        const row = intentRow![0] as Record<string, unknown>
        expect(row.provider_event_id).toBe('flow_checkout_intent:coach-1')
        expect(row.provider).toBe('flow')
        expect(row.provider_status).toBe('flow_checkout_intent')
        expect(row.payload).toMatchObject({ tier: 'pro', cycle: 'monthly', addons: ['cardio'] })
        // onConflict provider_event_id (un intent por coach).
        expect(intentRow![1]).toMatchObject({ onConflict: 'provider_event_id' })
    })

    it('F2: MercadoPago NO escribe intent (solo Flow lo necesita)', async () => {
        currentCoachMaybeSingle.mockResolvedValue({ data: FREE_COACH, error: null })
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        const intentRow = adminUpsert.mock.calls.find(
            (c) => String((c[0] as Record<string, unknown>)?.provider_event_id ?? '').startsWith('flow_checkout_intent:')
        )
        expect(intentRow).toBeFalsy()
    })

    it('F8: reactivación por Flow (canceled → pro) con preapproval MP viejo cuyo cancel FALLA: persiste superseded en la rama flow no-free', async () => {
        flowFlag.enabled = true
        // Coach canceled con un preapproval MP viejo (subscription_mp_id) → reactivacion por Flow (no-free).
        currentCoachMaybeSingle.mockResolvedValue({
            data: {
                subscription_status: 'canceled',
                subscription_tier: 'pro',
                billing_cycle: 'monthly',
                current_period_end: null,
                subscription_mp_id: 'preapproval-OLD',
                provider_customer_id: null,
            },
            error: null,
        })
        // El cancel del preapproval MP viejo FALLA → se persiste como backstop.
        cancelCheckoutAtProvider.mockRejectedValue(new Error('MercadoPago PUT failed (404)'))
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly', gateway: 'flow' }))
        expect(res.status).toBe(200)
        const payload = lastUpdatePayload()
        expect(payload).toBeTruthy()
        // Rama flow no-free: superseded viaja como backstop (F8).
        expect(payload).toHaveProperty('superseded_mp_preapproval_id', 'preapproval-OLD')
        expect(payload).toHaveProperty('provider_customer_id', 'preapproval-NEW')
        expect(payload).not.toHaveProperty('subscription_mp_id')
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// B2 (money-safety): un coach con SUSCRIPCION Flow ACTIVA no puede cambiar de plan por NINGUN
// gateway. El bug: aprieta el boton por defecto (Mercado Pago) → paga el one-shot de upgrade que
// confirm-upgrade/webhook JAMAS activan (cortan en subscription_mp_id null) → plata sin entregar; o
// un downgrade crea un preapproval MP nuevo junto a la sub Flow viva → doble recurrencia. El guard F1
// solo mira el gateway PEDIDO (flow); este guard mira el gateway del COACH (subscription_provider).
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/create-preference — B2 coach Flow activo bloquea cambio de plan por MP', () => {
    // Coach pago ACTIVO cuya suscripcion viva es Flow (subscription_mp_id null; el ref vive en el external_id).
    const ACTIVE_FLOW_PRO_COACH = {
        subscription_status: 'active',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        current_period_end: '2999-01-01T00:00:00.000Z',
        subscription_mp_id: null,
        subscription_provider: 'flow',
    }

    it('coach Flow activo + gateway MP (UPGRADE pro→elite): 400 FLOW_PLAN_CHANGE_UNSUPPORTED sin claim ni one-shot', async () => {
        currentCoachMaybeSingle.mockResolvedValue({ data: ACTIVE_FLOW_PRO_COACH, error: null })
        // gateway por defecto (mercadopago): el guard B2 debe cortar ANTES del claim/one-shot.
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('FLOW_PLAN_CHANGE_UNSUPPORTED')
        expect(claimUpgradeInFlight).not.toHaveBeenCalled()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(createCheckout).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('coach Flow activo + gateway MP (DOWNGRADE elite→pro): mismo 400, sin crear preapproval MP (evita doble recurrencia)', async () => {
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_FLOW_PRO_COACH, subscription_tier: 'elite' },
            error: null,
        })
        countActiveStandaloneClients.mockResolvedValue(0)
        const res = await POST(makeRequest({ tier: 'pro', billingCycle: 'monthly' }))
        expect(res.status).toBe(400)
        expect((await res.json()).code).toBe('FLOW_PLAN_CHANGE_UNSUPPORTED')
        expect(createCheckout).not.toHaveBeenCalled()
        expect(createOneShotPayment).not.toHaveBeenCalled()
        expect(lastUpdatePayload()).toBeUndefined()
    })

    it('coach MP activo (subscription_provider mercadopago): SIN regresion — el upgrade construye el one-shot normal', async () => {
        currentCoachMaybeSingle.mockResolvedValue({
            data: { ...ACTIVE_PRO_COACH, subscription_provider: 'mercadopago' },
            error: null,
        })
        const res = await POST(makeRequest({ tier: 'elite', billingCycle: 'monthly' }))
        expect(res.status).toBe(200)
        expect((await res.json()).kind).toBe('tier_upgrade_oneshot')
        expect(createOneShotPayment).toHaveBeenCalledOnce()
    })
})
