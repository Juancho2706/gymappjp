import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

const capi = vi.hoisted(() => ({
    configured: true,
    send: vi.fn<(...args: unknown[]) => Promise<{ ok: boolean; reason?: string }>>(),
}))
vi.mock('@/lib/meta/capi', () => ({
    isMetaCapiConfigured: () => capi.configured,
    sendMetaCapiEvent: (...args: unknown[]) => capi.send(...args),
}))

import {
    META_PURCHASE_AUDIT_ACTION,
    purchaseEventId,
    sendFirstPurchaseToMeta,
    type FirstPurchaseInput,
} from './meta-purchase.service'

/**
 * Plan C — `Purchase` de Meta solo en el primer cobro real del coach.
 *
 * Lo que se pinnea:
 *  · «primer cobro» = el snapshot más antiguo del coach es ESTE cobro (no el `inserted` del upsert,
 *    que con ignoreDuplicates es siempre true);
 *  · la marca `meta.purchase_sent` corta reintentos; sin envío exitoso no se marca;
 *  · fuera cuentas de prueba, internas/beta y montos en cero;
 *  · el contexto es SIEMPRE el guardado en el intent (canal del gateway primero) y nunca lleva IP;
 *  · nunca lanza.
 */

type State = {
    firstSnapshot: { provider: string; provider_payment_id: string } | null
    sentRows: Array<{ id: string }>
    paymentProvider: string | null
    email: string | null
    intents: Array<{ provider_event_id: string; payload: unknown }>
    throwOn: string | null
}

let state: State
let audits: Array<Record<string, unknown>>

function makeAdmin(): SupabaseClient<Database> {
    const result = (table: string, single: boolean) => {
        if (state.throwOn === table) throw new Error(`boom ${table}`)
        switch (table) {
            case 'billing_snapshots':
                return { data: state.firstSnapshot, error: null }
            case 'admin_audit_logs':
                return { data: state.sentRows, error: null }
            case 'coaches':
                return { data: state.paymentProvider ? { payment_provider: state.paymentProvider } : null, error: null }
            case 'subscription_events':
                return { data: state.intents, error: null }
            default:
                return { data: single ? null : [], error: null }
        }
    }
    const chainFor = (table: string) => {
        const chain: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain
        chain.maybeSingle = async () => result(table, true)
        chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            try {
                return Promise.resolve(result(table, false)).then(resolve, reject)
            } catch (err) {
                return Promise.reject(err).then(resolve, reject)
            }
        }
        chain.insert = async (row: Record<string, unknown>) => {
            audits.push(row)
            return { error: null }
        }
        return chain
    }
    return {
        from: (table: string) => chainFor(table),
        auth: {
            admin: {
                getUserById: async () => ({ data: { user: state.email ? { email: state.email } : null }, error: null }),
            },
        },
    } as unknown as SupabaseClient<Database>
}

const COACH = 'coach-1'
const INPUT: FirstPurchaseInput = {
    coachId: COACH,
    provider: 'flow',
    providerPaymentId: 'invoice:77',
    totalClp: 29990,
    tier: 'pro',
    cycle: 'monthly',
}

beforeEach(() => {
    capi.configured = true
    capi.send.mockReset()
    capi.send.mockResolvedValue({ ok: true })
    audits = []
    state = {
        firstSnapshot: { provider: 'flow', provider_payment_id: 'invoice:77' },
        sentRows: [],
        paymentProvider: 'flow',
        email: 'coach@gmail.com',
        intents: [
            { provider_event_id: `signup_checkout_intent:${COACH}`, payload: { tier: 'pro', meta: { fbp: 'fb.signup', ua: 'UA-signup' } } },
            { provider_event_id: `flow_checkout_intent:${COACH}`, payload: { tier: 'pro', meta: { fbp: 'fb.flow', fbc: 'fb.c', ua: 'UA-flow' } } },
        ],
        throwOn: null,
    }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sendFirstPurchaseToMeta', () => {
    it('primer cobro: manda Purchase con monto, id fijo y el contexto del intent del gateway, sin IP', async () => {
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('sent')

        expect(capi.send).toHaveBeenCalledTimes(1)
        expect(capi.send.mock.calls[0][0]).toMatchObject({
            eventName: 'Purchase',
            eventId: 'purchase:flow:invoice:77',
            actionSource: 'website',
            eventSourceUrl: 'https://www.eva-app.cl/coach/subscription',
            userData: { email: 'coach@gmail.com', externalId: COACH },
            customData: { value: 29990, currency: 'CLP', content_name: 'pro_monthly' },
            context: { fbp: 'fb.flow', fbc: 'fb.c', clientUserAgent: 'UA-flow', clientIpAddress: null, origin: null },
        })
        expect(audits).toEqual([
            expect.objectContaining({
                action: META_PURCHASE_AUDIT_ACTION,
                target_id: COACH,
                payload: { event_id: 'purchase:flow:invoice:77', provider: 'flow', total_clp: 29990, with_browser_context: true },
            }),
        ])
        // Sin PII en la marca de auditoría.
        expect(JSON.stringify(audits[0])).not.toContain('coach@gmail.com')
    })

    it('sin intent del gateway usa el del registro; sin ninguno manda igual, sin contexto de navegador', async () => {
        state.intents = state.intents.filter((i) => i.provider_event_id.startsWith('signup'))
        await sendFirstPurchaseToMeta(makeAdmin(), INPUT)
        expect(capi.send.mock.calls[0][0]).toMatchObject({ context: { fbp: 'fb.signup', clientUserAgent: 'UA-signup' } })

        capi.send.mockClear()
        audits = []
        state.intents = []
        await sendFirstPurchaseToMeta(makeAdmin(), INPUT)
        expect(capi.send.mock.calls[0][0]).toMatchObject({ context: { fbp: null, fbc: null, clientUserAgent: null } })
        expect(audits[0]).toMatchObject({ payload: { with_browser_context: false } })
    })

    it('renovación o cobro que no es el más antiguo del coach ⇒ no manda', async () => {
        state.firstSnapshot = { provider: 'flow', provider_payment_id: 'invoice:10' }
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('not_first_charge')

        state.firstSnapshot = { provider: 'mercadopago', provider_payment_id: 'invoice:77' }
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('not_first_charge')
        expect(capi.send).not.toHaveBeenCalled()
    })

    it('reintento del webhook con la marca ya puesta ⇒ no manda de nuevo', async () => {
        state.sentRows = [{ id: 'a1' }]
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('already_sent')
        expect(capi.send).not.toHaveBeenCalled()
    })

    it('cuenta de prueba, interna o beta ⇒ no manda', async () => {
        state.email = 'qa@evatest.cl'
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('test_account')

        state.email = 'coach@gmail.com'
        state.paymentProvider = 'internal'
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('excluded_provider')
        state.paymentProvider = 'beta'
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('excluded_provider')
        expect(capi.send).not.toHaveBeenCalled()
    })

    it('monto cero (cupón 100 %) o Meta sin configurar ⇒ no manda', async () => {
        await expect(sendFirstPurchaseToMeta(makeAdmin(), { ...INPUT, totalClp: 0 })).resolves.toBe('zero_amount')
        capi.configured = false
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('not_configured')
        expect(capi.send).not.toHaveBeenCalled()
    })

    it('si Meta rechaza o se cae, no deja marca (el próximo reintento puede mandarlo)', async () => {
        capi.send.mockResolvedValue({ ok: false, reason: 'network' })
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('send_failed')
        expect(audits).toEqual([])
    })

    it('un error de la base nunca lanza', async () => {
        state.throwOn = 'billing_snapshots'
        await expect(sendFirstPurchaseToMeta(makeAdmin(), INPUT)).resolves.toBe('error')
        expect(capi.send).not.toHaveBeenCalled()
    })
})

describe('purchaseEventId', () => {
    it('es determinístico por gateway y cobro (Meta descarta repetidos con el mismo id)', () => {
        expect(purchaseEventId('mercadopago', '123')).toBe('purchase:mercadopago:123')
    })
})
