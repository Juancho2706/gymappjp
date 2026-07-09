import { describe, expect, it, vi, beforeEach } from 'vitest'

// ── Mocks de infraestructura (auth, DB service-role, FlowProvider, hooks de add-ons) ──────
// confirm-enrollment es la FASE 2 del alta Flow: el coach volvio del enrolamiento Webpay; verificamos
// la tarjeta y creamos la suscripcion (Flow cobra la 1ra invoice al toque). Money-safety clave: la
// IDEMPOTENCIA (subscription_provider_external_id ya seteado ⇒ NO crear otra sub = evitar doble cobro).
const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

// Admin service-role stateful: el update de coaches escribe write-through en coachRow para que un
// segundo POST (idempotencia) lea el external_id ya seteado. upsert registra los subscription_events.
// `updateCoachError`: simula un fallo del persist (para el caso sub-creada-pero-no-persistida).
// El builder es table+filtro-aware (como los tests hermanos) para resolver los nuevos lookups de la Ola 4:
//   · intent durable (F2)      → subscription_events where provider_event_id = flow_checkout_intent:<id>
//   · huerfano (F6)            → subscription_events where provider_status = 'orphan_persist_failed'
//   · re-read fresco (F3)      → coaches select('subscription_provider_external_id') post-claim
//   · delete del intent (F2)   → subscription_events delete().eq(provider_event_id)
let coachRow: Record<string, unknown> | null
let updateCoachError: { message: string } | null = null
let intentPayloadRow: Record<string, unknown> | null = null // payload del intent, o null = sin intent
let orphanExists = false // F6: existe un evento orphan_persist_failed del coach
let externalIdRecheck: string | null = null // F3: valor del re-read fresco de external_id (post-claim)
const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = []
const upsertCalls: Array<{ table: string; row: Record<string, unknown> }> = []
const deleteCalls: Array<{ table: string; col: string; val: unknown }> = []

function makeAdmin() {
    return {
        from: vi.fn((table: string) => {
            const filters: Record<string, unknown> = {}
            let selectedCols = ''
            const builder: Record<string, unknown> = {
                select: vi.fn((cols?: string) => {
                    selectedCols = cols ?? ''
                    return builder
                }),
                eq: vi.fn((col: string, val: unknown) => {
                    filters[col] = val
                    return builder
                }),
                limit: vi.fn(() => builder),
                maybeSingle: vi.fn(async () => {
                    if (table === 'coaches') {
                        // F3: re-read fresco del external_id (select puntual post-claim).
                        if (selectedCols.startsWith('subscription_provider_external_id')) {
                            // El re-read fresco (F3) ahora trae tambien el status REAL del coach.
                            return {
                                data: {
                                    subscription_provider_external_id: externalIdRecheck,
                                    subscription_status: (coachRow?.subscription_status as string) ?? 'active',
                                },
                                error: null,
                            }
                        }
                        return { data: coachRow, error: null }
                    }
                    if (table === 'subscription_events') {
                        // F6: lookup del huerfano persist-failed.
                        if (filters.provider_status === 'orphan_persist_failed') {
                            return { data: orphanExists ? { id: 'evt-orphan' } : null, error: null }
                        }
                        // F2: lookup del intent durable.
                        if (String(filters.provider_event_id ?? '').startsWith('flow_checkout_intent:')) {
                            return {
                                data: intentPayloadRow ? { payload: intentPayloadRow } : null,
                                error: null,
                            }
                        }
                        return { data: null, error: null }
                    }
                    return { data: null, error: null }
                }),
                update: vi.fn((patch: Record<string, unknown>) => {
                    updateCalls.push({ table, patch })
                    if (updateCoachError) return { eq: vi.fn(async () => ({ error: updateCoachError })) }
                    if (table === 'coaches' && coachRow) Object.assign(coachRow, patch)
                    return { eq: vi.fn(async () => ({ error: null })) }
                }),
                upsert: vi.fn(async (row: Record<string, unknown>) => {
                    upsertCalls.push({ table, row })
                    return { error: null }
                }),
                delete: vi.fn(() => ({
                    eq: vi.fn(async (col: string, val: unknown) => {
                        deleteCalls.push({ table, col, val })
                        return { error: null }
                    }),
                })),
            }
            return builder
        }),
    }
}

// Claim atomico de la ventana de creacion (anti TOCTOU doble-sub). Controlable por test; el CAS real
// tiene sus propios tests (plan-change-lock).
let claimResult = true
const claimFlowEnrollment = vi.fn(async () => claimResult)
const clearFlowEnrollment = vi.fn(async () => undefined)
vi.mock('@/services/billing/plan-change-lock', () => ({
    claimFlowEnrollment: (...a: unknown[]) => claimFlowEnrollment(...(a as [])),
    clearFlowEnrollment: (...a: unknown[]) => clearFlowEnrollment(...(a as [])),
}))
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

// FLOW_ENABLED y SELF_SERVICE_ADDONS_ENABLED toggleables via getter (el resto de constants real).
let flowEnabled = true
let selfServiceAddons = true
vi.mock('@/lib/constants', async (orig) => {
    const actual = await orig<typeof import('@/lib/constants')>()
    return {
        ...actual,
        get FLOW_ENABLED() {
            return flowEnabled
        },
        get SELF_SERVICE_ADDONS_ENABLED() {
            return selfServiceAddons
        },
    }
})

// F11: decrementar el ciclo del cupon en el primer cobro (idempotente por payment id). Spy.
const decrementCouponCycleForCharge = vi.fn(async (..._a: unknown[]) => ({ decremented: false, expired: false }))
vi.mock('@/services/billing/coupons.service', () => ({
    decrementCouponCycleForCharge: (...a: unknown[]) => decrementCouponCycleForCharge(...a),
}))

// FlowProvider stub (solo para el value-import del cast; el provider real viene de getPaymentsProvider).
vi.mock('@/lib/payments/providers/flow', () => ({ FlowProvider: class {} }))

// Provider: los 2 metodos del flujo de DOS FASES.
const getCustomerEnrollmentStatus = vi.fn()
const createSubscriptionForEnrolledCustomer = vi.fn()
const getPaymentsProvider = vi.fn(() => ({
    name: 'flow' as const,
    getCustomerEnrollmentStatus: (...a: unknown[]) => getCustomerEnrollmentStatus(...a),
    createSubscriptionForEnrolledCustomer: (...a: unknown[]) => createSubscriptionForEnrolledCustomer(...a),
}))
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProvider: () => getPaymentsProvider(),
}))

// listLive (add-ons vivos) mockeado → controla el compuesto. markFirstCharged (B1): el primer cobro
// SINCRONO de Flow debe marcar first_charged_at de los add-ons recién materializados.
const listLive = vi.fn()
const markFirstCharged = vi.fn(async (..._a: unknown[]) => [] as unknown[])
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    listLive: (...a: unknown[]) => listLive(...a),
    markFirstCharged: (...a: unknown[]) => markFirstCharged(...a),
}))

// discount.service: isChargeableNetClp real; resolvers stub a null (sin cupon).
vi.mock('@/services/billing/discount.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/discount.service')>()
    return {
        ...actual,
        resolveActiveDiscountSpec: vi.fn(async () => null),
        resolveActiveDiscountDetail: vi.fn(async () => null),
    }
})

// addon-webhook.service: helpers puros reales; materialize + snapshot spy.
const materializeAddonsFromPreapproval = vi.fn()
const insertBillingSnapshot = vi.fn()
vi.mock('@/services/billing/addon-webhook.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/addon-webhook.service')>()
    return {
        ...actual,
        materializeAddonsFromPreapproval: (...a: unknown[]) => materializeAddonsFromPreapproval(...a),
        insertBillingSnapshot: (...a: unknown[]) => insertBillingSnapshot(...a),
    }
})

import { POST } from './route'

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/payments/flow/confirm-enrollment', {
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
    deleteCalls.length = 0
    flowEnabled = true
    selfServiceAddons = true
    claimResult = true
    updateCoachError = null
    intentPayloadRow = null
    orphanExists = false
    externalIdRecheck = null
    fakeAdmin = makeAdmin()
    getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'juan@evatest.cl' } } })
    resolvePreferredWorkspace.mockResolvedValue(STANDALONE_WS)
    listLive.mockResolvedValue([])
    materializeAddonsFromPreapproval.mockResolvedValue([])
    insertBillingSnapshot.mockResolvedValue(undefined)
    getCustomerEnrollmentStatus.mockResolvedValue({ enrolled: true, cardType: 'Visa', last4: '6623' })
    createSubscriptionForEnrolledCustomer.mockResolvedValue({
        subscriptionId: 'sus_1',
        planId: 'eva_pro_monthly_29990',
        periodEnd: '2026-08-04T00:00:00.000Z',
        firstInvoice: { id: '1167928', paid: true, paidAmountClp: 29990 },
    })
    coachRow = {
        id: 'coach-1',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        subscription_status: 'pending_payment',
        current_period_end: null,
        provider_customer_id: 'cus_123',
        subscription_provider_external_id: null,
        subscription_mp_id: null,
    }
})

describe('POST /api/payments/flow/confirm-enrollment — guards', () => {
    it('401 sin sesion', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(401)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('403 si Flow esta OFF (flag de lanzamiento)', async () => {
        flowEnabled = false
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('FEATURE_DISABLED')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
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

    it('404 si no existe el coach', async () => {
        coachRow = null
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(404)
    })

    it('400 sin provider_customer_id (no paso por create-preference Flow)', async () => {
        coachRow!.provider_customer_id = null
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(400)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })
})

describe('POST /api/payments/flow/confirm-enrollment — idempotencia (anti doble cobro)', () => {
    it('subscription_provider_external_id ya seteado → alreadyCreated con el status REAL, NO crea otra sub', async () => {
        coachRow!.subscription_provider_external_id = 'sus_EXISTENTE'
        coachRow!.subscription_status = 'active'
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.alreadyCreated).toBe(true)
        expect(json.status).toBe('active')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
        // Ni siquiera consulta el enrolamiento: retorna antes.
        expect(getCustomerEnrollmentStatus).not.toHaveBeenCalled()
    })

    it('sub ya creada pero PENDING (1ra invoice declinada) → alreadyCreated con status pending_payment (NO active hardcodeado)', async () => {
        coachRow!.subscription_provider_external_id = 'sus_EXISTENTE'
        coachRow!.subscription_status = 'pending_payment'
        const res = await POST(makeRequest({}))
        const json = await res.json()
        expect(json.alreadyCreated).toBe(true)
        // Escéptico Ola 4: responder 'active' fijo hacia que la pagina redirigiera al dashboard a un
        // coach cuyo primer cargo DECLINO. El status real preserva el desenlace pending.
        expect(json.status).toBe('pending_payment')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// B3 — reactivacion Flow→Flow. El external_id viejo bloquea alreadyCreated ETERNO si el coach ya
// esta 'canceled'/'expired' (la sub vieja ya fue cancelada en Flow, sin cobros futuros). Con estado
// terminal se ARCHIVA el id muerto y se crea una sub NUEVA; con estado vivo se conserva alreadyCreated.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — B3 reactivacion Flow→Flow', () => {
    it('coach CANCELED con external_id viejo → crea sub NUEVA + archiva el id muerto', async () => {
        coachRow!.subscription_provider_external_id = 'sus_OLD'
        coachRow!.subscription_status = 'canceled'
        externalIdRecheck = 'sus_OLD' // el re-read fresco tambien ve el id muerto (nadie lo limpio)
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('active')
        // Creo una sub NUEVA (NO bloqueo por alreadyCreated).
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
        // Archivo el external_id muerto en el historial (evidencia).
        const superseded = upsertCalls.find(
            (c) =>
                c.table === 'subscription_events' &&
                c.row.provider_event_id === 'flow:subscription:sus_OLD:superseded_by_reenrollment'
        )
        expect(superseded).toBeTruthy()
        expect((superseded!.row.payload as Record<string, unknown>).old_subscription_id).toBe('sus_OLD')
        // El persist sobrescribe con el id NUEVO.
        const patch = updateCalls.find((c) => c.table === 'coaches')!.patch
        expect(patch.subscription_provider_external_id).toBe('sus_1')
    })

    it('coach EXPIRED con external_id viejo → tambien reactiva (crea sub nueva)', async () => {
        coachRow!.subscription_provider_external_id = 'sus_OLD'
        coachRow!.subscription_status = 'expired'
        externalIdRecheck = 'sus_OLD'
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
    })

    it('coach ACTIVE con external_id → alreadyCreated SIN archivar (sin cambio)', async () => {
        coachRow!.subscription_provider_external_id = 'sus_LIVE'
        coachRow!.subscription_status = 'active'
        const res = await POST(makeRequest({}))
        expect((await res.json()).alreadyCreated).toBe(true)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
        const superseded = upsertCalls.find(
            (c) =>
                c.table === 'subscription_events' &&
                String(c.row.provider_event_id).includes('superseded_by_reenrollment')
        )
        expect(superseded).toBeFalsy()
    })
})

describe('POST /api/payments/flow/confirm-enrollment — claim atomico (anti TOCTOU doble-sub)', () => {
    it('claim PERDIDO (otro POST esta creando) → creating:true, NO crea sub', async () => {
        claimResult = false
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.creating).toBe(true)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('rechazo DEFINITIVO de la API de Flow al crear → LIBERA el claim (retry posible) + 502', async () => {
        createSubscriptionForEnrolledCustomer.mockRejectedValue(new Error('Flow subscription/create failed (HTTP 400) code=1: boom'))
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(502)
        expect(clearFlowEnrollment).toHaveBeenCalledOnce()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('error AMBIGUO (timeout/red, sin respuesta HTTP de Flow) → NO libera el claim (Flow pudo haber creado la sub) + 502', async () => {
        createSubscriptionForEnrolledCustomer.mockRejectedValue(new TypeError('fetch failed'))
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(502)
        // Residual del escéptico Ola 4: sin idempotency key en subscription/create, un timeout tras la
        // creacion real dejaria el claim libre → 2ª sub cobrada. El claim vivo (TTL 5 min) es el freno.
        expect(clearFlowEnrollment).not.toHaveBeenCalled()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })

    it('sub CREADA en Flow pero persist FALLA → NO libera el claim (freno anti 2ª sub) + evento orphan + 500', async () => {
        updateCoachError = { message: 'db down' }
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(500)
        // La sub se creo (llego a Flow) pero el claim queda VIVO: un reintento inmediato no debe crear otra.
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
        expect(clearFlowEnrollment).not.toHaveBeenCalled()
        // Rastro durable del subscriptionId huerfano para reconciliacion.
        const orphan = upsertCalls.find(
            (c) => c.table === 'subscription_events' && String(c.row.provider_event_id).includes('orphan_persist_failed')
        )
        expect(orphan).toBeTruthy()
        expect(orphan!.row.provider_checkout_id).toBe('sus_1')
    })
})

describe('POST /api/payments/flow/confirm-enrollment — enrolamiento en curso', () => {
    it('tarjeta aun no enrolada → { enrolled:false }, NO crea sub', async () => {
        getCustomerEnrollmentStatus.mockResolvedValue({ enrolled: false, cardType: null, last4: null })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.enrolled).toBe(false)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })
})

describe('POST /api/payments/flow/confirm-enrollment — happy path', () => {
    it('crea la sub, activa al coach con el gateway flow, materializa add-ons y escribe snapshot', async () => {
        const res = await POST(makeRequest({ addons: ['cardio'] }))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.ok).toBe(true)
        expect(json.status).toBe('active')
        expect(json.periodEnd).toBe('2026-08-04T00:00:00.000Z')

        // createSubscriptionForEnrolledCustomer con el customerId, tier y cycle del coach.
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
        const arg = createSubscriptionForEnrolledCustomer.mock.calls[0][0] as Record<string, unknown>
        expect(arg.customerId).toBe('cus_123')
        expect(arg.tier).toBe('pro')
        expect(arg.cycle).toBe('monthly')
        expect(arg.webhookUrl).toContain('/api/payments/flow/webhook')

        // UPDATE del coach: gateway flow + external id + plan id + active + periodEnd.
        const activated = updateCalls.find((c) => c.table === 'coaches')
        expect(activated).toBeTruthy()
        const patch = activated!.patch
        expect(patch.subscription_provider).toBe('flow')
        expect(patch.subscription_provider_external_id).toBe('sus_1')
        expect(patch.provider_plan_id).toBe('eva_pro_monthly_29990')
        expect(patch.payment_provider).toBe('flow')
        expect(patch.subscription_status).toBe('active')
        expect(patch.current_period_end).toBe('2026-08-04T00:00:00.000Z')

        // Materializa los add-ons validados.
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
        const [, coachIdArg, addonsArg] = materializeAddonsFromPreapproval.mock.calls[0]
        expect(coachIdArg).toBe('coach-1')
        expect(addonsArg).toEqual(['cardio'])

        // B1: el primer cobro SINCRONO de Flow marca first_charged_at de los add-ons recién materializados
        // (sin webhook recurrente que lo dispare como en MP). Set-once, best-effort.
        expect(markFirstCharged).toHaveBeenCalledOnce()
        expect(markFirstCharged.mock.calls[0][1]).toBe('coach-1')

        // Snapshot de la 1ra invoice pagada (idempotente por provider_payment_id 'invoice:<id>').
        expect(insertBillingSnapshot).toHaveBeenCalledOnce()
        const snap = insertBillingSnapshot.mock.calls[0][1] as Record<string, unknown>
        expect(snap.provider).toBe('flow')
        expect(snap.providerPaymentId).toBe('invoice:1167928')
        expect(snap.kind).toBe('recurring')

        // Evento de historial del alta.
        const evt = upsertCalls.find((c) => c.table === 'subscription_events')
        expect(evt).toBeTruthy()
        expect((evt!.row as Record<string, unknown>).provider_event_id).toBe(
            'flow:subscription:sus_1:created'
        )
    })

    it('NO escribe snapshot si la 1ra invoice no vino pagada', async () => {
        createSubscriptionForEnrolledCustomer.mockResolvedValue({
            subscriptionId: 'sus_1',
            planId: 'eva_pro_monthly_29990',
            periodEnd: '2026-08-04T00:00:00.000Z',
            firstInvoice: { id: '1167928', paid: false, paidAmountClp: null },
        })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect(insertBillingSnapshot).not.toHaveBeenCalled()
        // B1: sin cobro confirmado tampoco se marca first_charged_at (no hubo primer cobro).
        expect(markFirstCharged).not.toHaveBeenCalled()
    })

    it('segundo POST (external id ya persistido) → alreadyCreated, crea la sub UNA sola vez', async () => {
        const first = await POST(makeRequest({}))
        expect(first.status).toBe(200)
        expect((await first.json()).status).toBe('active')

        const second = await POST(makeRequest({}))
        expect(second.status).toBe(200)
        expect((await second.json()).alreadyCreated).toBe(true)

        // La sub se creo exactamente una vez pese a los dos POST del poll.
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
    })

    it('un fallo del snapshot NO tumba el alta (coach ya quedo activo)', async () => {
        insertBillingSnapshot.mockRejectedValue(new Error('db down'))
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('active')
    })
})

describe('POST /api/payments/flow/confirm-enrollment — coherencia D8 de add-ons', () => {
    it('nutrition_exchanges con tier starter → filtrado en silencio (materialize sin el)', async () => {
        coachRow!.subscription_tier = 'starter'
        createSubscriptionForEnrolledCustomer.mockResolvedValue({
            subscriptionId: 'sus_1',
            planId: 'eva_starter_monthly_14990',
            periodEnd: '2026-08-04T00:00:00.000Z',
            firstInvoice: { id: '1167928', paid: true, paidAmountClp: 14990 },
        })
        const res = await POST(makeRequest({ addons: ['nutrition_exchanges', 'cardio'] }))
        expect(res.status).toBe(200)
        expect(materializeAddonsFromPreapproval).toHaveBeenCalledOnce()
        const addonsArg = materializeAddonsFromPreapproval.mock.calls[0][2] as string[]
        // nutrition_exchanges se filtro (incoherente con starter); cardio sobrevive.
        expect(addonsArg).toEqual(['cardio'])
    })
})

describe('POST /api/payments/flow/confirm-enrollment — errores del provider', () => {
    it('createSubscription lanza (error Flow API) → 502', async () => {
        createSubscriptionForEnrolledCustomer.mockRejectedValue(
            new Error('Flow subscription/create failed (HTTP 400) code=1: bad')
        )
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(502)
        // No se persistio nada del coach (la creacion fallo antes del update).
        expect(updateCalls.find((c) => c.table === 'coaches')).toBeFalsy()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F2 (C1) — INTENT durable Fase 1 → Fase 2. La rama free de create-preference NO escribe tier/cycle en
// coaches (proteccion de abandono); el intent es la fuente server-side. Con intent, tier/cycle/addons
// salen del intent (los del body se IGNORAN). Sin intent y coach free → 409. Intent invalido → 409.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F2 intent durable', () => {
    it('coach free con intent pro/annual: crea la sub con tier/cycle del INTENT (no del coach row)', async () => {
        // El coach quedo free (rama de proteccion de abandono): el intent manda.
        coachRow!.subscription_tier = 'free'
        coachRow!.billing_cycle = null
        intentPayloadRow = { tier: 'pro', cycle: 'annual', addons: ['cardio'] }
        createSubscriptionForEnrolledCustomer.mockResolvedValue({
            subscriptionId: 'sus_1',
            planId: 'eva_pro_annual_287904',
            periodEnd: '2027-07-04T00:00:00.000Z',
            firstInvoice: { id: '2200', paid: true, paidAmountClp: 287904 },
        })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('active')
        // tier/cycle del intent, NO 'free' del coach row.
        const arg = createSubscriptionForEnrolledCustomer.mock.calls[0][0] as Record<string, unknown>
        expect(arg.tier).toBe('pro')
        expect(arg.cycle).toBe('annual')
        // add-ons del intent (los del body vienen vacios).
        const addonsArg = materializeAddonsFromPreapproval.mock.calls[0][2] as string[]
        expect(addonsArg).toEqual(['cardio'])
        // El persist fija tier=pro (del intent).
        const patch = updateCalls.find((c) => c.table === 'coaches')!.patch
        expect(patch.subscription_tier).toBe('pro')
        expect(patch.billing_cycle).toBe('annual')
    })

    it('con intent, los add-ons del BODY se ignoran (el intent es la fuente)', async () => {
        intentPayloadRow = { tier: 'pro', cycle: 'monthly', addons: ['cardio'] }
        const res = await POST(makeRequest({ addons: ['body_composition'] }))
        expect(res.status).toBe(200)
        const addonsArg = materializeAddonsFromPreapproval.mock.calls[0][2] as string[]
        expect(addonsArg).toEqual(['cardio']) // los del body no entran
    })

    it('sin intent y coach free → 409 INVALID_CHECKOUT_INTENT, NO crea sub', async () => {
        coachRow!.subscription_tier = 'free'
        intentPayloadRow = null
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('INVALID_CHECKOUT_INTENT')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('intent invalido (tier free) → 409 INVALID_CHECKOUT_INTENT, NO crea sub', async () => {
        intentPayloadRow = { tier: 'free', cycle: 'monthly', addons: [] }
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('INVALID_CHECKOUT_INTENT')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('intent invalido (ciclo desconocido para el tier) → 409 INVALID_CHECKOUT_INTENT', async () => {
        // 'weekly' no es un ciclo permitido de ningun tier (isBillingCycleAllowedForTier) → intent corrupto.
        intentPayloadRow = { tier: 'pro', cycle: 'weekly', addons: [] }
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('INVALID_CHECKOUT_INTENT')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('al COMPLETAR la Fase 2, borra el intent (best-effort)', async () => {
        intentPayloadRow = { tier: 'pro', cycle: 'monthly', addons: [] }
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const del = deleteCalls.find(
            (c) => c.table === 'subscription_events' && String(c.val).startsWith('flow_checkout_intent:')
        )
        expect(del).toBeTruthy()
        expect(del!.val).toBe('flow_checkout_intent:coach-1')
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F3 (H1) — TOCTOU residual del claim. El external_id se releyo ANTES del claim; tras GANAR el claim
// se re-verifica FRESCO. Si otro POST creo-persistio-libero entremedio, respondemos alreadyCreated sin
// crear una 2ª sub (doble cobro).
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F3 re-check post-claim', () => {
    it('external_id seteado en el re-read fresco (otro POST completo) → alreadyCreated, NO crea sub', async () => {
        externalIdRecheck = 'sus_concurrente' // el re-read post-claim lo ve seteado
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.alreadyCreated).toBe(true)
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
        // Gano el claim pero al ver la sub ajena, lo LIBERA.
        expect(clearFlowEnrollment).toHaveBeenCalledOnce()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F4 (H2) — subscription_mp_id rancio. El coach ahora es Flow; el persist nulea subscription_mp_id para
// que el webhook 'cancelled' de MP (gatillado por nuestro propio cancel en Fase 1) no lo tumbe.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F4 subscription_mp_id null', () => {
    it('el persist incluye subscription_mp_id: null', async () => {
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        const patch = updateCalls.find((c) => c.table === 'coaches')!.patch
        expect(patch).toHaveProperty('subscription_mp_id', null)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F5 (H3a) — guard de sub MP VIVA. Una sub MP activa con periodo futuro NO puede ser sepultada por una
// sub Flow encima (doble recurrencia). El alta legitima pasa (free→paid sin mp_id; reactivacion no active).
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F5 sub MP viva', () => {
    it('coach active con subscription_mp_id y corte futuro → 409 ACTIVE_MP_SUBSCRIPTION, NO crea sub', async () => {
        coachRow!.subscription_status = 'active'
        coachRow!.subscription_mp_id = 'preapproval-MP'
        coachRow!.current_period_end = '2999-01-01T00:00:00.000Z'
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(409)
        expect((await res.json()).code).toBe('ACTIVE_MP_SUBSCRIPTION')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('coach active SIN subscription_mp_id (free→paid) NO bloquea: el alta procede', async () => {
        coachRow!.subscription_status = 'active'
        coachRow!.subscription_mp_id = null
        coachRow!.current_period_end = '2999-01-01T00:00:00.000Z'
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect(createSubscriptionForEnrolledCustomer).toHaveBeenCalledOnce()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F6 (H3b) — freno terminal del huerfano persist-failed. Si hay un evento orphan_persist_failed, hubo
// una sub creada cuyo persist fallo; reintentar crearia una 2ª sub cobrada → 500 ORPHAN_NEEDS_RECONCILE.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F6 huerfano persist-failed', () => {
    it('evento orphan existente → 500 ORPHAN_NEEDS_RECONCILE, NO crea sub', async () => {
        orphanExists = true
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(500)
        expect((await res.json()).code).toBe('ORPHAN_NEEDS_RECONCILE')
        expect(createSubscriptionForEnrolledCustomer).not.toHaveBeenCalled()
    })

    it('el persist-failed response lleva code ORPHAN_PERSIST_FAILED (terminal para la pagina)', async () => {
        updateCoachError = { message: 'db down' }
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(500)
        expect((await res.json()).code).toBe('ORPHAN_PERSIST_FAILED')
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F7 (M) — estado si la 1ra invoice NO se pago. Flow reintenta (charges_retries_number=3); no damos
// acceso full sin cobro: subscription_status pending_payment + current_period_end null.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F7 primera invoice no pagada', () => {
    it('firstInvoice.paid false → pending_payment + current_period_end null (persist y response)', async () => {
        createSubscriptionForEnrolledCustomer.mockResolvedValue({
            subscriptionId: 'sus_1',
            planId: 'eva_pro_monthly_29990',
            periodEnd: '2026-08-04T00:00:00.000Z',
            firstInvoice: { id: '1167928', paid: false, paidAmountClp: null },
        })
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect((await res.json()).status).toBe('pending_payment')
        const patch = updateCalls.find((c) => c.table === 'coaches')!.patch
        expect(patch.subscription_status).toBe('pending_payment')
        expect(patch.current_period_end).toBeNull()
        // Sin cobro, sin snapshot ni decrement de cupon.
        expect(insertBillingSnapshot).not.toHaveBeenCalled()
        expect(decrementCouponCycleForCharge).not.toHaveBeenCalled()
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F9 (M2) — gate de add-ons en Fase 2 (espejo del fail-closed de create-preference). Con el flag OFF,
// los add-ons (del intent o del body) se materializan como [] — el alta del plan base sigue.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F9 gate de add-ons', () => {
    it('SELF_SERVICE_ADDONS_ENABLED OFF → materializa [] (ignora los add-ons), el alta base sigue', async () => {
        selfServiceAddons = false
        const res = await POST(makeRequest({ addons: ['cardio'] }))
        expect(res.status).toBe(200)
        const addonsArg = materializeAddonsFromPreapproval.mock.calls[0][2] as string[]
        expect(addonsArg).toEqual([])
    })
})

// ════════════════════════════════════════════════════════════════════════════════════
// F11 (L2) — decrementar el ciclo del cupon en el primer cobro (idempotente por 'invoice:<id>', el
// mismo payment id que usaria el webhook). Sin esto, si el urlCallback nunca llega, el cupon no consume
// el ciclo → un ciclo descontado de mas.
// ════════════════════════════════════════════════════════════════════════════════════
describe('POST /api/payments/flow/confirm-enrollment — F11 decrement de cupon', () => {
    it('primer cobro pagado → decrementCouponCycleForCharge(admin, coachId, invoice:<id>)', async () => {
        const res = await POST(makeRequest({}))
        expect(res.status).toBe(200)
        expect(decrementCouponCycleForCharge).toHaveBeenCalledOnce()
        const [, coachIdArg, paymentIdArg] = decrementCouponCycleForCharge.mock.calls[0]
        expect(coachIdArg).toBe('coach-1')
        expect(paymentIdArg).toBe('invoice:1167928')
    })
})
