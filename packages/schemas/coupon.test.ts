import { describe, it, expect } from 'vitest'
import { COUPON_TIERS, CreateCouponAdminSchema, RedeemCouponSchema } from './coupon'

// Pricing v2 (specs/pricing-v2, C2): starter salió de la VENTA. La EMISIÓN nueva de cupones ya no
// puede scopearlo (COUPON_TIERS) y el previewTier del canje tampoco lo acepta. El CANJE de un cupón
// starter HISTÓRICO se rechaza con mensaje claro en coupons.service (decisión pendiente #4 del dueño;
// sus tests viven en apps/web/src/services/billing/coupons.service.test.ts).

const VALID_EMISSION = {
    discountType: 'percent' as const,
    percentValue: 20,
    duration: 'once' as const,
}

describe('COUPON_TIERS (pricing v2 — starter fuera de emisión)', () => {
    it('solo ofrece los tiers pagos EN VENTA (pro/elite), sin starter', () => {
        expect([...COUPON_TIERS]).toEqual(['pro', 'elite'])
    })
})

describe('CreateCouponAdminSchema — scopeTiers sin starter', () => {
    it('rechaza una emisión nueva con scopeTiers que incluya starter', () => {
        const r = CreateCouponAdminSchema.safeParse({
            ...VALID_EMISSION,
            scopeTiers: ['starter'],
        })
        expect(r.success).toBe(false)
    })

    it('rechaza starter también mezclado con tiers válidos (no se filtra en silencio)', () => {
        const r = CreateCouponAdminSchema.safeParse({
            ...VALID_EMISSION,
            scopeTiers: ['starter', 'pro'],
        })
        expect(r.success).toBe(false)
    })

    it('acepta scopeTiers pro/elite (emisión vigente)', () => {
        const r = CreateCouponAdminSchema.safeParse({
            ...VALID_EMISSION,
            scopeTiers: ['pro', 'elite'],
        })
        expect(r.success).toBe(true)
    })
})

describe('RedeemCouponSchema — previewTier sin starter', () => {
    it('rechaza previewTier starter (ya no es un plan elegible en pantalla)', () => {
        const r = RedeemCouponSchema.safeParse({ code: 'PARTNER20', previewTier: 'starter' })
        expect(r.success).toBe(false)
    })

    it('acepta previewTier pro y elite', () => {
        expect(RedeemCouponSchema.safeParse({ code: 'PARTNER20', previewTier: 'pro' }).success).toBe(true)
        expect(RedeemCouponSchema.safeParse({ code: 'PARTNER20', previewTier: 'elite' }).success).toBe(true)
    })

    it('previewTier sigue siendo opcional (flujo de coach pago: el server usa su tier persistido)', () => {
        expect(RedeemCouponSchema.safeParse({ code: 'PARTNER20' }).success).toBe(true)
    })
})
