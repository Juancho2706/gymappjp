import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    computeDiscountedClp,
    getTierPriceClp,
    TIER_CONFIG,
    type BillingCycle,
    type DiscountSpec,
    type DiscountTarget,
    type DiscountType,
    type SubscriptionTier,
} from '@eva/tiers'

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

export type RedemptionRow = {
    redemptionId: string
    codeDisplay: string | null
    /** Necesario para linkear a la ficha del coach y para el blast radius de la revocación. */
    coachId: string | null
    coachSlug: string | null
    /** Nombre para mostrar (marca > nombre > slug). */
    coachName: string | null
    status: string
    redeemedAt: string
    /** Descuento REAL en CLP sobre el plan vigente del coach (lista − neto). null = no computable. */
    discountClp: number | null
    /** Etiqueta congelada del snapshot: "-25%" / "-$5.000". null = snapshot inválido. */
    discountLabel: string | null
    /** Precio de lista del plan del coach (tier + ciclo). Al revocar, el próximo cobro vuelve acá. */
    listPriceClp: number | null
    /** Neto que paga hoy con el cupón vivo. */
    netPriceClp: number | null
    couponCode: string | null
}

const BILLING_CYCLES = new Set<string>(['monthly', 'quarterly', 'annual'])

function asTier(v: unknown): SubscriptionTier | null {
    return typeof v === 'string' && v in TIER_CONFIG ? (v as SubscriptionTier) : null
}
function asCycle(v: unknown): BillingCycle | null {
    return typeof v === 'string' && BILLING_CYCLES.has(v) ? (v as BillingCycle) : null
}

type SnapshotRead = {
    type: DiscountType | null
    value: number | null
    target: DiscountTarget
    code: string | null
    floorClp: number | undefined
}

/** Lee el `discount_value_snapshot` congelado (jsonb) sin confiar en su forma (evidencia histórica). */
function readSnapshot(raw: unknown): SnapshotRead {
    const s = (raw ?? {}) as Record<string, unknown>
    const type = s.type === 'percent' || s.type === 'fixed_clp' ? (s.type as DiscountType) : null
    const value = typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : null
    const target =
        s.target === 'base' || s.target === 'module' || s.target === 'total' ? (s.target as DiscountTarget) : 'total'
    const floorRaw = s.floorClp
    return {
        type,
        value,
        target,
        code: typeof s.code === 'string' ? s.code : null,
        floorClp:
            typeof floorRaw === 'number' && Number.isFinite(floorRaw) && floorRaw >= 0 ? Math.round(floorRaw) : undefined,
    }
}

/** "-25%" / "-$5.000" — el descuento tal como quedó congelado al canje. */
function discountLabelFrom(snap: SnapshotRead): string | null {
    if (!snap.type || snap.value == null) return null
    return snap.type === 'percent' ? `-${snap.value}%` : `-$${snap.value.toLocaleString('es-CL')}`
}

/**
 * Precio lista/neto del canje usando el MISMO motor puro que cobra (`computeDiscountedClp`) — nunca
 * una regla de redondeo paralela. Sobre el plan del coach (tier + ciclo): los 4 módulos vienen
 * INCLUIDOS en todo plan pago (decisión CEO 2026-07-17), así que composite == base y no hay add-ons
 * que sumar. Un snapshot `target='module'` daría descuento 0 acá — inalcanzable en la práctica
 * (el mint deshabilita esa opción y el canje corta con MODULE_DEFERRED).
 */
function priceFor(
    snap: SnapshotRead,
    tier: SubscriptionTier | null,
    cycle: BillingCycle | null
): { list: number | null; net: number | null; discount: number | null } {
    if (!tier || !cycle) return { list: null, net: null, discount: null }
    const list = getTierPriceClp(tier, cycle)
    if (!snap.type || snap.value == null) return { list, net: list, discount: null }
    const spec: DiscountSpec = { type: snap.type, value: snap.value, target: snap.target, remainingCycles: null }
    const r = computeDiscountedClp({ baseClp: list, spec, floorClp: snap.floorClp })
    return { list: r.baseBeforeDiscountClp, net: r.netClp, discount: r.discountClp }
}

type CoachEmbed = {
    id?: string
    slug?: string | null
    full_name?: string | null
    brand_name?: string | null
    subscription_tier?: string | null
    billing_cycle?: string | null
}

/** El embed PostgREST puede llegar como objeto (to-one) o array según la inferencia de la FK. */
function firstCoach(raw: unknown): CoachEmbed | null {
    if (!raw) return null
    const c = Array.isArray(raw) ? raw[0] : raw
    return (c ?? null) as CoachEmbed | null
}

/** Canjes recientes (todos los códigos) con el coach + descuento aplicado — para el panel CEO. */
export async function getRecentRedemptions(limit = 50): Promise<RedemptionRow[]> {
    const db = createServiceRoleClient()
    const { data } = await db
        .from('coupon_redemptions')
        .select(
            'id, status, redeemed_at, discount_value_snapshot, coach_id, coaches:coach_id(id, slug, full_name, brand_name, subscription_tier, billing_cycle)'
        )
        .order('redeemed_at', { ascending: false })
        .limit(limit)
    return (data ?? []).map((r) => {
        const snap = readSnapshot(r.discount_value_snapshot)
        const coach = firstCoach(r.coaches)
        const price = priceFor(snap, asTier(coach?.subscription_tier), asCycle(coach?.billing_cycle))
        return {
            redemptionId: r.id,
            codeDisplay: snap.code,
            coachId: r.coach_id ?? coach?.id ?? null,
            coachSlug: coach?.slug ?? null,
            coachName: coach?.brand_name ?? coach?.full_name ?? coach?.slug ?? null,
            status: r.status,
            redeemedAt: r.redeemed_at,
            discountClp: price.discount,
            discountLabel: discountLabelFrom(snap),
            listPriceClp: price.list,
            netPriceClp: price.net,
            couponCode: snap.code,
        }
    })
}

/** Métricas agregadas: nº de canjes vivos + total de descuento ya otorgado (desde snapshots). */
export async function getCouponMetrics(): Promise<{
    activeRedemptions: number
    totalRedemptions: number
    totalDiscountGivenClp: number
}> {
    const db = createServiceRoleClient()
    const [{ count: total }, { count: active }, { data: snaps }] = await Promise.all([
        db.from('coupon_redemptions').select('id', { count: 'exact', head: true }),
        db.from('coupon_redemptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        db.from('billing_snapshots').select('discount_clp').not('coupon_redemption_id', 'is', null),
    ])
    const totalDiscountGivenClp = (snaps ?? []).reduce((s, r) => s + (r.discount_clp ?? 0), 0)
    return { activeRedemptions: active ?? 0, totalRedemptions: total ?? 0, totalDiscountGivenClp }
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
