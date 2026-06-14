import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB service-role, provider, hooks de add-ons) ──────
// confirm-subscription es el camino SÍNCRONO de "Ya pagué": confirma el preapproval al volver de MP
// sin esperar el webhook (que sigue de backstop idempotente). Los tests cubren los dos hooks que la
// fase 2 movió del webhook a este camino: (P0-B) cancelar el preapproval superseded en un upgrade en
// curso, y (P0-C) materializar las filas de add-ons embebidas en el external_reference del combo.
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

// Admin service-role: query builder chainable. select→eq→maybeSingle devuelve el coach; update→eq
// devuelve { error }. Se registran las llamadas a update para aseverar el clear del superseded marker.
let coachRow: Record<string, unknown> | null
const updateCalls: Array<Record<string, unknown>> = []
const upsertCalls: Array<Record<string, unknown>> = []

function makeAdmin() {
    return {
        from: vi.fn((table: string) => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: coachRow, error: null })),
                })),
            })),
            update: vi.fn((patch: Record<string, unknown>) => {
                updateCalls.push({ table, patch })
                return { eq: vi.fn(async () => ({ error: null })) }
            }),
            upsert: vi.fn(async (row: Record<string, unknown>) => {
                upsertCalls.push({ table, row })
                return { error: null }
            }),
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

// canViewBilling real (excluye team/org por tipo de workspace).
vi.mock('@/services/auth/workspace-permissions.service', async (orig) => {
    return await orig<typeof import('@/services/auth/workspace-permissions.service')>()
})

// Provider: fetchCheckoutSnapshot del preapproval + cancelCheckoutAtProvider para la supersede.
const fetchCheckoutSnapshot = vi.fn()
const cancelCheckoutAtProvider = vi.fn().mockResolvedValue(undefined)
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    fetchCheckoutSnapshot: (...a: unknown[]) => fetchCheckoutSnapshot(...a),
    cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// Hooks de add-ons (los mismos que el webhook): solo materializeAddonsFromPreapproval escribe filas.
const materializeAddonsFromPreapproval = vi.fn()
vi.mock('@/services/billing/addon-webhook.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addon-webhook.service')>()
    return {
        ...actual,
        materializeAddonsFromPreapproval: (...a: unknown[]) => materializeAddonsFromPreapproval(...a),
    }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/confirm-subscription', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }

beforeEach(() => {
    vi.clearAllMocks()
    updateCalls.length = 0
    upsertCalls.length = 0
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    materializeAddonsFromPreapproval.mockResolvedValue([])
    cancelCheckoutAtProvider.mockResolvedValue(undefined)
    coachRow = {
        id: 'coach-1',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        subscription_mp_id: 'preapproval-NEW',
        current_period_end: '2026-06-01T00:00:00.000Z',
        subscription_status: 'pending_payment',
        superseded_mp_preapproval_id: null,
    }
    // approved → status interno active; reference de 3 partes (sin add-ons) del coach correcto.
    fetchCheckoutSnapshot.mockResolvedValue({
        id: 'preapproval-NEW',
        status: 'approved',
        external_reference: 'coach-1|pro|monthly',
        next_payment_date: '2026-07-01T00:00:00.000Z',
        auto_recurring: { end_date: null },
    })
})

describe('POST /api/payments/confirm-subscription — guards', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({
            type: 'coach_team',
            coachId: 'coach-1',
            userId: 'coach-1',
            teamId: 't1',
        })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(403)
    })
})

describe('POST /api/payments/confirm-subscription — FIX-1: solo muta el coach si quedó paid-like', () => {
    // El sandbox de MP NO entrega webhooks; al volver del redirect el preapproval suele estar
    // 'pending'. ANTES el route escribía subscription_status = mapProviderStatus(...) SIEMPRE, así
    // que un 'pending' dejaba al coach en 'pending_payment' (status BLOQUEADO) + current_period_end
    // null, bloqueándolo y (audit P1) pisando un upgrade activo en curso. FIX-1: cuando el status
    // resuelto NO es paid-like ('active'|'trialing') NO se toca el coach — se responde
    // { ok:true, subscriptionStatus: status } y la processing page sigue polleando sin bloquear.

    it("approved → SÍ muta el coach a 'active' y responde subscriptionStatus 'active'", async () => {
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.subscriptionStatus).toBe('active')
        // Hubo un coaches.update que escribió subscription_status = 'active'.
        const activated = updateCalls.find(
            (c) =>
                c.table === 'coaches' &&
                (c.patch as Record<string, unknown>).subscription_status === 'active'
        )
        expect(activated).toBeTruthy()
    })

    it("pending → NO muta el coach (cero coaches.update) y responde subscriptionStatus 'pending_payment'", async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.subscriptionStatus).toBe('pending_payment')
        // CRÍTICO: ni un solo update sobre coaches (no se bloquea ni se pisa el upgrade en curso).
        const anyCoachUpdate = updateCalls.find((c) => c.table === 'coaches')
        expect(anyCoachUpdate).toBeFalsy()
    })

    it('in_process → NO muta el coach (cualquier no-paid-like deja la fila intacta)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'in_process',
            external_reference: 'coach-1|pro|monthly',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect((await res.json()).subscriptionStatus).toBe('pending_payment')
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('pending con upgrade EN CURSO (superseded marcado) → NO cancela, NO limpia el marcador, NO muta', async () => {
        // El audit P1: un confirm pending NO debe tocar un upgrade activo en vuelo. Sin mutación,
        // el marcador superseded sobrevive para que el webhook/confirm posterior (ya active) lo cierre.
        coachRow!.subscription_status = 'active'
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
        expect((await res.json()).subscriptionStatus).toBe('pending_payment')
    })

    it('pending → tampoco materializa add-ons embebidos (no hay grant sin pago confirmado)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly|cardio',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).not.toHaveBeenCalled()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })
})

describe('POST /api/payments/confirm-subscription — supersede cancel (P0-B)', () => {
    it('cancela el preapproval superseded una sola vez y limpia el marcador', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        // cancelCheckoutAtProvider llamado EXACTAMENTE una vez con el viejo preapproval
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('preapproval-OLD')
        // se limpia el marcador superseded (update con superseded_mp_preapproval_id: null)
        const clearUpdate = updateCalls.find(
            (c) =>
                c.table === 'coaches' &&
                (c.patch as Record<string, unknown>).superseded_mp_preapproval_id === null &&
                Object.keys(c.patch as Record<string, unknown>).length === 1
        )
        expect(clearUpdate).toBeTruthy()
    })

    it('NO cancela si no hay preapproval superseded (marcador null)', async () => {
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })

    it('NO cancela si el superseded es el mismo preapproval que se confirma (no es upgrade)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-NEW'
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })

    it('un fallo al cancelar en el provider NO tumba el confirm (se loguea)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        cancelCheckoutAtProvider.mockRejectedValue(new Error('MercadoPago PUT failed (404)'))
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        // la confirmación igual responde 200 (el coach ya quedó actualizado)
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledOnce()
    })

    it('NO cancela cuando el preapproval no quedó activo (pending → no paid-like)', async () => {
        coachRow!.superseded_mp_preapproval_id = 'preapproval-OLD'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/confirm-subscription — addons materializados (P0-C)', () => {
    it('combo con add-ons embebidos → materializeAddonsFromPreapproval con las claves del reference', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly|cardio+body_composition',
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
        // (admin service-role, coachId, addons[], termsVersion)
        const [adminArg, coachIdArg, addonsArg] = materializeAddonsFromPreapproval.mock.calls[0]
        expect(adminArg).toBe(fakeAdmin)
        expect(coachIdArg).toBe('coach-1')
        expect([...(addonsArg as string[])].sort()).toEqual(['body_composition', 'cardio'])
    })

    it('reference de 3 partes (sin add-ons) → NO materializa nada', async () => {
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).not.toHaveBeenCalled()
    })

    it('NO materializa si el preapproval no quedó activo (pending)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'pending',
            external_reference: 'coach-1|pro|monthly|cardio',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).not.toHaveBeenCalled()
    })

    it('un fallo al materializar NO tumba el confirm (backstop = webhook)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly|cardio',
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        materializeAddonsFromPreapproval.mockRejectedValue(new Error('db down'))
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P1 — EARLY-SLASH GUARD: confirm-subscription NO debe degradar entitlements de un cambio AGENDADO
// al corte. Un downgrade activo / cambio de ciclo crea un preapproval con start_date FUTURO; MP lo
// deja paid-like pero su inicio efectivo es a futuro. Si bajáramos tier/max_clients/cycle/period AHORA,
// el coach perdería entitlements ANTES del corte (y antes del fin del ciclo que pagó). Detectamos
// start_date > now y respondemos { ok, scheduled:true } sin mutar nada — el webhook aplica al corte.
// CRÍTICO: la señal es SOLO start_date / auto_recurring.start_date, NUNCA next_payment_date (que en
// un alta normal SIEMPRE es futuro → bloquearía la primera activación legítima, regresión del
// plain-renewal path).
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/confirm-subscription — P1 scheduled-at-cut NO degrada entitlements', () => {
    const FUTURE = '2999-01-01T00:00:00.000Z'
    const PAST = '2020-01-01T00:00:00.000Z'

    it('preapproval paid-like con start_date FUTURO (downgrade al corte) → { scheduled:true } y CERO coaches.update', async () => {
        // El coach pidió un downgrade: nuevo preapproval ya authorized pero start_date en el corte.
        coachRow!.subscription_status = 'active'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'authorized', // paid-like
            external_reference: 'coach-1|starter|monthly', // tier menor (downgrade)
            start_date: FUTURE,
            next_payment_date: FUTURE,
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.scheduled).toBe(true)
        // Devuelve el status VIGENTE del coach (no lo degrada).
        expect(json.subscriptionStatus).toBe('active')
        // CRÍTICO: ni un coaches.update — el webhook aplica el cambio al corte.
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('start_date FUTURO en auto_recurring.start_date (no top-level) → mismo skip', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'authorized',
            external_reference: 'coach-1|pro|annual',
            auto_recurring: { start_date: FUTURE, end_date: null },
            next_payment_date: FUTURE,
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect((await res.json()).scheduled).toBe(true)
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('alta NORMAL con start_date PASADO (creado now+60s, ya vencido) pero next_payment_date futuro → SÍ activa (no regresa el plain-renewal)', async () => {
        // El invariante: un alta fresca trae start_date ~ahora/pasado y next_payment_date futuro (el
        // próximo ciclo). NO debe confundirse con un cambio-al-corte: se activa normalmente.
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly',
            start_date: PAST,
            next_payment_date: FUTURE, // futuro SIEMPRE en un alta → no es señal de "agendado"
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.scheduled).toBeUndefined()
        expect(json.subscriptionStatus).toBe('active')
        // SÍ muta el coach (plain activation).
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeTruthy()
    })

    it('SIN start_date (solo next_payment_date futuro) → SÍ activa (next_payment_date no es señal)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'coach-1|pro|monthly',
            next_payment_date: '2999-01-01T00:00:00.000Z',
            auto_recurring: { end_date: null },
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(200)
        expect((await res.json()).scheduled).toBeUndefined()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeTruthy()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// P1 — FAIL-CLOSED 403 REGRESSION: el guard fail-closed para un preapprovalId EXPLÍCITO no debe
// 403ear un preapproval legacy cuyo external_reference es null/no-parseable. Dos caminos:
//   - parsedRef TIENE coachId → debe coincidir con user.id (si no, 403 — ya cubierto).
//   - parsedRef es null/sin coachId → se cae al ownership por id: el preapprovalId explícito DEBE
//     ser el subscription_mp_id ya guardado del coach. Coincide → procede; no coincide → 403.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/confirm-subscription — P1 fail-closed 403 cae al ownership por mp_id', () => {
    it('ref NULL pero el preapprovalId explícito ES el subscription_mp_id del coach → procede (no 403)', async () => {
        coachRow!.subscription_mp_id = 'preapproval-LEGACY'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-LEGACY',
            status: 'approved',
            external_reference: null, // legacy: sin reference parseable
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-LEGACY' }))
        // Coincide con el mp_id guardado → es suyo → procede a activar (no 403).
        expect(res.status).toBe(200)
        expect((await res.json()).subscriptionStatus).toBe('active')
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeTruthy()
    })

    it('ref NULL y el preapprovalId explícito NO coincide con el mp_id del coach → 403', async () => {
        coachRow!.subscription_mp_id = 'preapproval-MIO'
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-AJENO',
            status: 'approved',
            external_reference: null,
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-AJENO' }))
        expect(res.status).toBe(403)
        // No se mutó nada.
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('ref con coachId de OTRO coach (parseable) → 403 (anti escalada, camino ya existente)', async () => {
        fetchCheckoutSnapshot.mockResolvedValue({
            id: 'preapproval-NEW',
            status: 'approved',
            external_reference: 'someone-else|pro|monthly',
            next_payment_date: '2026-07-01T00:00:00.000Z',
        })
        const res = await POST(makeRequest({ preapprovalId: 'preapproval-NEW' }))
        expect(res.status).toBe(403)
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })
})
