import { describe, expect, it, vi, beforeEach } from 'vitest'

// El repository se mockea: estos tests cubren LÓGICA (cálculo + bifurcación + máquina de
// estados), no el acceso a datos (eso es la suite SQL del gate). Se interceptan las funciones
// que el service consume del repository.
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    insertAddon: vi.fn(),
    listLive: vi.fn(),
    requestCancel: vi.fn(),
    revokeAdminGrant: vi.fn(),
}))

// El descuento se resuelve DENTRO del service (resolveActiveDiscountSpec). Por defecto = sin cupón
// (null) → montos idénticos al legacy. Los tests de cupón lo overridean. buildAmountPutIdempotencyKey
// queda REAL (no se mockea) para aseverar el formato de la key.
const { resolveActiveDiscountSpec } = vi.hoisted(() => ({ resolveActiveDiscountSpec: vi.fn() }))
vi.mock('@/services/billing/discount.service', async (orig) => {
    const actual = await orig<typeof import('@/services/billing/discount.service')>()
    return { ...actual, resolveActiveDiscountSpec }
})

import * as repo from '@/infrastructure/db/coach-addons.repository'
import {
    activateAddonForCoach,
    activateAddonForCoachFlow,
    ADMIN_GRANT_TERMS_VERSION,
    applyCouponToAddonProration,
    canPurchaseAddon,
    getAddonCycleAmountClp,
    getAddonMonthlyPriceClp,
    getAddonProrationClp,
    getCompositeAmountClp,
    isAddonBillable,
    materializeAddonFromOneShot,
    requestAddonCancellation,
    syncAdminGrants,
    toBillableAddons,
    type AddonPaymentsPort,
} from './addons.service'
import type { DiscountSpec } from '@/lib/constants'
import { getTierPriceClp } from '@/lib/constants'
import type { CoachAddon } from '@/domain/billing/types'

const insertAddon = vi.mocked(repo.insertAddon)
const listLive = vi.mocked(repo.listLive)
const requestCancel = vi.mocked(repo.requestCancel)
const revokeAdminGrant = vi.mocked(repo.revokeAdminGrant)

// Stub mínimo del client service-role: solo se usa para la reversión D5 (delete) en monthly.
function makeDbStub() {
    const del = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    const db = { from: vi.fn().mockReturnValue({ delete: del }) }
    return { db: db as never, del }
}

function makePaymentsStub(overrides?: Partial<AddonPaymentsPort>): AddonPaymentsPort {
    return {
        updateCheckoutAmount: vi.fn().mockResolvedValue(undefined),
        createOneShotPayment: vi
            .fn()
            .mockResolvedValue({ checkoutUrl: 'https://mp.test/checkout/abc' }),
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
        termsVersion: 'v2-2026-06',
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

beforeEach(() => {
    vi.clearAllMocks()
    resolveActiveDiscountSpec.mockResolvedValue(null) // default: sin cupón vivo
})

// ── Precio por ciclo + redondeos ──────────────────────────────────────────────
describe('getAddonMonthlyPriceClp / getAddonCycleAmountClp', () => {
    it('mensual = precio de lista uniforme $9.990', () => {
        expect(getAddonMonthlyPriceClp('cardio')).toBe(9990)
        expect(getAddonMonthlyPriceClp('nutrition_exchanges')).toBe(9990)
    })

    it('trimestral aplica −10% sobre ×3, redondeado por ítem', () => {
        // round(9990*3*0.9) = round(26973) = 26973
        expect(getAddonCycleAmountClp(9990, 'quarterly')).toBe(26973)
    })

    it('anual aplica −20% sobre ×12, redondeado por ítem', () => {
        // round(9990*12*0.8) = round(95904) = 95904
        expect(getAddonCycleAmountClp(9990, 'annual')).toBe(95904)
    })

    it('mensual no aplica descuento', () => {
        expect(getAddonCycleAmountClp(9990, 'monthly')).toBe(9990)
    })
})

// ── Monto compuesto ────────────────────────────────────────────────────────────
describe('getCompositeAmountClp', () => {
    it('base + Σ add-ons facturables (pro mensual + 1 add-on)', () => {
        const total = getCompositeAmountClp('pro', 'monthly', [
            { moduleKey: 'cardio', priceClpMensual: 9990 },
        ])
        expect(total).toBe(getTierPriceClp('pro', 'monthly') + 9990)
    })

    it('suma exacta del desglose por ítem (pro anual + 2 add-ons)', () => {
        const base = getTierPriceClp('pro', 'annual')
        const a1 = getAddonCycleAmountClp(9990, 'annual')
        const a2 = getAddonCycleAmountClp(9990, 'annual')
        const total = getCompositeAmountClp('pro', 'annual', [
            { moduleKey: 'cardio', priceClpMensual: 9990 },
            { moduleKey: 'body_composition', priceClpMensual: 9990 },
        ])
        expect(total).toBe(base + a1 + a2)
    })

    it('sin add-ons = solo la base del tier', () => {
        expect(getCompositeAmountClp('elite', 'quarterly', [])).toBe(
            getTierPriceClp('elite', 'quarterly')
        )
    })

    // F2a overload: con 4º arg `discount` devuelve estructurado; sin él, number legacy.
    it('overload con discount=null → estructurado, descuento 0, total = composite legacy', () => {
        const legacy = getCompositeAmountClp('pro', 'monthly', [{ moduleKey: 'cardio', priceClpMensual: 9990 }])
        const r = getCompositeAmountClp('pro', 'monthly', [{ moduleKey: 'cardio', priceClpMensual: 9990 }], null)
        expect(r.discountClp).toBe(0)
        expect(r.totalClp).toBe(legacy)
        expect(r.baseBeforeDiscountClp).toBe(legacy)
    })

    it('overload con cupón 20% total → aplica sobre base + add-ons (compone)', () => {
        const composite = getCompositeAmountClp('pro', 'monthly', [{ moduleKey: 'cardio', priceClpMensual: 9990 }])
        const r = getCompositeAmountClp('pro', 'monthly', [{ moduleKey: 'cardio', priceClpMensual: 9990 }], {
            type: 'percent',
            value: 20,
            target: 'total',
        })
        expect(r.baseBeforeDiscountClp).toBe(composite)
        expect(r.discountClp).toBe(Math.round(composite * 0.2))
        expect(r.totalClp).toBe(composite - Math.round(composite * 0.2))
    })

    it('overload sin 4º arg sigue devolviendo number (back-compat de callers)', () => {
        const r = getCompositeAmountClp('pro', 'monthly', [])
        expect(typeof r).toBe('number')
    })
})

// ── Prorrateo one-shot (regla 2 trim/anual) ──────────────────────────────────────
describe('getAddonProrationClp', () => {
    it('mitad de ciclo trimestral ≈ mitad del monto trimestral', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // 45 días restantes / 90 = 0.5
        // round(26973 * 0.5) = round(13486.5) = 13487
        expect(getAddonProrationClp(9990, 'quarterly', now, end)).toBe(13487)
    })

    it('mitad de ciclo anual ≈ mitad del monto anual', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-11-28T00:00:00.000Z') // 180 días / 360 = 0.5
        // round(95904 * 0.5) = 47952
        expect(getAddonProrationClp(9990, 'annual', now, end)).toBe(47952)
    })

    it('alta el día del corte → mínimo 1 día (nunca $0)', () => {
        const now = new Date('2026-07-16T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // 0 días → se fuerza a 1
        const proration = getAddonProrationClp(9990, 'quarterly', now, end)
        // round(26973 * 1/90) = round(299.7) = 300
        expect(proration).toBe(300)
        expect(proration).toBeGreaterThan(0)
    })

    it('alta justo al inicio del período (corte completo por delante) topa al monto del ciclo', () => {
        const now = new Date('2026-06-01T00:00:00.000Z')
        const end = new Date('2026-09-01T00:00:00.000Z') // ~92 días → capeado a 90
        expect(getAddonProrationClp(9990, 'quarterly', now, end)).toBe(
            getAddonCycleAmountClp(9990, 'quarterly')
        )
    })

    it('nunca devuelve $0 ni negativo aunque el corte ya pasó', () => {
        const now = new Date('2026-07-20T00:00:00.000Z')
        const end = new Date('2026-07-16T00:00:00.000Z') // corte pasado → 1 día mínimo
        expect(getAddonProrationClp(9990, 'annual', now, end)).toBeGreaterThan(0)
    })
})

// ── isAddonBillable: las 4 combinaciones ─────────────────────────────────────────
describe('isAddonBillable', () => {
    it('active → factura', () => {
        expect(isAddonBillable({ status: 'active', firstChargedAt: null })).toBe(true)
        expect(isAddonBillable({ status: 'active', firstChargedAt: '2026-06-01T00:00:00Z' })).toBe(
            true
        )
    })

    it('cancel_pending sin cobrar (compromiso mínimo mensual) → factura', () => {
        expect(isAddonBillable({ status: 'cancel_pending', firstChargedAt: null })).toBe(true)
    })

    it('cancel_pending ya cobrado (regla 4) → NO factura', () => {
        expect(
            isAddonBillable({ status: 'cancel_pending', firstChargedAt: '2026-06-01T00:00:00Z' })
        ).toBe(false)
    })
})

describe('toBillableAddons', () => {
    it('excluye admin_grant y filas no facturables', () => {
        const list: CoachAddon[] = [
            makeAddon({ moduleKey: 'cardio', source: 'self_service', status: 'active' }),
            makeAddon({ moduleKey: 'body_composition', source: 'admin_grant', priceClpMensual: 0 }),
            makeAddon({
                moduleKey: 'movement_assessment',
                source: 'self_service',
                status: 'cancel_pending',
                firstChargedAt: '2026-06-01T00:00:00Z', // ya cobrado → no factura
            }),
        ]
        expect(toBillableAddons(list)).toEqual([{ moduleKey: 'cardio', priceClpMensual: 9990 }])
    })
})

// ── canPurchaseAddon (D8) ────────────────────────────────────────────────────────
describe('canPurchaseAddon', () => {
    it('coach free → no_paid_plan', () => {
        const r = canPurchaseAddon(
            {
                subscriptionTier: 'free',
                subscriptionStatus: 'active',
                isManagedByTeamOrOrg: false,
                currentPeriodEnd: null,
            },
            'cardio'
        )
        expect(r).toEqual({ allowed: false, reason: 'no_paid_plan' })
    })

    it('starter + nutrition_exchanges → requires_nutrition_tier', () => {
        const r = canPurchaseAddon(
            {
                subscriptionTier: 'starter',
                subscriptionStatus: 'active',
                isManagedByTeamOrOrg: false,
                currentPeriodEnd: null,
            },
            'nutrition_exchanges'
        )
        expect(r).toEqual({ allowed: false, reason: 'requires_nutrition_tier' })
    })

    it('starter + cardio → permitido (no exige nutrición)', () => {
        const r = canPurchaseAddon(
            {
                subscriptionTier: 'starter',
                subscriptionStatus: 'active',
                isManagedByTeamOrOrg: false,
                currentPeriodEnd: null,
            },
            'cardio'
        )
        expect(r).toEqual({ allowed: true })
    })

    it('pro + nutrition_exchanges → permitido (tier con nutrición)', () => {
        const r = canPurchaseAddon(
            {
                subscriptionTier: 'pro',
                subscriptionStatus: 'active',
                isManagedByTeamOrOrg: false,
                currentPeriodEnd: null,
            },
            'nutrition_exchanges'
        )
        expect(r).toEqual({ allowed: true })
    })

    it('coach team/org managed → managed_by_team_or_org', () => {
        const r = canPurchaseAddon(
            {
                subscriptionTier: 'pro',
                subscriptionStatus: 'active',
                isManagedByTeamOrOrg: true,
                currentPeriodEnd: null,
            },
            'cardio'
        )
        expect(r).toEqual({ allowed: false, reason: 'managed_by_team_or_org' })
    })
})

// ── Bifurcación del alta (D4) ────────────────────────────────────────────────────
describe('activateAddonForCoach — bifurcación por ciclo (D4)', () => {
    const baseCtx = {
        coachId: 'coach-1',
        coachEmail: 'coach@test.cl',
        tier: 'pro' as const,
        subscriptionMpId: 'preapproval-1',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        successUrl: 'https://app.test/coach/subscription?addon=success',
        failureUrl: 'https://app.test/coach/subscription?addon=failure',
        pendingUrl: 'https://app.test/coach/subscription?addon=pending',
        webhookUrl: 'https://app.test/api/payments/webhook?token=t',
        now: new Date('2026-06-16T00:00:00.000Z'),
    }

    it('MENSUAL → preference one-shot prorrateado SIN crear fila (converge con trim/anual)', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()

        const result = await activateAddonForCoach(
            db,
            payments,
            { ...baseCtx, cycle: 'monthly' },
            'cardio',
            'v2-2026-06'
        )

        expect(result.kind).toBe('one_shot_checkout')
        if (result.kind === 'one_shot_checkout') {
            expect(result.checkoutUrl).toBe('https://mp.test/checkout/abc')
            // prorrateo mensual usa getAddonProrationClp (totalDays = 30)
            expect(result.prorationClp).toBe(
                getAddonProrationClp(9990, 'monthly', baseCtx.now, baseCtx.currentPeriodEnd)
            )
            expect(result.cycleAmountClp).toBe(getAddonCycleAmountClp(9990, 'monthly'))
        }
        // la fila la crea el webhook al aprobarse el pago (no se inserta en el alta)
        expect(insertAddon).not.toHaveBeenCalled()
        expect(payments.createOneShotPayment).toHaveBeenCalledOnce()
        // sin PUT en el alta: el compuesto se aplica desde la próxima renovación
        expect(payments.updateCheckoutAmount).not.toHaveBeenCalled()
        // external_reference dedicado addon_oneshot|...
        expect(vi.mocked(payments.createOneShotPayment).mock.calls[0][0].externalReference).toBe(
            'addon_oneshot|coach-1|cardio|v2-2026-06'
        )
    })

    it('TRIMESTRAL → preference one-shot SIN crear fila', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()

        const result = await activateAddonForCoach(
            db,
            payments,
            { ...baseCtx, cycle: 'quarterly' },
            'cardio',
            'v2-2026-06'
        )

        expect(result.kind).toBe('one_shot_checkout')
        if (result.kind === 'one_shot_checkout') {
            expect(result.checkoutUrl).toBe('https://mp.test/checkout/abc')
            expect(result.prorationClp).toBe(
                getAddonProrationClp(9990, 'quarterly', baseCtx.now, baseCtx.currentPeriodEnd)
            )
            expect(result.cycleAmountClp).toBe(getAddonCycleAmountClp(9990, 'quarterly'))
        }
        expect(insertAddon).not.toHaveBeenCalled() // fila la crea el webhook
        expect(payments.createOneShotPayment).toHaveBeenCalledOnce()
        // external_reference dedicado addon_oneshot|...
        expect(vi.mocked(payments.createOneShotPayment).mock.calls[0][0].externalReference).toBe(
            'addon_oneshot|coach-1|cardio|v2-2026-06'
        )
    })

    it('ANUAL → preference one-shot con monto prorrateado anual', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()

        const result = await activateAddonForCoach(
            db,
            payments,
            { ...baseCtx, cycle: 'annual' },
            'cardio',
            'v2-2026-06'
        )
        expect(result.kind).toBe('one_shot_checkout')
        if (result.kind === 'one_shot_checkout') {
            expect(result.prorationClp).toBe(
                getAddonProrationClp(9990, 'annual', baseCtx.now, baseCtx.currentPeriodEnd)
            )
        }
        expect(insertAddon).not.toHaveBeenCalled()
    })
})

// ── activateAddonForCoachFlow (alta Flow síncrona, Ola 5) ────────────────────────
describe('activateAddonForCoachFlow — cambio de plan síncrono (Flow cobra la diferencia)', () => {
    const ctx = {
        coachId: 'coach-1',
        tier: 'pro' as const,
        cycle: 'monthly' as const,
        subscriptionRef: 'flow-sub-1',
        planLabel: 'Suscripción Pro Mensual (EVA)',
        webhookUrl: 'https://app.test/api/payments/flow/webhook',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        now: new Date('2026-06-16T00:00:00.000Z'),
    }

    function makeFlowProvider(over?: Partial<{ applied: boolean; chargedNowClp: number | null; creditClp: number | null }>) {
        return {
            addSubscriptionItem: vi
                .fn()
                .mockResolvedValue({ applied: true, chargedNowClp: 5161, creditClp: null, ...over }),
        }
    }

    it('llama addSubscriptionItem con el compuesto NUEVO (base + add-on) e inserta la fila YA cobrada', async () => {
        listLive.mockResolvedValue([]) // sin add-ons vivos
        insertAddon.mockResolvedValue({ id: 'addon-flow-1', moduleKey: 'cardio' } as never)
        const provider = makeFlowProvider()

        const res = await activateAddonForCoachFlow(makeDbStub().db, provider, ctx, 'cardio', 'v2-2026-06')

        // compuesto nuevo = base pro mensual + cardio mensual (ÚNICA fuente de la plata).
        const expected = getCompositeAmountClp('pro', 'monthly', [{ moduleKey: 'cardio', priceClpMensual: 9990 }])
        expect(provider.addSubscriptionItem).toHaveBeenCalledOnce()
        expect(provider.addSubscriptionItem.mock.calls[0][0]).toBe('flow-sub-1')
        expect(provider.addSubscriptionItem.mock.calls[0][1]).toMatchObject({
            tier: 'pro',
            cycle: 'monthly',
            amountClp: expected,
        })
        // fila insertada con firstChargedAt (el cobro ya ocurrió) + source self_service.
        expect(insertAddon).toHaveBeenCalledOnce()
        expect(insertAddon.mock.calls[0][1]).toMatchObject({
            coachId: 'coach-1',
            moduleKey: 'cardio',
            source: 'self_service',
            firstChargedAt: ctx.now.toISOString(),
        })
        expect(res.chargedNowClp).toBe(5161)
        expect(res.newCompositeAmountClp).toBe(expected)
        expect(res.addon.id).toBe('addon-flow-1')
    })

    it('money-safety: si addSubscriptionItem tira, NO se inserta la fila', async () => {
        listLive.mockResolvedValue([])
        const provider = {
            addSubscriptionItem: vi.fn().mockRejectedValue(new Error('Flow changePlan failed (HTTP 500)')),
        }
        await expect(
            activateAddonForCoachFlow(makeDbStub().db, provider, ctx, 'cardio', 'v2-2026-06')
        ).rejects.toThrow()
        expect(insertAddon).not.toHaveBeenCalled()
    })

    it('fallback: si Flow no reporta chargedNowClp, usa la proración server-computed', async () => {
        listLive.mockResolvedValue([])
        insertAddon.mockResolvedValue({ id: 'addon-flow-1', moduleKey: 'cardio' } as never)
        const provider = makeFlowProvider({ chargedNowClp: null })
        const res = await activateAddonForCoachFlow(makeDbStub().db, provider, ctx, 'cardio', 'v2-2026-06')
        expect(res.chargedNowClp).toBe(getAddonProrationClp(9990, 'monthly', ctx.now, ctx.currentPeriodEnd))
    })
})

// ── materializeAddonFromOneShot (webhook trim/anual) ─────────────────────────────
describe('materializeAddonFromOneShot', () => {
    const ctx = {
        coachId: 'coach-1',
        tier: 'pro' as const,
        cycle: 'quarterly' as const,
        subscriptionMpId: 'preapproval-1',
    }

    it('crea la fila con first_charged_at = fecha del pago y ejecuta el PUT', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()
        listLive.mockResolvedValueOnce([]) // no existe fila viva aún
        const created = makeAddon({
            moduleKey: 'cardio',
            firstChargedAt: '2026-06-20T00:00:00.000Z',
        })
        insertAddon.mockResolvedValue(created)
        listLive.mockResolvedValueOnce([created]) // tras el insert

        const result = await materializeAddonFromOneShot(
            db,
            payments,
            ctx,
            'cardio',
            'v2-2026-06',
            '2026-06-20T00:00:00.000Z'
        )

        expect(insertAddon).toHaveBeenCalledOnce()
        expect(insertAddon.mock.calls[0][1]).toMatchObject({
            firstChargedAt: '2026-06-20T00:00:00.000Z',
        })
        expect(result.addon).toEqual(created)
        expect(payments.updateCheckoutAmount).toHaveBeenCalledOnce()
    })

    it('idempotente: si ya hay fila viva del módulo (doble clic), no inserta otra', async () => {
        const { db } = makeDbStub()
        const payments = makePaymentsStub()
        const existing = makeAddon({
            moduleKey: 'cardio',
            firstChargedAt: '2026-06-20T00:00:00.000Z',
        })
        listLive.mockResolvedValue([existing]) // ya existe en ambas lecturas

        const result = await materializeAddonFromOneShot(
            db,
            payments,
            ctx,
            'cardio',
            'v2-2026-06',
            '2026-06-21T00:00:00.000Z'
        )

        expect(insertAddon).not.toHaveBeenCalled()
        expect(result.addon).toEqual(existing)
    })
})

// ── Baja: máquina de estados (reglas 3-4) + date-math ────────────────────────────
describe('requestAddonCancellation', () => {
    const ctx = {
        coachId: 'coach-1',
        tier: 'pro' as const,
        cycle: 'monthly' as const,
        subscriptionMpId: 'preapproval-1',
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        now: new Date('2026-06-16T00:00:00.000Z'),
    }

    it('mensual, baja ANTES del 1er cobro (compromiso) → cancel_pending SIN PUT, sin expires_at', async () => {
        const payments = makePaymentsStub()
        const live = makeAddon({ moduleKey: 'cardio', status: 'active', firstChargedAt: null })
        listLive.mockResolvedValue([live])
        requestCancel.mockResolvedValue(
            makeAddon({ ...live, status: 'cancel_pending', cancelRequestedAt: ctx.now.toISOString() })
        )

        const result = await requestAddonCancellation({} as never, payments, ctx, 'cardio')

        expect(result.putApplied).toBe(false)
        expect(result.effectiveAt).toBeNull()
        // expires_at diferido (null): se fija recién al primer cobro
        expect(requestCancel.mock.calls[0][2]).toMatchObject({ expiresAt: null })
        expect(payments.updateCheckoutAmount).not.toHaveBeenCalled()
        // sigue facturable mientras cancel_pending + first_charged_at null
        expect(isAddonBillable({ status: 'cancel_pending', firstChargedAt: null })).toBe(true)
    })

    it('baja DESPUÉS del 1er cobro (regla 4) → cancel_pending + PUT YA + expires_at al corte', async () => {
        const payments = makePaymentsStub()
        const live = makeAddon({
            moduleKey: 'cardio',
            status: 'active',
            firstChargedAt: '2026-06-01T00:00:00.000Z',
        })
        listLive.mockResolvedValueOnce([live]) // antes de la baja
        requestCancel.mockResolvedValue(
            makeAddon({ ...live, status: 'cancel_pending' })
        )
        // tras la baja: el add-on queda cancel_pending YA cobrado → deja de facturar
        listLive.mockResolvedValueOnce([
            makeAddon({
                ...live,
                status: 'cancel_pending',
                firstChargedAt: '2026-06-01T00:00:00.000Z',
            }),
        ])

        const result = await requestAddonCancellation({} as never, payments, ctx, 'cardio')

        expect(result.putApplied).toBe(true)
        expect(result.effectiveAt).toBe('2026-07-01T00:00:00.000Z')
        expect(requestCancel.mock.calls[0][2]).toMatchObject({
            expiresAt: '2026-07-01T00:00:00.000Z',
        })
        // PUT con el monto SIN el add-on de baja (solo la base del tier). Sin cupón vivo → 3er arg
        // (idempotency key) undefined.
        expect(payments.updateCheckoutAmount).toHaveBeenCalledWith(
            'preapproval-1',
            getTierPriceClp('pro', 'monthly'),
            undefined
        )
    })

    it('trim/anual va SIEMPRE por regla 4 (one-shot ya seteó first_charged_at)', async () => {
        const payments = makePaymentsStub()
        const annualCtx = { ...ctx, cycle: 'annual' as const }
        const live = makeAddon({
            moduleKey: 'cardio',
            status: 'active',
            firstChargedAt: '2026-06-20T00:00:00.000Z', // seteado por el one-shot
        })
        listLive.mockResolvedValueOnce([live])
        requestCancel.mockResolvedValue(makeAddon({ ...live, status: 'cancel_pending' }))
        listLive.mockResolvedValueOnce([
            makeAddon({ ...live, status: 'cancel_pending' }),
        ])

        const result = await requestAddonCancellation({} as never, payments, annualCtx, 'cardio')
        expect(result.putApplied).toBe(true)
        expect(result.effectiveAt).toBe('2026-07-01T00:00:00.000Z')
    })

    it('lanza si no hay add-on activo del módulo', async () => {
        const payments = makePaymentsStub()
        listLive.mockResolvedValue([])
        await expect(
            requestAddonCancellation({} as never, payments, ctx, 'cardio')
        ).rejects.toThrow(/módulo/)
    })

    // ── B5: coach FLOW, baja regla 4 → NO changePlan-DOWN inmediato (se difiere al corte via cron) ──
    it('regla 4 coach FLOW → cancel_pending + expires_at al corte, SIN updateCheckoutAmount inmediato', async () => {
        const payments = makePaymentsStub()
        const live = makeAddon({
            moduleKey: 'cardio',
            status: 'active',
            firstChargedAt: '2026-06-01T00:00:00.000Z',
        })
        listLive.mockResolvedValueOnce([live])
        requestCancel.mockResolvedValue(makeAddon({ ...live, status: 'cancel_pending' }))

        const result = await requestAddonCancellation(
            {} as never,
            payments,
            { ...ctx, provider: 'flow', subscriptionMpId: 'flow-sub-1' },
            'cardio'
        )

        // Fila igual que MP: cancel_pending + expires_at al corte.
        expect(result.status).toBe('cancel_pending')
        expect(result.effectiveAt).toBe('2026-07-01T00:00:00.000Z')
        expect(requestCancel.mock.calls[0][2]).toMatchObject({ expiresAt: '2026-07-01T00:00:00.000Z' })
        // CRÍTICO money-safety: NO se baja el monto de la sub Flow ahora (bajarlo mid-ciclo acreditaria
        // el ciclo ya cobrado → viola regla 4). El changePlan-down corre DIFERIDO en el cron.
        expect(payments.updateCheckoutAmount).not.toHaveBeenCalled()
        expect(result.putApplied).toBe(false)
    })

    it('regla 4 coach MP (provider mercadopago explícito) → PUT inmediato (sin regresion)', async () => {
        const payments = makePaymentsStub()
        const live = makeAddon({
            moduleKey: 'cardio',
            status: 'active',
            firstChargedAt: '2026-06-01T00:00:00.000Z',
        })
        listLive.mockResolvedValueOnce([live])
        requestCancel.mockResolvedValue(makeAddon({ ...live, status: 'cancel_pending' }))
        listLive.mockResolvedValueOnce([]) // liveAfter: sin add-ons → solo la base

        const result = await requestAddonCancellation(
            {} as never,
            payments,
            { ...ctx, provider: 'mercadopago' },
            'cardio'
        )

        expect(payments.updateCheckoutAmount).toHaveBeenCalledWith(
            'preapproval-1',
            getTierPriceClp('pro', 'monthly'),
            undefined
        )
        expect(result.putApplied).toBe(true)
    })
})

// ── Cupón vivo: el descuento se HONRA en los add-ons (no se pierde la base) ──────
describe('add-ons con cupón vivo (descuento honrado)', () => {
    const SPEC: DiscountSpec = { type: 'percent', value: 50, target: 'total', remainingCycles: null }

    describe('applyCouponToAddonProration (matriz tipo/target)', () => {
        it('percent + total → descuenta la proración', () => {
            expect(applyCouponToAddonProration(4995, 'cardio', SPEC)).toBe(4995 - Math.round(4995 * 0.5))
        })
        it('percent + base → NO descuenta (base no toca add-ons)', () => {
            expect(
                applyCouponToAddonProration(4995, 'cardio', { type: 'percent', value: 50, target: 'base', remainingCycles: null })
            ).toBe(4995)
        })
        it('fixed_clp → NO descuenta el one-shot', () => {
            expect(
                applyCouponToAddonProration(4995, 'cardio', { type: 'fixed_clp', value: 3000, target: 'total', remainingCycles: null })
            ).toBe(4995)
        })
        it('percent + module con key match → descuenta; sin match → no', () => {
            const modSpec: DiscountSpec = { type: 'percent', value: 50, target: 'module', moduleKeys: ['cardio'], remainingCycles: null }
            expect(applyCouponToAddonProration(4995, 'cardio', modSpec)).toBe(4995 - Math.round(4995 * 0.5))
            expect(applyCouponToAddonProration(4995, 'body_composition', modSpec)).toBe(4995)
        })
        it('null → sin cambio', () => {
            expect(applyCouponToAddonProration(4995, 'cardio', null)).toBe(4995)
        })
    })

    it('materialize CON cupón 50%/total → PUT del composite DESCONTADO + idempotency key', async () => {
        resolveActiveDiscountSpec.mockResolvedValue(SPEC)
        const { db } = makeDbStub()
        const payments = makePaymentsStub()
        listLive.mockResolvedValueOnce([]).mockResolvedValueOnce([makeAddon({ moduleKey: 'cardio' })])
        insertAddon.mockResolvedValue(makeAddon({ moduleKey: 'cardio' }))
        await materializeAddonFromOneShot(
            db,
            payments,
            { coachId: 'coach-1', tier: 'pro', cycle: 'monthly', subscriptionMpId: 'pre-1' },
            'cardio',
            'v2-2026-06',
            '2026-06-24T00:00:00.000Z'
        )
        const full = getTierPriceClp('pro', 'monthly') + 9990
        const discounted = full - Math.round(full * 0.5)
        expect(payments.updateCheckoutAmount).toHaveBeenCalledWith('pre-1', discounted, `coupon-amt|coach-1|${discounted}`)
    })

    it('activate CON cupón 50%/total → proración descontada al one-shot', async () => {
        resolveActiveDiscountSpec.mockResolvedValue(SPEC)
        const { db } = makeDbStub()
        const createOneShotPayment = vi.fn().mockResolvedValue({ checkoutUrl: 'https://mp.test/x' })
        const payments = makePaymentsStub({ createOneShotPayment })
        const now = new Date('2026-06-16T00:00:00.000Z')
        const currentPeriodEnd = new Date('2026-07-01T00:00:00.000Z')
        const res = await activateAddonForCoach(
            db,
            payments,
            {
                coachId: 'coach-1', coachEmail: 'a@b.cl', tier: 'pro', cycle: 'monthly',
                subscriptionMpId: 'pre-1', currentPeriodEnd,
                successUrl: 's', failureUrl: 'f', pendingUrl: 'p', webhookUrl: 'w', now,
            },
            'cardio',
            'v2-2026-06'
        )
        const full = getAddonProrationClp(9990, 'monthly', now, currentPeriodEnd)
        const expected = applyCouponToAddonProration(full, 'cardio', SPEC)
        expect(expected).toBeLessThan(full)
        expect(res.prorationClp).toBe(expected)
        expect(createOneShotPayment).toHaveBeenCalledWith(expect.objectContaining({ amountClp: expected }))
    })

    it('cancel regla 4 CON cupón → PUT-down DESCONTADO (la base conserva el 50%)', async () => {
        resolveActiveDiscountSpec.mockResolvedValue(SPEC)
        const payments = makePaymentsStub()
        const cardio = makeAddon({ moduleKey: 'cardio', status: 'active', firstChargedAt: '2026-06-01T00:00:00.000Z' })
        listLive.mockResolvedValueOnce([cardio]) // live: encuentra el add-on a bajar
        requestCancel.mockResolvedValue(makeAddon({ ...cardio, status: 'cancel_pending' }))
        listLive.mockResolvedValueOnce([]) // liveAfter: sin add-ons → solo la base
        await requestAddonCancellation(
            {} as never,
            payments,
            { coachId: 'coach-1', tier: 'pro', cycle: 'monthly', subscriptionMpId: 'pre-1', currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z') },
            'cardio'
        )
        const base = getTierPriceClp('pro', 'monthly')
        const discounted = base - Math.round(base * 0.5)
        expect(payments.updateCheckoutAmount).toHaveBeenCalledWith('pre-1', discounted, `coupon-amt|coach-1|${discounted}`)
    })
})

// ── Override del CEO: write-through admin_grant (D2 / F6.1) ───────────────────────
describe('syncAdminGrants — write-through del override del CEO', () => {
    it('otorga (INSERT admin_grant price 0) los módulos ON sin grant vivo', async () => {
        listLive.mockResolvedValue([]) // sin grants
        insertAddon.mockResolvedValue(makeAddon({ source: 'admin_grant', priceClpMensual: 0 }))

        const result = await syncAdminGrants({} as never, 'coach-1', {
            cardio: true,
            movement_assessment: false,
            body_composition: true,
            nutrition_exchanges: false,
        })

        expect(result.granted.sort()).toEqual(['body_composition', 'cardio'])
        expect(result.revoked).toEqual([])
        expect(insertAddon).toHaveBeenCalledTimes(2)
        // cortesía: source admin_grant, price 0, terms sentinela
        expect(insertAddon.mock.calls[0][1]).toMatchObject({
            source: 'admin_grant',
            priceClpMensual: 0,
            termsVersion: ADMIN_GRANT_TERMS_VERSION,
        })
        expect(revokeAdminGrant).not.toHaveBeenCalled()
    })

    it('retira (cancel duro) los módulos OFF con grant vivo', async () => {
        listLive.mockResolvedValue([
            makeAddon({ moduleKey: 'cardio', source: 'admin_grant', priceClpMensual: 0 }),
            makeAddon({ moduleKey: 'body_composition', source: 'admin_grant', priceClpMensual: 0 }),
        ])
        revokeAdminGrant.mockResolvedValue(null)

        const result = await syncAdminGrants({} as never, 'coach-1', {
            cardio: true, // ya tiene grant → no-op
            movement_assessment: false,
            body_composition: false, // tiene grant → revoke
            nutrition_exchanges: false,
        })

        expect(result.granted).toEqual([])
        expect(result.revoked).toEqual(['body_composition'])
        expect(insertAddon).not.toHaveBeenCalled()
        expect(revokeAdminGrant).toHaveBeenCalledOnce()
        expect(revokeAdminGrant.mock.calls[0][2]).toBe('body_composition')
    })

    it('idempotente: mismo deseado que el estado vivo → cero escrituras', async () => {
        listLive.mockResolvedValue([
            makeAddon({ moduleKey: 'cardio', source: 'admin_grant', priceClpMensual: 0 }),
        ])

        const result = await syncAdminGrants({} as never, 'coach-1', {
            cardio: true,
            movement_assessment: false,
            body_composition: false,
            nutrition_exchanges: false,
        })

        expect(result).toEqual({ granted: [], revoked: [] })
        expect(insertAddon).not.toHaveBeenCalled()
        expect(revokeAdminGrant).not.toHaveBeenCalled()
    })

    it('NO toca filas self_service: retirar la cortesía no cancela un add-on pago', async () => {
        listLive.mockResolvedValue([
            // el coach PAGA cardio (self_service) — no es un grant
            makeAddon({ moduleKey: 'cardio', source: 'self_service', priceClpMensual: 9990 }),
        ])

        const result = await syncAdminGrants({} as never, 'coach-1', {
            cardio: false, // OFF, pero NO hay grant vivo de cardio → no se revoca nada
            movement_assessment: false,
            body_composition: false,
            nutrition_exchanges: false,
        })

        expect(result).toEqual({ granted: [], revoked: [] })
        expect(revokeAdminGrant).not.toHaveBeenCalled()
        expect(insertAddon).not.toHaveBeenCalled()
    })
})
