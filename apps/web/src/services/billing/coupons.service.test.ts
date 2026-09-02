import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/infrastructure/db/coupon-redemptions.repository', () => ({
    findActiveCouponByCode: vi.fn(),
    claimCouponCapacity: vi.fn(),
    releaseCouponCapacity: vi.fn(),
    countRedemptionsForAccount: vi.fn(),
    insertRedemption: vi.fn(),
    getAllowlistStatus: vi.fn(),
    insertCouponAllowedEmails: vi.fn(),
}))

import * as repo from '@/infrastructure/db/coupon-redemptions.repository'
import {
    redeemCoupon,
    formatCouponTermsText,
    decrementCouponCycleForCharge,
    revertActiveCouponForCoach,
    sweepAbandonedSignupCoupons,
} from './coupons.service'
import type { CouponCatalogRow } from '@/infrastructure/db/coupon-redemptions.repository'

const findActiveCouponByCode = vi.mocked(repo.findActiveCouponByCode)
const claimCouponCapacity = vi.mocked(repo.claimCouponCapacity)
const releaseCouponCapacity = vi.mocked(repo.releaseCouponCapacity)
const countRedemptionsForAccount = vi.mocked(repo.countRedemptionsForAccount)
const insertRedemption = vi.mocked(repo.insertRedemption)
const getAllowlistStatus = vi.mocked(repo.getAllowlistStatus)

function makeRow(over: Partial<CouponCatalogRow> = {}): CouponCatalogRow {
    return {
        codeId: 'code-1',
        couponId: 'coupon-1',
        codeNormalized: 'PARTNER20',
        codeDisplay: 'PARTNER20',
        active: true,
        expiresAt: null,
        maxRedemptions: 100,
        redeemedCount: 0,
        perAccountLimit: 1,
        firstTimeOnly: false,
        minAmountClp: null,
        restrictedToCoachId: null,
        discountType: 'percent',
        percentValue: 20,
        amountOffClp: null,
        fixedClpTarget: 'total',
        appliesToScope: {},
        duration: 'repeating',
        durationInCycles: 3,
        redeemBy: null,
        floorClp: null,
        ...over,
    }
}

const baseInput = {
    code: 'partner-20',
    coachId: 'coach-1',
    coachEmail: 'coach@test.cl',
    tier: 'pro' as const,
    cycle: 'monthly' as const,
    billable: [],
    sourceIp: '1.2.3.4',
    couponTermsText: null,
    couponTermsVersion: null,
}

beforeEach(() => {
    vi.clearAllMocks()
    countRedemptionsForAccount.mockResolvedValue(0)
    claimCouponCapacity.mockResolvedValue(true)
    insertRedemption.mockResolvedValue({ ok: true, redemptionId: 'redemption-1' })
    getAllowlistStatus.mockResolvedValue({ hasAllowlist: false, allowed: true }) // sin allowlist = abierto
})

describe('redeemCoupon', () => {
    it('happy path: 20% total → escribe redención + preview descontado', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow())
        const r = await redeemCoupon({} as never, baseInput)
        expect(r.ok).toBe(true)
        if (r.ok) {
            expect(r.redemptionId).toBe('redemption-1')
            expect(r.preview.discountClp).toBeGreaterThan(0)
            expect(r.preview.totalClp).toBeLessThan(r.preview.baseBeforeDiscountClp)
            expect(r.preview.couponCode).toBe('PARTNER20')
        }
        expect(claimCouponCapacity).toHaveBeenCalledOnce()
        expect(insertRedemption).toHaveBeenCalledOnce()
        // persiste evidencia SERNAC (terms text construido server-side)
        expect(insertRedemption.mock.calls[0][1].couponTermsText).toMatch(/PARTNER20/)
    })

    it('allowlist: correo NO habilitado → NOT_ELIGIBLE, sin claim', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow())
        getAllowlistStatus.mockResolvedValue({ hasAllowlist: true, allowed: false })
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' })
        expect(claimCouponCapacity).not.toHaveBeenCalled()
    })

    it('allowlist: correo habilitado → canjea normal', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow())
        getAllowlistStatus.mockResolvedValue({ hasAllowlist: true, allowed: true })
        const r = await redeemCoupon({} as never, baseInput)
        expect(r.ok).toBe(true)
    })

    it('código inexistente → CODE_NOT_FOUND, sin claim', async () => {
        findActiveCouponByCode.mockResolvedValue(null)
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'CODE_NOT_FOUND' })
        expect(claimCouponCapacity).not.toHaveBeenCalled()
    })

    it('expirado → EXPIRED', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ expiresAt: '2020-01-01T00:00:00Z' }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'EXPIRED' })
    })

    it('restringido a otro coach → NOT_ELIGIBLE', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ restrictedToCoachId: 'otro-coach' }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' })
    })

    // Pricing v2 (C2 — decisión pendiente #4 del dueño): starter salió de la venta. Un cupón HISTÓRICO
    // emitido SOLO para starter se rechaza con mensaje claro (no el genérico de scope); uno mixto sigue
    // canjeable para sus tiers vigentes.
    it('Pricing v2 (C2): cupón histórico SOLO-starter → NOT_ELIGIBLE con mensaje claro, sin claim', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ appliesToScope: { tiers: ['starter'] } }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' })
        if (!r.ok) {
            // Mensaje es-CL específico (menciona Starter y que ya no está a la venta), no el genérico.
            expect(r.message).toMatch(/Starter/)
            expect(r.message).toMatch(/ya no está a la venta/)
        }
        expect(claimCouponCapacity).not.toHaveBeenCalled()
        expect(insertRedemption).not.toHaveBeenCalled()
    })

    it('Pricing v2 (C2): cupón mixto starter+pro canjeado para pro → sigue canjeable', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ appliesToScope: { tiers: ['starter', 'pro'] } }))
        const r = await redeemCoupon({} as never, baseInput) // baseInput.tier = 'pro'
        expect(r.ok).toBe(true)
    })

    it('scope de tier que NO incluye el tier del canje (solo elite vs coach pro) → NOT_ELIGIBLE genérico', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ appliesToScope: { tiers: ['elite'] } }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' })
        if (!r.ok) expect(r.message).toBe('El código no aplica a tu plan actual.')
    })

    it('target=module → MODULE_DEFERRED (F2b diferido)', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ fixedClpTarget: 'module' }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'MODULE_DEFERRED' })
    })

    it('per_account_limit alcanzado → ALREADY_REDEEMED, sin claim', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ perAccountLimit: 1 }))
        countRedemptionsForAccount.mockResolvedValue(1)
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'ALREADY_REDEEMED' })
        expect(claimCouponCapacity).not.toHaveBeenCalled()
    })

    it('cap global lleno → CAP_REACHED', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow())
        claimCouponCapacity.mockResolvedValue(false)
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'CAP_REACHED' })
        expect(insertRedemption).not.toHaveBeenCalled()
    })

    it('100% off (neto 0) → NET_NOT_CHARGEABLE (va por admin_grant)', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ percentValue: 100 }))
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'NET_NOT_CHARGEABLE' })
        expect(claimCouponCapacity).not.toHaveBeenCalled()
    })

    it('INSERT falla (carrera) → compensa el cap (release) + propaga el código', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow())
        insertRedemption.mockResolvedValue({ ok: false, code: 'ALREADY_REDEEMED', message: 'dup' })
        const r = await redeemCoupon({} as never, baseInput)
        expect(r).toMatchObject({ ok: false, code: 'ALREADY_REDEEMED' })
        expect(releaseCouponCapacity).toHaveBeenCalledWith({}, 'code-1')
    })

    it('first_time_only → persiste normalized_email', async () => {
        findActiveCouponByCode.mockResolvedValue(makeRow({ firstTimeOnly: true }))
        await redeemCoupon({} as never, { ...baseInput, coachEmail: 'John.Doe+promo@gmail.com' })
        expect(insertRedemption.mock.calls[0][1].normalizedEmail).toBe('johndoe@gmail.com')
    })
})

// db mock para el lifecycle (resolveActiveDiscountDetail + decrement/revert).
function makeLifecycleDb(opts: {
    activeRedemptionId: string | null
    redemption?: { status: string; applied_cycles_remaining: number | null; snapshot?: Record<string, unknown> }
    decrementInsertError?: { message: string } | null
}) {
    const updates: Array<Record<string, unknown>> = []
    const decrementInserts: Array<Record<string, unknown>> = []
    const db = {
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { active_coupon_redemption_id: opts.activeRedemptionId },
                                error: null,
                            }),
                        }),
                    }),
                }
            }
            if (table === 'coupon_redemptions') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () =>
                                opts.redemption
                                    ? {
                                          data: {
                                              status: opts.redemption.status,
                                              discount_value_snapshot: opts.redemption.snapshot ?? {
                                                  type: 'percent',
                                                  value: 20,
                                                  target: 'total',
                                              },
                                              applied_cycles_remaining: opts.redemption.applied_cycles_remaining,
                                          },
                                          error: null,
                                      }
                                    : { data: null, error: null },
                        }),
                    }),
                    update: (patch: Record<string, unknown>) => {
                        updates.push(patch)
                        return { eq: () => ({ eq: async () => ({ error: null }) }), then: undefined }
                    },
                }
            }
            if (table === 'coupon_cycle_decrements') {
                return {
                    insert: async () => {
                        decrementInserts.push({})
                        return { error: opts.decrementInsertError ?? null }
                    },
                }
            }
            return {}
        }),
    }
    // El update de coupon_redemptions en decrement usa .update().eq() (1 eq); revert usa .update().eq().eq().
    // Normalizamos: el primer eq devuelve un thenable que también expone eq.
    return { db: db as never, updates, decrementInserts }
}

describe('decrementCouponCycleForCharge', () => {
    it('forever (applied_cycles_remaining null) → no decrementa', async () => {
        const { db, updates } = makeLifecycleDb({
            activeRedemptionId: 'r1',
            redemption: { status: 'active', applied_cycles_remaining: null },
        })
        const r = await decrementCouponCycleForCharge(db, 'coach-1', 'pay-1')
        expect(r).toEqual({ decremented: false, expired: false })
        expect(updates).toHaveLength(0)
    })
    it('sin cupón vivo → no-op', async () => {
        const { db } = makeLifecycleDb({ activeRedemptionId: null })
        const r = await decrementCouponCycleForCharge(db, 'coach-1', 'pay-1')
        expect(r).toEqual({ decremented: false, expired: false })
    })
    it('repeating con 3 ciclos → decrementa a 2, sigue active', async () => {
        const { db, updates } = makeLifecycleDb({
            activeRedemptionId: 'r1',
            redemption: { status: 'active', applied_cycles_remaining: 3 },
        })
        const r = await decrementCouponCycleForCharge(db, 'coach-1', 'pay-1')
        expect(r).toEqual({ decremented: true, expired: false })
        expect(updates[0]).toMatchObject({ applied_cycles_remaining: 2, status: 'active' })
    })
    it('último ciclo (1 → 0) → expira', async () => {
        const { db, updates } = makeLifecycleDb({
            activeRedemptionId: 'r1',
            redemption: { status: 'active', applied_cycles_remaining: 1 },
        })
        const r = await decrementCouponCycleForCharge(db, 'coach-1', 'pay-1')
        expect(r).toEqual({ decremented: true, expired: true })
        expect(updates[0]).toMatchObject({ applied_cycles_remaining: 0, status: 'expired' })
    })
    it('reentrega (insert companion duplicado) → idempotente, no decrementa', async () => {
        const { db, updates } = makeLifecycleDb({
            activeRedemptionId: 'r1',
            redemption: { status: 'active', applied_cycles_remaining: 3 },
            decrementInsertError: { message: 'duplicate key value violates unique constraint' },
        })
        const r = await decrementCouponCycleForCharge(db, 'coach-1', 'pay-1')
        expect(r).toEqual({ decremented: false, expired: false })
        expect(updates).toHaveLength(0)
    })
})

describe('revertActiveCouponForCoach', () => {
    it('con cupón vivo → marca reverted', async () => {
        const { db } = makeLifecycleDb({ activeRedemptionId: 'r1' })
        const r = await revertActiveCouponForCoach(db, 'coach-1')
        expect(r).toEqual({ reverted: true })
    })
    it('sin cupón vivo → no-op', async () => {
        const { db } = makeLifecycleDb({ activeRedemptionId: null })
        const r = await revertActiveCouponForCoach(db, 'coach-1')
        expect(r).toEqual({ reverted: false })
    })
})

describe('formatCouponTermsText', () => {
    it('incluye precio con/sin descuento + duración; variante de por vida omite reversión', () => {
        const finite = formatCouponTermsText({
            code: 'X', discountClp: 6000, totalClp: 24000, normalClp: 30000, durationLabel: 'por 3 ciclo(s)', isLifetime: false,
        })
        expect(finite).toMatch(/vuelve a/)
        const lifetime = formatCouponTermsText({
            code: 'X', discountClp: 6000, totalClp: 24000, normalClp: 30000, durationLabel: 'de por vida', isLifetime: true,
        })
        expect(lifetime).not.toMatch(/vuelve a/)
    })
})

// ── sweepAbandonedSignupCoupons (hotfix 2026-09-01) ──────────────────────────────
// En Flow subscription_mp_id es SIEMPRE null (create-preference lo nulea), así que el barrido no puede
// usar esa columna como prueba de "nunca pagó". Reglas del owner: Flow con tarjeta enrolada NO se toca,
// y quien ya pagó alguna vez (≥1 billing_snapshots) tampoco.
type SweepCoachRow = {
    id: string
    active_coupon_redemption_id: string | null
    payment_provider: string
    provider_customer_id: string | null
}

function makeSweepDb(opts: {
    coaches?: SweepCoachRow[]
    coachesError?: { message: string } | null
    snapshotsByCoach?: Record<string, Array<{ id: string }>>
    snapshotsError?: { message: string } | null
    couponCodeId?: string | null
}) {
    const audits: Array<Record<string, unknown>> = []
    const db = {
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                const result = {
                    data: opts.coachesError ? null : opts.coaches ?? [],
                    error: opts.coachesError ?? null,
                }
                return {
                    select: () => ({
                        not: () => ({
                            eq: () => ({
                                is: () => ({
                                    lt: async () => result,
                                }),
                            }),
                        }),
                    }),
                }
            }
            if (table === 'billing_snapshots') {
                return {
                    select: () => ({
                        eq: (_col: string, coachId: string) => ({
                            limit: async () =>
                                opts.snapshotsError
                                    ? { data: null, error: opts.snapshotsError }
                                    : { data: opts.snapshotsByCoach?.[coachId] ?? [], error: null },
                        }),
                    }),
                }
            }
            if (table === 'coupon_redemptions') {
                return {
                    select: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { coupon_code_id: opts.couponCodeId ?? 'code-1' },
                                error: null,
                            }),
                        }),
                    }),
                }
            }
            if (table === 'admin_audit_logs') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        audits.push(row)
                        return { error: null }
                    },
                }
            }
            return {}
        }),
    }
    return { db: db as never, audits }
}

function sweepCoach(over: Partial<SweepCoachRow> = {}): SweepCoachRow {
    return {
        id: 'coach-1',
        active_coupon_redemption_id: 'r1',
        payment_provider: 'mercadopago',
        provider_customer_id: null,
        ...over,
    }
}

describe('sweepAbandonedSignupCoupons', () => {
    it('Flow CON provider_customer_id y sin snapshots → NO revierte (tarjeta enrolada, no es abandono)', async () => {
        const revert = vi.fn().mockResolvedValue({ reverted: true })
        const { db, audits } = makeSweepDb({
            coaches: [sweepCoach({ payment_provider: 'flow', provider_customer_id: 'cus_qc1ad190f3' })],
        })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 0, skipped: 1 })
        expect(revert).not.toHaveBeenCalled()
        expect(releaseCouponCapacity).not.toHaveBeenCalled()
        expect(audits).toHaveLength(0)
    })

    it('Flow SIN provider_customer_id y sin snapshots → SÍ revierte + libera cap + audita', async () => {
        const revert = vi.fn().mockResolvedValue({ reverted: true })
        const { db, audits } = makeSweepDb({
            coaches: [sweepCoach({ payment_provider: 'flow', provider_customer_id: null })],
            couponCodeId: 'code-9',
        })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 1, skipped: 0 })
        expect(revert).toHaveBeenCalledWith(db, 'coach-1')
        expect(releaseCouponCapacity).toHaveBeenCalledWith(db, 'code-9')
        expect(audits[0]).toMatchObject({
            admin_email: 'cron',
            action: 'coach.coupon_signup_abandoned',
            target_table: 'coupon_redemptions',
            target_id: 'r1',
        })
    })

    it('regresión caso original: MercadoPago sin snapshots → SÍ revierte', async () => {
        const revert = vi.fn().mockResolvedValue({ reverted: true })
        const { db } = makeSweepDb({ coaches: [sweepCoach()] })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 1, skipped: 0 })
        expect(revert).toHaveBeenCalledOnce()
    })

    it('MercadoPago CON 1 billing_snapshot → NO revierte (ya pagó alguna vez)', async () => {
        const revert = vi.fn().mockResolvedValue({ reverted: true })
        const { db, audits } = makeSweepDb({
            coaches: [sweepCoach()],
            snapshotsByCoach: { 'coach-1': [{ id: 'snap-1' }] },
        })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 0, skipped: 1 })
        expect(revert).not.toHaveBeenCalled()
        expect(releaseCouponCapacity).not.toHaveBeenCalled()
        expect(audits).toHaveLength(0)
    })

    it('fail-closed: si la consulta a billing_snapshots falla → NO revierte (no se puede afirmar "nunca pagó")', async () => {
        const revert = vi.fn().mockResolvedValue({ reverted: true })
        const { db, audits } = makeSweepDb({ coaches: [sweepCoach()], snapshotsError: { message: 'timeout' } })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 0, skipped: 1 })
        expect(revert).not.toHaveBeenCalled()
        expect(audits).toHaveLength(0)
    })

    it('query de coaches falla → {0,0} sin throw', async () => {
        const revert = vi.fn()
        const { db } = makeSweepDb({ coachesError: { message: 'boom' } })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 0, skipped: 0 })
        expect(revert).not.toHaveBeenCalled()
    })

    it('best-effort: si el revert de un coach lanza, el otro igual se procesa', async () => {
        const revert = vi.fn(async (_db: unknown, coachId: string) => {
            if (coachId === 'coach-1') throw new Error('revert boom')
            return { reverted: true }
        })
        const { db, audits } = makeSweepDb({
            coaches: [sweepCoach({ id: 'coach-1' }), sweepCoach({ id: 'coach-2', active_coupon_redemption_id: 'r2' })],
        })
        const r = await sweepAbandonedSignupCoupons(db, new Date('2026-09-02T01:00:00Z'), {
            revert: revert as never,
            release: releaseCouponCapacity,
        })
        expect(r).toEqual({ signupAbandoned: 1, skipped: 0 })
        expect(revert).toHaveBeenCalledTimes(2)
        expect(audits).toHaveLength(1)
        expect(audits[0]).toMatchObject({ target_id: 'r2' })
    })
})
