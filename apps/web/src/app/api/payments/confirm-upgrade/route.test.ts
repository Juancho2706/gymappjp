import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB, provider, helpers de billing) ─────────────
// Espejo del patrón de confirm-addon/route.test.ts: se interceptan auth, workspace, rate-limit, el
// provider de pagos (fetchPaymentSnapshot del PAGO one-shot) y los helpers de billing. El camino
// SÍNCRONO confirm-upgrade ACTIVA el nuevo tier al volver del checkout SIN esperar el webhook (que
// sigue de backstop idempotente). La activación es rank-guarded: solo sube si el tier vigente es de
// rango menor; el PUT del preapproval va al nuevo compuesto y reescribe el external_reference al
// NUEVO tier|cycle (P0-1 stale-ref revert) vía updateCheckoutAmountAndRef; el snapshot lo escribe
// SOLO el webhook. Tras activar, se limpia el candado in-flight (P0-4) y se dedup-guarda contra
// replays (P1).
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

// Service-role admin con estado: registra coaches.update (rank-guarded), subscription_events.upsert
// y NUNCA debe tocar billing_snapshots (eso es del webhook). El builder rastrea por tabla. El
// select de subscription_events sirve el guard de replay P1 (tier_upgrade:${paymentId}).
const coachUpdates: Array<Record<string, unknown>> = []
const subscriptionEventUpserts: Array<Record<string, unknown>> = []
const subscriptionEventDeletes: string[] = []
const billingSnapshotUpserts: Array<Record<string, unknown>> = []
let coachUpdateError: { message: string } | null = null
// Guard de replay P1: provider_event_id → existe (ya procesado). Cada test lo setea.
const existingUpgradeEvents = new Set<string>()

function makeAdmin() {
    return {
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                return {
                    update: vi.fn((patch: Record<string, unknown>) => {
                        coachUpdates.push(patch)
                        return { eq: vi.fn(async () => ({ error: coachUpdateError })) }
                    }),
                }
            }
            if (table === 'subscription_events') {
                return {
                    // P1 replay guard: select('id').eq('provider_event_id', key).maybeSingle()
                    select: vi.fn(() => ({
                        eq: vi.fn((_col: string, value: string) => ({
                            maybeSingle: vi.fn(async () =>
                                existingUpgradeEvents.has(value)
                                    ? { data: { id: value }, error: null }
                                    : { data: null, error: null }
                            ),
                            // clearUpgradeInFlight: delete().eq('provider_event_id', key) — gt no se usa acá.
                            gt: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
                        })),
                    })),
                    upsert: vi.fn(async (row: Record<string, unknown>) => {
                        subscriptionEventUpserts.push(row)
                        return { error: null }
                    }),
                    // clearUpgradeInFlight (P0-4): delete().eq('provider_event_id', key)
                    delete: vi.fn(() => ({
                        eq: vi.fn(async (_col: string, value: string) => {
                            subscriptionEventDeletes.push(value)
                            return { error: null }
                        }),
                    })),
                }
            }
            if (table === 'billing_snapshots') {
                return {
                    upsert: vi.fn(async (row: Record<string, unknown>) => {
                        billingSnapshotUpserts.push(row)
                        return { error: null }
                    }),
                }
            }
            return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })), upsert: vi.fn(async () => ({ error: null })) }
        }),
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

const rateLimitPayment = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/rate-limit', () => ({
    rateLimitPayment: (...a: unknown[]) => rateLimitPayment(...a),
    jsonRateLimited: (retryAfter: number) =>
        new Response(JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMIT' }), {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) },
        }),
}))

// Provider: el camino síncrono lee el snapshot del PAGO one-shot (no del preapproval) + el PUT con
// reescritura del reference (updateCheckoutAmountAndRef — P0-1 stale-ref revert).
const fetchPaymentSnapshot = vi.fn()
const updateCheckoutAmountAndRef = vi.fn().mockResolvedValue(undefined)
const getPaymentsProvider = vi.fn(() => ({
    name: 'mercadopago' as const,
    fetchPaymentSnapshot: (...a: unknown[]) => fetchPaymentSnapshot(...a),
    updateCheckoutAmountAndRef: (...a: unknown[]) => updateCheckoutAmountAndRef(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// parseTierUpgradeReference: parser único del formato `tier_upgrade|...` (re-exportado del provider).
// buildCheckoutExternalReference: builder REAL del reference recurrente (no mockeado) — el route lo
// usa para reescribir el ref del preapproval al nuevo tier|cycle.
const parseTierUpgradeReference = vi.fn()
vi.mock('@/lib/payments/providers/mercadopago', async (orig) => {
    const actual = await orig<typeof import('@/lib/payments/providers/mercadopago')>()
    return {
        ...actual,
        parseTierUpgradeReference: (...a: unknown[]) => parseTierUpgradeReference(...a),
    }
})

// listLive: add-ons vivos del coach para el PUT del compuesto — default ninguno.
const listLive = vi.fn().mockResolvedValue([])
vi.mock('@/infrastructure/db/coach-addons.repository', async (orig) => {
    const actual = await orig<typeof import('@/infrastructure/db/coach-addons.repository')>()
    return { ...actual, listLive: (...a: unknown[]) => listLive(...a) }
})

const fetchCoachBillingRow = vi.fn()
vi.mock('../addons/_lib/coach-context', async (orig) => {
    const actual = await orig<typeof import('../addons/_lib/coach-context')>()
    return {
        ...actual,
        fetchCoachBillingRow: (...a: unknown[]) => fetchCoachBillingRow(...a),
    }
})

import { POST } from './route'
import { getCompositeAmountClp } from '@/services/billing/addons.service'
import { buildCheckoutExternalReference } from '@/lib/payments/providers/mercadopago'
import { getTierMaxClients } from '@/lib/constants'
import { upgradeInFlightKey } from '@/services/billing/plan-change-lock'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/confirm-upgrade', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

const STANDALONE_WS = { type: 'coach_standalone', coachId: 'coach-1', userId: 'coach-1' }
// Coach vigente en PRO mensual con preapproval — el upgrade lo sube a ELITE.
const PRO_COACH = {
    id: 'coach-1',
    subscription_tier: 'pro',
    subscription_status: 'active',
    billing_cycle: 'monthly',
    current_period_end: '2026-07-01T00:00:00.000Z',
    subscription_mp_id: 'preapproval-1',
}
const UPGRADE_REF = { coachId: 'coach-1', newTier: 'elite' as const, cycle: 'monthly' as const }

beforeEach(() => {
    vi.clearAllMocks()
    coachUpdates.length = 0
    subscriptionEventUpserts.length = 0
    subscriptionEventDeletes.length = 0
    billingSnapshotUpserts.length = 0
    existingUpgradeEvents.clear()
    coachUpdateError = null
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    rateLimitPayment.mockResolvedValue({ ok: true })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    fetchCoachBillingRow.mockResolvedValue(PRO_COACH)
    fetchPaymentSnapshot.mockResolvedValue({
        id: 'pay-1',
        status: 'approved',
        external_reference: 'tier_upgrade|coach-1|elite|monthly',
    })
    parseTierUpgradeReference.mockReturnValue(UPGRADE_REF)
    listLive.mockResolvedValue([])
})

describe('POST /api/payments/confirm-upgrade — auth + rate limit + payload', () => {
    it('401 sin sesión', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(401)
        expect(coachUpdates).toHaveLength(0)
    })

    it('401 sin email', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: null } } })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(401)
    })

    it('429 si el rate limit dispara', async () => {
        rateLimitPayment.mockResolvedValue({ ok: false, retryAfter: 30 })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(429)
        expect(coachUpdates).toHaveLength(0)
    })

    it('403 si no es coach standalone (team/org excluido por canViewBilling)', async () => {
        resolvePreferredWorkspace.mockResolvedValue({
            type: 'coach_team',
            coachId: 'coach-1',
            userId: 'coach-1',
            teamId: 't1',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(403)
        expect(coachUpdates).toHaveLength(0)
    })

    it('400 sin paymentId (zod)', async () => {
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(400)
        expect(fetchPaymentSnapshot).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/confirm-upgrade — activación rank-guarded (pago aprobado)', () => {
    it('approved + rank menor → activa tier+max_clients+cycle, hace el PUT con reescritura de ref (P0-1), NO escribe snapshot', async () => {
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).toBe('active')
        expect(json.tier).toBe('elite')

        // (a) activación: un único coaches.update con el destino completo.
        expect(coachUpdates).toHaveLength(1)
        expect(coachUpdates[0]).toMatchObject({
            subscription_tier: 'elite',
            max_clients: getTierMaxClients('elite'),
            billing_cycle: 'monthly',
        })
        // status NO se toca (sigue 'active').
        expect(coachUpdates[0]).not.toHaveProperty('subscription_status')

        // (b) P0-1: PUT del preapproval al nuevo compuesto Y reescritura del external_reference al
        //     NUEVO tier|cycle (+ add-ons vivos = ninguno). Sin esto el siguiente preapproval webhook
        //     re-derivaría el tier VIEJO y revertiría el upgrade.
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledOnce()
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledWith(
            'preapproval-1',
            getCompositeAmountClp('elite', 'monthly', []),
            buildCheckoutExternalReference('coach-1', 'elite', 'monthly', [])
        )

        // (c) el snapshot lo escribe SOLO el webhook — confirm-upgrade jamás toca billing_snapshots.
        expect(billingSnapshotUpserts).toHaveLength(0)

        // (d) evento de historial deduplicado por `tier_upgrade:${paymentId}`.
        const ev = subscriptionEventUpserts.find(
            (e) => e.provider_event_id === 'tier_upgrade:pay-1'
        )
        expect(ev).toBeTruthy()
    })

    it('el ref reescrito (P0-1) usa el NUEVO tier, no el viejo: nunca apunta a `pro`', async () => {
        await POST(makeRequest({ paymentId: 'pay-1' }))
        const refArg = updateCheckoutAmountAndRef.mock.calls[0][2] as string
        // El reference recurrente del preapproval ahora dice elite — no revierte a pro.
        expect(refArg).toContain('elite')
        expect(refArg).not.toContain('|pro|')
    })

    it('PUT del compuesto arrastra los add-ons vivos facturables y los embebe en el ref (elite + 1 add-on)', async () => {
        listLive.mockResolvedValue([
            {
                id: 'a1',
                coachId: 'coach-1',
                moduleKey: 'cardio',
                status: 'active',
                source: 'self_service',
                priceClpMensual: 9990,
                termsVersion: 'v2-2026-06',
                termsAcceptedAt: null,
                activatedAt: null,
                firstChargedAt: null,
                cancelRequestedAt: null,
                expiresAt: null,
                cancelledAt: null,
                createdAt: '2026-06-01T00:00:00.000Z',
                updatedAt: '2026-06-01T00:00:00.000Z',
            },
        ])
        await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledWith(
            'preapproval-1',
            getCompositeAmountClp('elite', 'monthly', [
                { moduleKey: 'cardio', priceClpMensual: 9990 },
            ]),
            buildCheckoutExternalReference('coach-1', 'elite', 'monthly', ['cardio'])
        )
    })

    it('P0-4: tras activar, LIMPIA el candado in-flight (DELETE de tier_upgrade_pending:${coachId})', async () => {
        await POST(makeRequest({ paymentId: 'pay-1' }))
        // clearUpgradeInFlight borra la fila keyed por el candado del coach.
        expect(subscriptionEventDeletes).toContain(upgradeInFlightKey('coach-1'))
    })
})

describe('POST /api/payments/confirm-upgrade — idempotencia (rank-guard) + orden con el webhook', () => {
    it('coach YA en elite (webhook activó primero): no-op del write, igual hace el PUT determinístico y responde active', async () => {
        fetchCoachBillingRow.mockResolvedValue({ ...PRO_COACH, subscription_tier: 'elite' })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('active')
        // Rank-guard: elite no es < elite → cero writes de coaches.
        expect(coachUpdates).toHaveLength(0)
        // El PUT igual corre (idempotente: monto + ref determinísticos).
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledOnce()
    })
})

describe('POST /api/payments/confirm-upgrade — P1 REPLAY GUARD (tier_upgrade:${paymentId} ya existe)', () => {
    it('replay de un paymentId ya procesado → 200 alreadyProcessed, SIN re-activar ni re-PUTear', async () => {
        // El evento de dedup del upgrade ya existe (este pago activó antes — confirm-upgrade o webhook).
        existingUpgradeEvents.add('tier_upgrade:pay-1')
        // Aunque el coach esté en un tier MENOR (p.ej. tras un downgrade posterior), NO se re-otorga.
        fetchCoachBillingRow.mockResolvedValue({ ...PRO_COACH, subscription_tier: 'pro' })

        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).toBe('active')
        expect(json.alreadyProcessed).toBe(true)
        // El tier reportado es el VIGENTE del coach, no se re-escala a elite.
        expect(json.tier).toBe('pro')

        // CRÍTICO: ni activación ni PUT — re-jugar un pago viejo no debe re-otorgar un tier gratis.
        expect(coachUpdates).toHaveLength(0)
        expect(updateCheckoutAmountAndRef).not.toHaveBeenCalled()
        // Tampoco se vuelve a upsertear el evento de historial.
        expect(subscriptionEventUpserts).toHaveLength(0)
    })

    it('primera vez (sin evento previo) → SÍ activa (el guard de replay no aplica)', async () => {
        // existingUpgradeEvents vacío → el guard deja pasar.
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        expect((await res.json()).alreadyProcessed).toBeUndefined()
        expect(coachUpdates).toHaveLength(1)
        expect(updateCheckoutAmountAndRef).toHaveBeenCalledOnce()
    })
})

describe('POST /api/payments/confirm-upgrade — pago no aprobado: NO activa', () => {
    it('pending → { ok, status } SIN activar (tier intacto, cero PUT)', async () => {
        fetchPaymentSnapshot.mockResolvedValue({
            id: 'pay-1',
            status: 'pending',
            external_reference: 'tier_upgrade|coach-1|elite|monthly',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).not.toBe('active')
        expect(coachUpdates).toHaveLength(0)
        expect(updateCheckoutAmountAndRef).not.toHaveBeenCalled()
        // No se llega siquiera a parsear el reference (el guard de estado corta antes).
        expect(parseTierUpgradeReference).not.toHaveBeenCalled()
    })

    it('rejected → NO activa (abandono/rechazo = sin upgrade)', async () => {
        fetchPaymentSnapshot.mockResolvedValue({
            id: 'pay-1',
            status: 'rejected',
            external_reference: 'tier_upgrade|coach-1|elite|monthly',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(200)
        expect(coachUpdates).toHaveLength(0)
    })
})

describe('POST /api/payments/confirm-upgrade — anti escalada + reference inválido', () => {
    it('403 si el external_reference pertenece a otro coach (sin activar)', async () => {
        parseTierUpgradeReference.mockReturnValue({
            coachId: 'someone-else',
            newTier: 'elite',
            cycle: 'monthly',
        })
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(403)
        expect(coachUpdates).toHaveLength(0)
        expect(updateCheckoutAmountAndRef).not.toHaveBeenCalled()
    })

    it('400 si el reference no es un upgrade de tier (parse → null)', async () => {
        parseTierUpgradeReference.mockReturnValue(null)
        const res = await POST(makeRequest({ paymentId: 'pay-1' }))
        expect(res.status).toBe(400)
        expect(coachUpdates).toHaveLength(0)
    })
})
