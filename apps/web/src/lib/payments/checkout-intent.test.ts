import { describe, expect, it, vi } from 'vitest'
import {
    CHECKOUT_INTENT_CHANNELS,
    buildCheckoutIntentPayload,
    checkoutIntentEventId,
    checkoutIntentStatus,
    persistCheckoutIntent,
} from './checkout-intent'

// ════════════════════════════════════════════════════════════════════════════════════
// A1 (ola checkout 25-08) — el intent durable es lo que permite que la fila del coach nazca
// free+active sin perder qué vino a comprar. Lo que se pinea acá:
//   1. el canal `flow` produce EXACTAMENTE la clave/estado/payload que ya lee la Fase 2 de Flow
//      (`api/payments/flow/confirm-enrollment` matchea por el literal `flow_checkout_intent:<id>`);
//   2. ningún canal usa `provider_status = 'pending'` — ese valor es la señal que el cron
//      `checkout-abandoned` interpreta como "checkout muerto en la pasarela";
//   3. el upsert va con `onConflict: provider_event_id` (un intent por canal y coach).
// ════════════════════════════════════════════════════════════════════════════════════

function fakeAdmin(error: { message: string } | null = null) {
    const upsert = vi.fn().mockResolvedValue({ error })
    const from = vi.fn(() => ({ upsert }))
    return { admin: { from } as never, from, upsert }
}

describe('checkout-intent — claves y estados', () => {
    it('el canal flow conserva el contrato literal que lee confirm-enrollment', () => {
        expect(checkoutIntentEventId('flow', 'coach-1')).toBe('flow_checkout_intent:coach-1')
        expect(checkoutIntentStatus('flow')).toBe('flow_checkout_intent')
    })

    it('cada canal tiene su propia clave: no se pisan entre sí', () => {
        const ids = CHECKOUT_INTENT_CHANNELS.map((c) => checkoutIntentEventId(c, 'coach-1'))
        expect(new Set(ids).size).toBe(CHECKOUT_INTENT_CHANNELS.length)
        expect(ids).toContain('signup_checkout_intent:coach-1')
        expect(ids).toContain('mercadopago_checkout_intent:coach-1')
    })

    it('ningún canal usa `pending` como provider_status (colisionaría con el cron checkout-abandoned)', () => {
        for (const channel of CHECKOUT_INTENT_CHANNELS) {
            expect(checkoutIntentStatus(channel)).not.toBe('pending')
            expect(checkoutIntentStatus(channel)).toContain('_checkout_intent')
        }
    })
})

describe('checkout-intent — payload', () => {
    it('sin cupón el payload es exactamente {tier, cycle, addons} (idéntico al histórico de Flow)', () => {
        const payload = buildCheckoutIntentPayload({ tier: 'pro', cycle: 'monthly', addons: [] })
        expect(payload).toEqual({ tier: 'pro', cycle: 'monthly', addons: [] })
        expect(Object.keys(payload as object)).toEqual(['tier', 'cycle', 'addons'])
    })

    it('el cupón solo aparece cuando existe', () => {
        expect(
            buildCheckoutIntentPayload({ tier: 'elite', cycle: 'annual', addons: ['cardio'], coupon: 'DIEGO25' })
        ).toEqual({ tier: 'elite', cycle: 'annual', addons: ['cardio'], coupon: 'DIEGO25' })
        expect(
            buildCheckoutIntentPayload({ tier: 'pro', cycle: 'monthly', addons: [], coupon: null })
        ).not.toHaveProperty('coupon')
    })

    it('copia el array de add-ons (el caller no puede mutar el payload persistido)', () => {
        const addons = ['cardio']
        const payload = buildCheckoutIntentPayload({ tier: 'pro', cycle: 'monthly', addons }) as {
            addons: string[]
        }
        addons.push('nutrition_exchanges')
        expect(payload.addons).toEqual(['cardio'])
    })
})

describe('persistCheckoutIntent', () => {
    it('escribe la fila del canal con onConflict provider_event_id', async () => {
        const { admin, from, upsert } = fakeAdmin()
        const res = await persistCheckoutIntent(admin, {
            coachId: 'coach-1',
            channel: 'signup',
            provider: 'mercadopago',
            intent: { tier: 'pro', cycle: 'quarterly', addons: [], coupon: 'DIEGO25' },
        })
        expect(res).toEqual({ ok: true })
        expect(from).toHaveBeenCalledWith('subscription_events')
        const [row, opts] = upsert.mock.calls[0]
        expect(row).toMatchObject({
            coach_id: 'coach-1',
            provider: 'mercadopago',
            provider_event_id: 'signup_checkout_intent:coach-1',
            provider_status: 'signup_checkout_intent',
        })
        expect(row.payload).toMatchObject({ tier: 'pro', cycle: 'quarterly', coupon: 'DIEGO25' })
        expect(opts).toEqual({ onConflict: 'provider_event_id' })
    })

    it('NO lanza ante un error de DB: devuelve el mensaje para que el caller decida su política', async () => {
        const { admin } = fakeAdmin({ message: 'duplicate key' })
        await expect(
            persistCheckoutIntent(admin, {
                coachId: 'coach-1',
                channel: 'mercadopago',
                provider: 'mercadopago',
                intent: { tier: 'pro', cycle: 'monthly', addons: [] },
            })
        ).resolves.toEqual({ ok: false, error: 'duplicate key' })
    })
})
