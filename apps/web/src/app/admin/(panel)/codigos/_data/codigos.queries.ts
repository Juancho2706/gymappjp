import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * _data/codigos.queries — lecturas service-role del catálogo de cupones para el panel CEO (F5).
 * El catálogo NO tiene SELECT para authenticated → service-role obligatorio (mirror teams.queries).
 */

export type AdminCouponRow = {
    codeId: string
    couponId: string
    codeDisplay: string | null
    codeNormalized: string
    active: boolean
    discountType: 'percent' | 'fixed_clp'
    percentValue: number | null
    amountOffClp: number | null
    fixedClpTarget: 'base' | 'module' | 'total'
    duration: 'once' | 'repeating' | 'forever'
    durationInCycles: number | null
    maxRedemptions: number | null
    redeemedCount: number
    perAccountLimit: number
    firstTimeOnly: boolean
    restrictedToCoachId: string | null
    expiresAt: string | null
    createdAt: string
}

export async function getCouponsForAdmin(): Promise<AdminCouponRow[]> {
    const db = createServiceRoleClient()
    const { data } = await db
        .from('coupon_codes')
        .select(
            'id, code_normalized, code_display, active, max_redemptions, redeemed_count, per_account_limit, first_time_only, restricted_to_coach_id, expires_at, created_at, coupons:coupon_id(id, discount_type, percent_value, amount_off_clp, fixed_clp_target, duration, duration_in_cycles)'
        )
        .order('created_at', { ascending: false })
        .limit(200)

    return (data ?? []).map((r) => {
        const c = (r.coupons ?? {}) as {
            id?: string
            discount_type?: 'percent' | 'fixed_clp'
            percent_value?: number | null
            amount_off_clp?: number | null
            fixed_clp_target?: 'base' | 'module' | 'total'
            duration?: 'once' | 'repeating' | 'forever'
            duration_in_cycles?: number | null
        }
        return {
            codeId: r.id,
            couponId: c.id ?? '',
            codeDisplay: r.code_display,
            codeNormalized: r.code_normalized,
            active: r.active,
            discountType: c.discount_type ?? 'percent',
            percentValue: c.percent_value ?? null,
            amountOffClp: c.amount_off_clp ?? null,
            fixedClpTarget: c.fixed_clp_target ?? 'base',
            duration: c.duration ?? 'once',
            durationInCycles: c.duration_in_cycles ?? null,
            maxRedemptions: r.max_redemptions,
            redeemedCount: r.redeemed_count,
            perAccountLimit: r.per_account_limit,
            firstTimeOnly: r.first_time_only,
            restrictedToCoachId: r.restricted_to_coach_id,
            expiresAt: r.expires_at,
            createdAt: r.created_at,
        }
    })
}
