import { describe, expect, it } from 'vitest'
import { changeCardForCoach } from './change-card.service'
import type { PaymentsProvider } from '@/lib/payments/types'

// Guards de negocio del cambio de tarjeta (sin tocar MP ni Next): el service decide a partir del
// estado del coach. Los casos cubiertos retornan ANTES de llamar al provider, así que un provider
// stub alcanza. Un fake DB mínimo resuelve el select de `coaches` y el de `subscription_events`
// (in-flight). Verifica el ruteo de estados (terminal → reactivate; paused → fase 2; etc.).

type Coach = {
    id: string
    subscription_mp_id: string | null
    subscription_status: string | null
    superseded_mp_preapproval_id: string | null
    payment_provider: string | null
}

function fakeDb(coach: Coach | null, opts: { inflight?: boolean } = {}) {
    const make = (table: string) => {
        const chain: Record<string, unknown> = {}
        const self = () => chain
        Object.assign(chain, {
            select: self,
            eq: self,
            gt: self,
            delete: self,
            update: self,
            maybeSingle: async () =>
                table === 'coaches'
                    ? { data: coach }
                    : { data: opts.inflight ? { created_at: new Date().toISOString() } : null },
            insert: async () => ({ error: null }),
            upsert: async () => ({ error: null }),
        })
        return chain
    }
    return { from: (t: string) => make(t) }
}

const provider = { name: 'mercadopago' } as unknown as PaymentsProvider

const baseInput = {
    cardToken: 'tok',
    last4: '4242',
    brand: 'visa',
    paymentMethodId: 'visa',
    acceptedTermsVersion: 'v1',
    acceptedTermsText: '[]',
    reactivateUrl: 'https://eva-app.cl/coach/reactivate',
}

function coachWith(overrides: Partial<Coach>): Coach {
    return {
        id: 'c1',
        subscription_mp_id: 'mp1',
        subscription_status: 'active',
        superseded_mp_preapproval_id: null,
        payment_provider: 'mercadopago',
        ...overrides,
    }
}

describe('changeCardForCoach — guards', () => {
    it('coach inexistente → COACH_NOT_FOUND (404)', async () => {
        const r = await changeCardForCoach(fakeDb(null) as never, provider, { ...baseInput, coachId: 'c1' })
        expect(r).toMatchObject({ ok: false, code: 'COACH_NOT_FOUND', status: 404 })
    })

    it('sin subscription_mp_id → NO_ACTIVE_SUBSCRIPTION', async () => {
        const r = await changeCardForCoach(
            fakeDb(coachWith({ subscription_mp_id: null })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r).toMatchObject({ ok: false, code: 'NO_ACTIVE_SUBSCRIPTION' })
    })

    it('provider distinto (stripe) → WRONG_PROVIDER', async () => {
        const r = await changeCardForCoach(
            fakeDb(coachWith({ payment_provider: 'stripe' })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r).toMatchObject({ ok: false, code: 'WRONG_PROVIDER' })
    })

    it('cambio de plan en vuelo (superseded) → UPGRADE_IN_FLIGHT', async () => {
        const r = await changeCardForCoach(
            fakeDb(coachWith({ superseded_mp_preapproval_id: 'old-mp' })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r).toMatchObject({ ok: false, code: 'UPGRADE_IN_FLIGHT' })
    })

    it('suscripción cancelada → PREAPPROVAL_TERMINAL con reactivateUrl', async () => {
        const r = await changeCardForCoach(
            fakeDb(coachWith({ subscription_status: 'canceled' })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r.ok).toBe(false)
        if (!r.ok && r.code === 'PREAPPROVAL_TERMINAL') {
            expect(r.reactivateUrl).toContain('/coach/reactivate')
        } else {
            throw new Error(`esperaba PREAPPROVAL_TERMINAL, fue ${r.ok ? 'ok' : r.code}`)
        }
    })

    it('estado pending_payment (nunca confirmado, NO dunning) → INVALID_STATUS', async () => {
        const r = await changeCardForCoach(
            fakeDb(coachWith({ subscription_status: 'pending_payment' })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r).toMatchObject({ ok: false, code: 'INVALID_STATUS' })
    })

    it('estado paused (dunning) → YA NO bloquea: pasa los guards y procede (P0-3b)', async () => {
        // paused ahora está en PUT_ALLOWED: el guard de estado lo deja pasar. Con el provider stub (sin
        // fetchCheckoutSnapshot) la lectura pre-PUT falla → GATEWAY_ERROR, NO INVALID_STATUS. Lo que
        // importa: ya no se bloquea por estado (el CTA de dunning deja de ser callejón sin salida).
        const r = await changeCardForCoach(
            fakeDb(coachWith({ subscription_status: 'paused' })) as never,
            provider,
            { ...baseInput, coachId: 'c1' }
        )
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.code).not.toBe('INVALID_STATUS')
    })
})

// ── Camino con PUT: swap limpio, drift de ciclo y A2 (marcador no persiste) ────────────────────
// Un fake DB que GRABA inserts/deletes a subscription_events + un provider mock con snapshots
// before/after secuenciados. Cubre las ramas con lógica real (Q1, marcador P0-7) que los guards
// de arriba no tocan.

type Snap = { id?: string; next_payment_date: string; auto_recurring: { transaction_amount: number } }

function recordingDb(coach: Coach, opts: { markerInsertFails?: boolean } = {}) {
    const inserts: { table: string; status: string | undefined }[] = []
    const deletes: { table: string; key: string | undefined }[] = []
    const make = (table: string) => {
        const chain: Record<string, unknown> = {}
        let deleting = false
        Object.assign(chain, {
            select: () => chain,
            gt: () => chain,
            delete: () => {
                deleting = true
                return chain
            },
            eq: (col: string, val: string) => {
                if (deleting) deletes.push({ table, key: col === 'provider_event_id' ? val : undefined })
                return chain
            },
            maybeSingle: async () => (table === 'coaches' ? { data: coach } : { data: null }),
            insert: async (row: { provider_status?: string }) => {
                inserts.push({ table, status: row?.provider_status })
                const fail = opts.markerInsertFails && row?.provider_status === 'card_change_pending'
                return { error: fail ? { message: 'boom' } : null }
            },
            update: () => ({ eq: async () => ({ error: null }) }),
        })
        return chain
    }
    return { db: { from: (t: string) => make(t) }, inserts, deletes }
}

function mpProvider(snaps: Snap[], onPut?: () => void): PaymentsProvider {
    let i = 0
    return {
        name: 'mercadopago',
        fetchCheckoutSnapshot: async () => snaps[Math.min(i++, snaps.length - 1)],
        fetchCardTokenSummary: async () => ({ last4: '9999' }),
        updateCardAtProvider: async () => {
            onPut?.()
        },
    } as unknown as PaymentsProvider
}

describe('changeCardForCoach — camino con PUT', () => {
    it('swap limpio (sin drift) → ok:true, escribe marcador + audit, borra marcador (A3)', async () => {
        const { db, inserts, deletes } = recordingDb(coachWith({}))
        const snap: Snap = { id: 'mp1', next_payment_date: '2026-07-01T00:00:00Z', auto_recurring: { transaction_amount: 9990 } }
        const r = await changeCardForCoach(db as never, mpProvider([snap, snap]), { ...baseInput, coachId: 'c1' })
        expect(r).toMatchObject({ ok: true })
        expect(inserts.some((e) => e.status === 'card_change_pending')).toBe(true)
        expect(inserts.some((e) => e.status === 'card_changed')).toBe(true)
        expect(inserts.some((e) => e.status === 'card_change_cycle_drift')).toBe(false)
        expect(deletes.some((d) => d.key === 'card_change_pending:c1')).toBe(true)
    })

    it('drift de ciclo (next_payment_date cambió) → CYCLE_DRIFT + audit drift, sin card_changed', async () => {
        const { db, inserts } = recordingDb(coachWith({}))
        const before: Snap = { id: 'mp1', next_payment_date: '2026-07-01T00:00:00Z', auto_recurring: { transaction_amount: 9990 } }
        const after: Snap = { id: 'mp1', next_payment_date: '2026-08-01T00:00:00Z', auto_recurring: { transaction_amount: 9990 } }
        const r = await changeCardForCoach(db as never, mpProvider([before, after]), { ...baseInput, coachId: 'c1' })
        expect(r).toMatchObject({ ok: false, code: 'CYCLE_DRIFT' })
        expect(inserts.some((e) => e.status === 'card_change_cycle_drift')).toBe(true)
        expect(inserts.some((e) => e.status === 'card_changed')).toBe(false)
    })

    it('A2: el marcador P0-7 no persiste → aborta ANTES del PUT (no swap)', async () => {
        const { db } = recordingDb(coachWith({}), { markerInsertFails: true })
        let putCalled = false
        const snap: Snap = { id: 'mp1', next_payment_date: '2026-07-01T00:00:00Z', auto_recurring: { transaction_amount: 9990 } }
        const r = await changeCardForCoach(db as never, mpProvider([snap, snap], () => (putCalled = true)), {
            ...baseInput,
            coachId: 'c1',
        })
        expect(r).toMatchObject({ ok: false, code: 'GATEWAY_ERROR' })
        expect(putCalled).toBe(false)
    })
})
