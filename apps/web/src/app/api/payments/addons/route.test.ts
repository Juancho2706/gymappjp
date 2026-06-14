import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB, pagos, email) ────────────────────────────
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const adminInsert = vi.fn().mockResolvedValue({ error: null })
// scopeRow del guard P0-A: admin.from('coaches').select('superseded_mp_preapproval_id').eq().maybeSingle().
// Cada test del guard ajusta lo que devuelve (default: sin upgrade en curso).
const scopeMaybeSingle = vi.fn().mockResolvedValue({ data: { superseded_mp_preapproval_id: null }, error: null })
const fakeAdmin = {
    from: vi.fn(() => ({
        insert: adminInsert,
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: scopeMaybeSingle })) })),
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

const activateAddonForCoach = vi.fn()
const canPurchaseAddon = vi.fn()
vi.mock('@/services/billing/addons.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addons.service')>()
    return {
        ...actual,
        activateAddonForCoach: (...a: unknown[]) => activateAddonForCoach(...a),
        canPurchaseAddon: (...a: unknown[]) => canPurchaseAddon(...a),
    }
})

vi.mock('./_lib/payments-port', () => ({
    buildAddonPaymentsPort: vi.fn(() => ({
        updateCheckoutAmount: vi.fn(),
        createOneShotPayment: vi.fn(),
    })),
}))

// listLive: el guard P0-A(i) lee las filas vivas del coach para bloquear re-comprar un módulo ya
// activo (default: vacío → pasa). Cada test del check lo sobreescribe.
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return { ...actual, listLive: (...a: unknown[]) => listLive(...a) }
})

// Provider: el guard P0-A lee el external_reference del preapproval VIGENTE del coach para
// bloquear comprar un módulo que la recurrente ya carga (doble cobro top "Agregar" vs combo).
const fetchCheckoutSnapshot = vi.fn()
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    fetchCheckoutSnapshot: (...a: unknown[]) => fetchCheckoutSnapshot(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

const fetchCoachBillingRow = vi.fn()
const computeCompositeBreakdown = vi.fn()
vi.mock('./_lib/coach-context', async (orig) => {
    const actual = await orig<typeof import('./_lib/coach-context')>()
    return {
        ...actual,
        fetchCoachBillingRow: (...a: unknown[]) => fetchCoachBillingRow(...a),
        computeCompositeBreakdown: (...a: unknown[]) => computeCompositeBreakdown(...a),
    }
})

import { POST } from './route'
import { ADDON_PAYMENT_RULES } from '@/lib/constants'

const VERSION = ADDON_PAYMENT_RULES.version

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/addons', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }
const PAID_COACH = {
    id: 'coach-1',
    subscription_tier: 'pro',
    subscription_status: 'active',
    billing_cycle: 'monthly',
    current_period_end: '2026-07-01T00:00:00.000Z',
    subscription_mp_id: 'preapproval-1',
    superseded_mp_preapproval_id: null,
}

beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    fetchCoachBillingRow.mockResolvedValue(PAID_COACH)
    canPurchaseAddon.mockReturnValue({ allowed: true })
    listLive.mockResolvedValue([]) // default: sin add-ons vivos → el live-row check pasa
    // Default: no hay upgrade en curso (superseded null) y el preapproval vigente NO trae el módulo
    // embebido (reference de 3 partes) → el guard P0-A pasa. Cada test del guard sobreescribe.
    scopeMaybeSingle.mockResolvedValue({ data: { superseded_mp_preapproval_id: null }, error: null })
    fetchCheckoutSnapshot.mockResolvedValue({
        id: 'preapproval-1',
        external_reference: 'coach-1|pro|monthly',
    })
    computeCompositeBreakdown.mockResolvedValue({
        baseClp: 29990,
        addonLines: [{ label: 'Cardio', cycleAmountClp: 9990 }],
        addonsClp: 9990,
        totalClp: 39980,
    })
})

describe('POST /api/payments/addons — auth + rate limit', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(401)
    })

    it('429 si el rate limit dispara', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(429)
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({ type: 'coach_team', coachId: 'coach-1', userId: 'coach-1', teamId: 't1' })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(403)
        expect(activateAddonForCoach).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/addons — Zod + checkbox de términos', () => {
    it('400 con moduleKey fuera de la whitelist', async () => {
        const res = await POST(makeRequest({ moduleKey: 'hacking', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(400)
        expect(activateAddonForCoach).not.toHaveBeenCalled()
    })

    it('400 sin acceptedTermsVersion (checkbox no marcado)', async () => {
        const res = await POST(makeRequest({ moduleKey: 'cardio' }))
        expect(res.status).toBe(400)
    })

    it('400 con versión de términos vieja (TERMS_OUTDATED)', async () => {
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: 'v0-2025-01' }))
        expect(res.status).toBe(400)
        const json = await res.json()
        expect(json.code).toBe('TERMS_OUTDATED')
        expect(activateAddonForCoach).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/addons — guards de compra (D8)', () => {
    it('403 coach free → no_paid_plan', async () => {
        canPurchaseAddon.mockReturnValue({ allowed: false, reason: 'no_paid_plan' })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(403)
        const json = await res.json()
        expect(json.code).toBe('no_paid_plan')
    })

    it('403 starter + nutrition_exchanges → requires_nutrition_tier', async () => {
        canPurchaseAddon.mockReturnValue({ allowed: false, reason: 'requires_nutrition_tier' })
        const res = await POST(makeRequest({ moduleKey: 'nutrition_exchanges', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(403)
        const json = await res.json()
        expect(json.code).toBe('requires_nutrition_tier')
    })

    it('409 módulo ya activo (índice único parcial → conflicto amable)', async () => {
        activateAddonForCoach.mockRejectedValue(
            new Error('duplicate key value violates unique constraint "coach_addons_one_live_per_module"')
        )
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('ALREADY_ACTIVE')
    })
})

describe('POST /api/payments/addons — respuesta bifurcada (D4)', () => {
    it('MENSUAL → { checkoutUrl } del one-shot, sin evento (lo crea el webhook, converge con trim/anual)', async () => {
        activateAddonForCoach.mockResolvedValue({
            kind: 'one_shot_checkout',
            checkoutUrl: 'https://mp.test/checkout/abc',
            prorationClp: 5161,
            cycleAmountClp: 9990,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.kind).toBe('one_shot_checkout')
        expect(json.checkoutUrl).toBe('https://mp.test/checkout/abc')
        expect(json.prorationClp).toBe(5161)
        expect(json.cycleAmountClp).toBe(9990)
        // el evento/recibo llegan por webhook → el endpoint no inserta nada
        expect(adminInsert).not.toHaveBeenCalled()
    })

    it('TRIMESTRAL → { checkoutUrl } del one-shot, sin evento (lo crea el webhook)', async () => {
        fetchCoachBillingRow.mockResolvedValue({ ...PAID_COACH, billing_cycle: 'quarterly' })
        activateAddonForCoach.mockResolvedValue({
            kind: 'one_shot_checkout',
            checkoutUrl: 'https://mp.test/checkout/abc',
            prorationClp: 13487,
            cycleAmountClp: 26973,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.kind).toBe('one_shot_checkout')
        expect(json.checkoutUrl).toBe('https://mp.test/checkout/abc')
        expect(json.prorationClp).toBe(13487)
        // el evento/recibo llegan por webhook → el endpoint no inserta nada
        expect(adminInsert).not.toHaveBeenCalled()
    })
})

// ── Guard P0-A: no permitir pagar un one-shot por un módulo que la recurrente YA carga ──────
// El "Agregar" de arriba (one-shot prorrateado) y el combo de abajo (que embebe el módulo en una
// preapproval compuesta nueva) no estaban reconciliados → el mismo módulo por ambos = doble cobro.
// El índice único parcial bloquea filas duplicadas, NO plata duplicada. El guard 409 lo previene
// ANTES de iniciar el cobro: si el módulo ya está embebido en el preapproval vigente, o hay un
// upgrade en curso (superseded_mp_preapproval_id seteado) que puede embeberlo.
describe('POST /api/payments/addons — guard P0-A (ALREADY_BILLED)', () => {
    it('409 ALREADY_BILLED si el módulo YA está embebido en el preapproval vigente', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-1',
            external_reference: 'coach-1|pro|monthly|cardio', // 4ª parte: cardio embebido
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('ALREADY_BILLED')
        // jamás se inicia el cobro one-shot del módulo ya cargado
        expect(activateAddonForCoach).not.toHaveBeenCalled()
    })

    it('409 ALREADY_BILLED si hay un upgrade en curso (superseded_mp_preapproval_id seteado)', async () => {
        // El route lee el marcador de upgrade con un select dedicado (no via fetchCoachBillingRow).
        scopeMaybeSingle.mockResolvedValue({
            data: { superseded_mp_preapproval_id: 'preapproval-OLD' },
            error: null,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('ALREADY_BILLED')
        // se bloquea ANTES de leer el snapshot y de iniciar el cobro
        expect(activateAddonForCoach).not.toHaveBeenCalled()
        expect(fetchCheckoutSnapshot).not.toHaveBeenCalled()
    })

    it('409 ALREADY_ACTIVE si el coach ya tiene una fila viva del módulo (anti 2ª proración)', async () => {
        listLive.mockResolvedValue([{ moduleKey: 'cardio', source: 'self_service', status: 'active' }])
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.code).toBe('ALREADY_ACTIVE')
        // jamás se inicia el cobro one-shot de un módulo ya activo
        expect(activateAddonForCoach).not.toHaveBeenCalled()
    })

    it('NO bloquea si el preapproval vigente trae OTRO módulo (no el solicitado)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-1',
            external_reference: 'coach-1|pro|monthly|body_composition', // embebido OTRO módulo
        })
        activateAddonForCoach.mockResolvedValue({
            kind: 'one_shot_checkout',
            checkoutUrl: 'https://mp.test/checkout/abc',
            prorationClp: 5161,
            cycleAmountClp: 9990,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(200)
        expect(activateAddonForCoach).toHaveBeenCalledOnce()
    })

    it('fail-open: si el fetch del snapshot LANZA, no se bloquea el alta (no se cae por error del provider)', async () => {
        fetchCheckoutSnapshot.mockRejectedValue(new Error('MercadoPago request failed (502)'))
        activateAddonForCoach.mockResolvedValue({
            kind: 'one_shot_checkout',
            checkoutUrl: 'https://mp.test/checkout/abc',
            prorationClp: 5161,
            cycleAmountClp: 9990,
        })
        const res = await POST(makeRequest({ moduleKey: 'cardio', acceptedTermsVersion: VERSION }))
        expect(res.status).toBe(200)
        expect(activateAddonForCoach).toHaveBeenCalledOnce()
    })
})
