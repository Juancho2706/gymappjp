import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { discountSpecFromSnapshot } from '@/services/billing/discount.service'
import { listMonthlyEquivalentClp, netMonthlyClpForCoach } from '@/services/billing/mrr.service'

/**
 * Data layer de la ficha de coach (`/admin/coaches/[id]`). Server-only, service-role — el gate de
 * admin lo pone `admin/(panel)/layout.tsx` (redirect a /admin/login), igual que finanzas.
 *
 * La plata NO se recalcula acá: el neto sale de `netMonthlyClpForCoach` + `discountSpecFromSnapshot`,
 * las MISMAS funciones del motor de cobro y del MRR del panel. Si el cupón vivo cambia, la ficha y
 * finanzas dicen lo mismo por construcción (drift-safe).
 *
 * `React.cache` (no `unstable_cache`) por la regla del repo: la query corre sin cookies, y la ficha
 * la llaman DOS veces por request (generateMetadata + el page) — el cache las deduplica.
 */

const CoachIdSchema = z.guid()

/** Cupón vivo del coach + su efecto en pesos (lista vs paga). */
export interface CoachDetailCoupon {
    redemptionId: string
    code: string | null
    type: 'percent' | 'fixed_clp'
    value: number
    target: string
    /** null = forever/once vigente; N = ciclos que le quedan. */
    remainingCycles: number | null
    redeemedAt: string
}

export interface CoachDetailChargeRow {
    id: string
    chargedAt: string
    totalClp: number
    discountClp: number
    couponCode: string | null
    kind: string
    provider: string
}

export interface CoachDetailEventRow {
    id: string
    createdAt: string
    provider: string
    providerStatus: string | null
    providerEventId: string | null
}

export interface CoachDetailAddonRow {
    id: string
    moduleKey: string
    source: string
    status: string
    priceClp: number
}

export interface CoachDetailAuditRow {
    id: string
    createdAt: string
    adminEmail: string
    action: string
    targetTable: string
}

export interface CoachDetailCoachRow {
    id: string
    full_name: string
    brand_name: string
    slug: string
    primary_color: string
    subscription_status: string
    subscription_tier: string
    subscription_provider: string
    subscription_mp_id: string | null
    subscription_provider_external_id: string | null
    billing_cycle: string
    payment_provider: string
    max_clients: number
    current_period_end: string | null
    trial_ends_at: string | null
    admin_notes: string | null
    active_coupon_redemption_id: string | null
    invite_code: string
    created_at: string
    last_active_at: string | null
}

export interface CoachDetail {
    coach: CoachDetailCoachRow
    /** Email de auth.users (la tabla `coaches` NO tiene columna email). */
    email: string | null
    clientCount: number
    activeClientCount: number
    /** Precio de LISTA mensualizado del plan (incluye descuento de ciclo, sin cupón). */
    listMonthlyClp: number
    /** Lo que de verdad paga al mes (lista − cupón vivo). Igual al MRR de finanzas. */
    netMonthlyClp: number
    /**
     * ¿Está pagando de verdad? Mismo predicado que el MRR (PAID_COACH_OR_FILTER):
     * status active + suscripción real en su gateway. Un trial/expired/cortesía en tier pro
     * NO paga aunque su plan tenga precio de lista.
     */
    isPaying: boolean
    coupon: CoachDetailCoupon | null
    charges: CoachDetailChargeRow[]
    events: CoachDetailEventRow[]
    addons: CoachDetailAddonRow[]
    auditLogs: CoachDetailAuditRow[]
}

/**
 * Ficha completa de UN coach. Devuelve `null` si el id no es un uuid o el coach no existe
 * (el page lo traduce a `notFound()`).
 */
export const getCoachDetail = cache(async (coachId: string): Promise<CoachDetail | null> => {
    // uuid inválido ⇒ null ANTES de tocar Postgres: un id basura en la URL producía
    // `invalid input syntax for type uuid` (500) en vez de un 404 limpio.
    if (!CoachIdSchema.safeParse(coachId).success) return null

    const admin = createServiceRoleClient()

    const [
        coachRes,
        authRes,
        clientCountRes,
        activeClientCountRes,
        chargesRes,
        eventsRes,
        addonsRes,
        auditRes,
    ] = await Promise.all([
        // Select LITERAL (no string armado): PostgREST tipa la fila desde el literal — construirlo
        // dinámicamente la degrada a `any` y se pierde el chequeo contra `database.types.ts`.
        admin
            .from('coaches')
            .select('id, full_name, brand_name, slug, primary_color, subscription_status, subscription_tier, subscription_provider, subscription_mp_id, subscription_provider_external_id, billing_cycle, payment_provider, max_clients, current_period_end, trial_ends_at, admin_notes, active_coupon_redemption_id, invite_code, created_at, last_active_at')
            .eq('id', coachId)
            .maybeSingle(),
        admin.auth.admin.getUserById(coachId),
        admin.from('clients').select('id', { count: 'exact', head: true }).eq('coach_id', coachId),
        admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', coachId)
            .eq('is_active', true),
        admin
            .from('billing_snapshots')
            .select('id, charged_at, total_clp, discount_clp, coupon_code, kind, provider')
            .eq('coach_id', coachId)
            .order('charged_at', { ascending: false })
            .limit(10),
        admin
            .from('subscription_events')
            .select('id, created_at, provider, provider_status, provider_event_id')
            .eq('coach_id', coachId)
            .order('created_at', { ascending: false })
            .limit(10),
        admin
            .from('coach_addons')
            .select('id, module_key, source, status, price_clp')
            .eq('coach_id', coachId)
            .in('status', ['active', 'cancel_pending'])
            .order('module_key'),
        admin
            .from('admin_audit_logs')
            .select('id, created_at, admin_email, action, target_table')
            .eq('target_id', coachId)
            .order('created_at', { ascending: false })
            .limit(10),
    ])

    const coach: CoachDetailCoachRow | null = coachRes.data
    if (!coach) return null

    // Cupón vivo: puntero `coaches.active_coupon_redemption_id` → ledger `coupon_redemptions`.
    // Segundo viaje (no paralelizable): el id sale de la fila del coach.
    let coupon: CoachDetailCoupon | null = null
    let spec = null as ReturnType<typeof discountSpecFromSnapshot>
    if (coach.active_coupon_redemption_id) {
        const { data: redemption } = await admin
            .from('coupon_redemptions')
            .select('id, status, discount_value_snapshot, applied_cycles_remaining, redeemed_at')
            .eq('id', coach.active_coupon_redemption_id)
            .eq('status', 'active')
            .maybeSingle()
        if (redemption) {
            spec = discountSpecFromSnapshot(
                redemption.discount_value_snapshot,
                redemption.applied_cycles_remaining
            )
            if (spec) {
                const snap = (redemption.discount_value_snapshot ?? {}) as Record<string, unknown>
                coupon = {
                    redemptionId: redemption.id,
                    code: typeof snap.code === 'string' ? snap.code : null,
                    type: spec.type,
                    value: spec.value,
                    target: spec.target,
                    remainingCycles: spec.remainingCycles ?? null,
                    redeemedAt: redemption.redeemed_at,
                }
            }
        }
    }

    return {
        coach,
        email: authRes.data?.user?.email ?? null,
        clientCount: clientCountRes.count ?? 0,
        activeClientCount: activeClientCountRes.count ?? 0,
        listMonthlyClp: listMonthlyEquivalentClp(coach.subscription_tier, coach.billing_cycle),
        netMonthlyClp: netMonthlyClpForCoach(coach.subscription_tier, coach.billing_cycle, spec),
        isPaying: coach.subscription_status === 'active' && (
            (coach.payment_provider === 'mercadopago' && coach.subscription_mp_id !== null)
            || (coach.payment_provider === 'flow' && coach.subscription_provider_external_id !== null)
        ),
        coupon,
        charges: (chargesRes.data ?? []).map((r) => ({
            id: r.id,
            chargedAt: r.charged_at,
            totalClp: r.total_clp ?? 0,
            discountClp: r.discount_clp ?? 0,
            couponCode: r.coupon_code,
            kind: r.kind,
            provider: r.provider,
        })),
        events: (eventsRes.data ?? []).map((r) => ({
            id: r.id,
            createdAt: r.created_at,
            provider: r.provider,
            providerStatus: r.provider_status,
            providerEventId: r.provider_event_id,
        })),
        addons: (addonsRes.data ?? []).map((r) => ({
            id: r.id,
            moduleKey: r.module_key,
            source: r.source,
            status: r.status,
            priceClp: r.price_clp ?? 0,
        })),
        auditLogs: (auditRes.data ?? []).map((r) => ({
            id: r.id,
            createdAt: r.created_at,
            adminEmail: r.admin_email,
            action: r.action,
            targetTable: r.target_table,
        })),
    }
})
