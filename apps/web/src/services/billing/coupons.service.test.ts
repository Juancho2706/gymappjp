import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/infrastructure/db/coupon-redemptions.repository', () => ({
    findActiveCouponByCode: vi.fn(),
    claimCouponCapacity: vi.fn(),
    releaseCouponCapacity: vi.fn(),
    countRedemptionsForAccount: vi.fn(),
    insertRedemption: vi.fn(),
}))

import * as repo from '@/infrastructure/db/coupon-redemptions.repository'
import { redeemCoupon, formatCouponTermsText } from './coupons.service'
import type { CouponCatalogRow } from '@/infrastructure/db/coupon-redemptions.repository'

const findActiveCouponByCode = vi.mocked(repo.findActiveCouponByCode)
const claimCouponCapacity = vi.mocked(repo.claimCouponCapacity)
const releaseCouponCapacity = vi.mocked(repo.releaseCouponCapacity)
const countRedemptionsForAccount = vi.mocked(repo.countRedemptionsForAccount)
const insertRedemption = vi.mocked(repo.insertRedemption)

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
