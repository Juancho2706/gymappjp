import { describe, expect, it, vi, beforeEach } from 'vitest'

// El repository se mockea: estos tests cubren los HOOKS del webhook (materialización idempotente,
// set-once de first_charged, PUT diferido del compromiso mínimo, snapshot por cobro, evento
// `updated`/drift). Provider mockeado (NO toca red/MP). El acceso a datos real es la suite SQL del gate.
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    insertAddon: vi.fn(),
    listLive: vi.fn(),
    markFirstCharged: vi.fn(),
}))

import * as repo from '@/infrastructure/db/coach-addons.repository'
import {
    applyFirstChargeToAddons,
    buildAcceptedRulesPayload,
    buildAddonBreakdown,
    insertBillingSnapshot,
    materializeAddonsFromPreapproval,
    reconcilePreapprovalAmount,
    tierBaseClp,
} from './addon-webhook.service'
import {
    getAddonCycleAmountClp,
    getCompositeAmountClp,
    type AddonPaymentsPort,
} from './addons.service'
import { getTierPriceClp, ADDON_PAYMENT_RULES } from '@/lib/constants'
import type { CoachAddon } from '@/domain/billing/types'

const insertAddon = vi.mocked(repo.insertAddon)
const listLive = vi.mocked(repo.listLive)
const markFirstCharged = vi.mocked(repo.markFirstCharged)

function makePaymentsStub(overrides?: Partial<AddonPaymentsPort>): AddonPaymentsPort {
    return {
        updateCheckoutAmount: vi.fn().mockResolvedValue(undefined),
        createOneShotPayment: vi.fn().mockResolvedValue({ checkoutUrl: 'https://mp.test/x' }),
        ...overrides,
    }
}

function makeAddon(over: Partial<CoachAddon> = {}): CoachAddon {
    return {
        id: 'addon-1',
        coachId: 'coach-1',
        moduleKey: 'cardio',
        status: 'active',
        source: 'self_service',
        priceClpMensual: 9990,
        termsVersion: 'v1-2026-06',
        termsAcceptedAt: '2026-06-01T00:00:00.000Z',
        activatedAt: '2026-06-01T00:00:00.000Z',
        firstChargedAt: null,
        cancelRequestedAt: null,
        expiresAt: null,
        cancelledAt: null,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        ...over,
    }
}

// Stub del client service-role: solo se usa para el UPDATE de expires_at (PUT diferido) y el
// upsert del snapshot. Devuelve thenables encadenables que resuelven sin error por defecto.
function makeDbStub() {
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const updateEqEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ eq: updateEqEq }),
    })
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === 'billing_snapshots') return { upsert }
        if (table === 'coach_addons') return { update }
        return {}
    })
    return { db: { from } as never, upsert, update, updateEqEq }
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ── buildAddonBreakdown / tierBaseClp ──────────────────────────────────────────────
describe('buildAddonBreakdown', () => {
    it('solo add-ons facturables, con cycle_amount por ítem', () => {
        const list = [
            makeAddon({ moduleKey: 'cardio', source: 'self_service', status: 'active' }),
            makeAddon({ moduleKey: 'body_composition', source: 'admin_grant', priceClpMensual: 0 }),
        ]
        const breakdown = buildAddonBreakdown(list, 'quarterly')
        expect(breakdown).toEqual([
            {
                module_key: 'cardio',
                price_clp: 9990,
                cycle_amount_clp: getAddonCycleAmountClp(9990, 'quarterly'),
            },
        ])
    })
})

describe('tierBaseClp', () => {
    it('espeja getTierPriceClp', () => {
        expect(tierBaseClp('pro', 'monthly')).toBe(getTierPriceClp('pro', 'monthly'))
    })
})

// ── materializeAddonsFromPreapproval (signup / supersede) ──────────────────────────
describe('materializeAddonsFromPreapproval', () => {
    it('crea filas para los add-ons que aún no tienen fila viva (first_charged null)', async () => {
        const { db } = makeDbStub()
        listLive.mockResolvedValueOnce([]) // ninguna fila viva
        insertAddon.mockResolvedValue(makeAddon({ moduleKey: 'cardio' }))

        const created = await materializeAddonsFromPreapproval(db, 'coach-1', ['cardio'], 'v1-2026-06')

        expect(insertAddon).toHaveBeenCalledOnce()
        expect(insertAddon.mock.calls[0][1]).toMatchObject({
            moduleKey: 'cardio',
            source: 'self_service',
            firstChargedAt: null,
        })
        expect(created).toHaveLength(1)
    })

    it('idempotente: si ya hay fila viva del módulo, no inserta otra', async () => {
        const { db } = makeDbStub()
        listLive.mockResolvedValueOnce([makeAddon({ moduleKey: 'cardio', source: 'self_service' })])

        const created = await materializeAddonsFromPreapproval(db, 'coach-1', ['cardio'], 'v1-2026-06')

        expect(insertAddon).not.toHaveBeenCalled()
        expect(created).toHaveLength(0)
    })

    it('tolera el rechazo del índice único parcial (carrera de doble entrega) como no-op', async () => {
        const { db } = makeDbStub()
        listLive.mockResolvedValueOnce([])
        insertAddon.mockRejectedValue(
            new Error('duplicate key value violates unique constraint "coach_addons_one_live_per_module"')
        )

        const created = await materializeAddonsFromPreapproval(db, 'coach-1', ['cardio'], 'v1-2026-06')
        expect(created).toHaveLength(0) // no lanza
    })

    it('lista vacía → no toca el repository', async () => {
        const { db } = makeDbStub()
        const created = await materializeAddonsFromPreapproval(db, 'coach-1', [], 'v1-2026-06')
        expect(created).toHaveLength(0)
        expect(listLive).not.toHaveBeenCalled()
    })
})

// ── applyFirstChargeToAddons (set-once + PUT diferido del compromiso mínimo) ────────
describe('applyFirstChargeToAddons', () => {
    const ctx = {
        coachId: 'coach-1',
        tier: 'pro' as const,
        cycle: 'monthly' as const,
        subscriptionMpId: 'preapproval-1',
        currentPeriodEnd: '2026-08-01T00:00:00.000Z',
    }

    it('set-once: marca first_charged_at; sin cancel_pending → sin PUT', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()
        markFirstCharged.mockResolvedValue([makeAddon({ status: 'active' })])

        const result = await applyFirstChargeToAddons(db, payments, ctx, '2026-07-01T00:00:00.000Z')

        expect(markFirstCharged).toHaveBeenCalledWith(db, 'coach-1', '2026-07-01T00:00:00.000Z', {
            activatedBefore: '2026-07-01T00:00:00.000Z',
        })
        expect(result.markedIds).toEqual(['addon-1'])
        expect(result.putApplied).toBe(false)
        expect(payments.updateCheckoutAmount).not.toHaveBeenCalled()
    })

    it('idempotente: ninguna fila sin cobrar → no-op, sin PUT', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()
        markFirstCharged.mockResolvedValue([])

        const result = await applyFirstChargeToAddons(db, payments, ctx, '2026-07-01T00:00:00.000Z')

        expect(result.markedIds).toEqual([])
        expect(result.putApplied).toBe(false)
        expect(payments.updateCheckoutAmount).not.toHaveBeenCalled()
    })

    it('PUT DIFERIDO del compromiso mínimo: cancel_pending recién cobrado → expires_at + PUT que lo excluye', async () => {
        const { db, update, updateEqEq } = makeDbStub()
        const payments = makePaymentsStub()
        // markFirstCharged devuelve una fila que estaba cancel_pending (baja antes del 1er cobro)
        markFirstCharged.mockResolvedValue([
            makeAddon({ status: 'cancel_pending', firstChargedAt: '2026-07-01T00:00:00.000Z' }),
        ])
        // tras setear expires_at, listLive ya no devuelve add-ons facturables (la fila dejó de facturar)
        listLive.mockResolvedValue([
            makeAddon({ status: 'cancel_pending', firstChargedAt: '2026-07-01T00:00:00.000Z' }),
        ])

        const result = await applyFirstChargeToAddons(db, payments, ctx, '2026-07-01T00:00:00.000Z')

        expect(update).toHaveBeenCalled() // expires_at seteado
        expect(updateEqEq).toHaveBeenCalled()
        expect(result.putApplied).toBe(true)
        // PUT con el monto SIN el add-on de baja (solo la base del tier — cancel_pending ya cobrado no factura)
        expect(payments.updateCheckoutAmount).toHaveBeenCalledWith(
            'preapproval-1',
            getTierPriceClp('pro', 'monthly')
        )
    })
})

// ── insertBillingSnapshot (idempotente por provider_payment_id) ────────────────────
describe('insertBillingSnapshot', () => {
    const base = {
        coachId: 'coach-1',
        providerPaymentId: 'pay-123',
        chargedAt: '2026-07-01T00:00:00.000Z',
        tier: 'pro' as const,
        billingCycle: 'monthly' as const,
        kind: 'recurring' as const,
        baseClp: getTierPriceClp('pro', 'monthly'),
        addons: [{ module_key: 'cardio' as const, price_clp: 9990, cycle_amount_clp: 9990 }],
        totalClp: getTierPriceClp('pro', 'monthly') + 9990,
    }

    it('upsert con ignoreDuplicates por provider_payment_id', async () => {
        const { db, upsert } = makeDbStub()
        await insertBillingSnapshot(db, base)
        expect(upsert).toHaveBeenCalledOnce()
        const [row, opts] = upsert.mock.calls[0]
        expect(row).toMatchObject({
            coach_id: 'coach-1',
            provider_payment_id: 'pay-123',
            kind: 'recurring',
            total_clp: base.totalClp,
        })
        expect(opts).toMatchObject({ onConflict: 'provider_payment_id', ignoreDuplicates: true })
    })

    it('reentrega del mismo cobro = mismo upsert idempotente (no duplica por DB unique)', async () => {
        const { db, upsert } = makeDbStub()
        await insertBillingSnapshot(db, base)
        await insertBillingSnapshot(db, base)
        // ambas llaman upsert con el mismo provider_payment_id: la DB colapsa por el UNIQUE.
        expect(upsert).toHaveBeenCalledTimes(2)
        expect(upsert.mock.calls[0][0].provider_payment_id).toBe(
            upsert.mock.calls[1][0].provider_payment_id
        )
    })

    it('propaga error de DB', async () => {
        const upsert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
        const db = { from: vi.fn().mockReturnValue({ upsert }) } as never
        await expect(insertBillingSnapshot(db, base)).rejects.toThrow(/boom/)
    })
})

// ── reconcilePreapprovalAmount (evento `updated`: confirma o alerta drift) ──────────
describe('reconcilePreapprovalAmount', () => {
    it('monto MP == esperado → ok, sin drift', () => {
        const r = reconcilePreapprovalAmount({ providerAmountClp: 35000, expectedClp: 35000 })
        expect(r).toEqual({ ok: true, drift: false, providerAmountClp: 35000, expectedClp: 35000 })
    })

    it('monto MP != esperado → drift', () => {
        const r = reconcilePreapprovalAmount({ providerAmountClp: 9990, expectedClp: 35000 })
        expect(r.drift).toBe(true)
        expect(r.ok).toBe(false)
    })

    it('sin monto en el payload → no confirma ni marca drift', () => {
        const r = reconcilePreapprovalAmount({ providerAmountClp: null, expectedClp: 35000 })
        expect(r).toEqual({ ok: false, drift: false, providerAmountClp: null, expectedClp: 35000 })
    })

    it('se integra con getCompositeAmountClp (compuesto real)', () => {
        const expected = getCompositeAmountClp('pro', 'monthly', [
            { moduleKey: 'cardio', priceClpMensual: 9990 },
        ])
        expect(reconcilePreapprovalAmount({ providerAmountClp: expected, expectedClp: expected }).ok).toBe(
            true
        )
    })
})

// ── buildAcceptedRulesPayload (evidencia SERNAC del alta) ───────────────────────────
describe('buildAcceptedRulesPayload', () => {
    it('mensual → 5 reglas con el texto mensual + versión', () => {
        const p = buildAcceptedRulesPayload('monthly')
        expect(p.version).toBe(ADDON_PAYMENT_RULES.version)
        expect(p.rules).toHaveLength(5)
        // mensual ahora prorratea como trim/anual: la regla 2 describe el pago único inmediato
        expect(p.rules[1].text).toContain('pago único')
    })

    it('trim/anual → la regla 2 usa la variante de pago único prorrateado', () => {
        const p = buildAcceptedRulesPayload('annual')
        expect(p.rules[1].text).toContain('pago único')
    })
})
