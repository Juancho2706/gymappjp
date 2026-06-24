import { NextResponse } from 'next/server'
import { RedeemCouponSchema } from '@eva/schemas'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitCouponRedeem, jsonRateLimited } from '@/lib/rate-limit'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { toBillableAddons } from '@/services/billing/addons.service'
import { redeemCoupon, type RedeemErrorCode } from '@/services/billing/coupons.service'
import {
    getDefaultBillingCycleForTier,
    isBillingCycleAllowedForTier,
    isSaleTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

// GATE de dinero server-side fail-closed, SEPARADO de NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED. El
// canje escribe una redención que baja el precio del próximo cobro → es money path. Exacto '=== true'.
// Default OFF en prod (hasta firma legal O3 + QA sandbox); Preview = 'true' para QA.
const COUPON_REDEMPTION_ENABLED = process.env.COUPON_REDEMPTION_ENABLED === 'true'

// Map de error de negocio → HTTP. ALREADY_REDEEMED/CAP_REACHED = 409; elegibilidad = 422; no encontrado = 404.
// + variantes propias del registro (ALREADY_HAS_COUPON 409, NO_PENDING_SIGNUP 422) que se chequean
// ANTES de redeemCoupon, pero se listan acá para que el map sea exhaustivo.
const ERROR_STATUS: Record<RedeemErrorCode | 'ALREADY_HAS_COUPON' | 'NO_PENDING_SIGNUP', number> = {
    CODE_NOT_FOUND: 404,
    EXPIRED: 422,
    NOT_ELIGIBLE: 422,
    MODULE_DEFERRED: 422,
    MIN_AMOUNT: 422,
    ALREADY_REDEEMED: 409,
    CAP_REACHED: 409,
    NET_NOT_CHARGEABLE: 422,
    INSERT_FAILED: 500,
    ALREADY_HAS_COUPON: 409,
    NO_PENDING_SIGNUP: 422,
}

function clientIp(request: Request): string {
    const fwd = request.headers.get('x-forwarded-for')
    return fwd?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

function normalizeCycle(raw: string | null): BillingCycle {
    if (raw === 'monthly' || raw === 'quarterly' || raw === 'annual') return raw
    return 'monthly'
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()
        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json({ error: 'Disponible solo para coach independiente.' }, { status: 403 })
        }

        // Rate-limit fail-CLOSED (coach + IP) ANTES de tocar el catálogo (anti-enumeración de códigos).
        const rl = await rateLimitCouponRedeem(user.id, clientIp(request))
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        // Gate de dinero fail-closed. Con el flag OFF, el canje NUNCA escribe una redención.
        if (!COUPON_REDEMPTION_ENABLED) {
            return NextResponse.json(
                { code: 'COUPONS_DISABLED', error: 'Los códigos de descuento aún no están disponibles.' },
                { status: 403 }
            )
        }

        const parsed = RedeemCouponSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Código inválido' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select('subscription_tier, subscription_status, billing_cycle, active_coupon_redemption_id')
            .eq('id', user.id)
            .maybeSingle()
        if (!coach) return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })

        const persistedTier = (coach.subscription_tier ?? 'free') as SubscriptionTier
        const status = coach.subscription_status ?? ''
        // Pre-checkout SIN preapproval vivo: registro O reactivación. El descuento NO se PUTea acá;
        // entra después por create-preference contra el tier/ciclo que el coach realmente paga.
        // Gateamos por ESTADO, no por tier: un coach reactivando se queda en tier='free' hasta que el
        // pago confirma, pero su estado es pending_payment/expired/canceled (los 3 estados pre-checkout
        // que create-preference trata como alta/reactivación). Un coach pago ACTIVO (active/trialing) NO
        // entra acá — usa /redeem-coupon, que PUTea el descuento a su preapproval vivo.
        const PRE_CHECKOUT_STATUSES = new Set(['pending_payment', 'expired', 'canceled'])
        if (!PRE_CHECKOUT_STATUSES.has(status)) {
            return NextResponse.json(
                { code: 'NO_PENDING_SIGNUP', error: 'Necesitas completar el registro de un plan pago para usar un código.' },
                { status: 422 }
            )
        }

        // Un solo código por registro: si ya hay una redención apuntada, no se aplica otra.
        if (coach.active_coupon_redemption_id) {
            return NextResponse.json(
                { code: 'ALREADY_HAS_COUPON', error: 'Ya tienes un código aplicado a tu registro.' },
                { status: 409 }
            )
        }

        // Precio del preview = el plan ELEGIDO en la pantalla (lo que cobrará create-preference). Para un
        // coach reactivando el tier persistido suele ser 'free' (=> composite $0 => NET no cobrable), por
        // eso se precia sobre `previewTier`/`previewCycle`. El COBRO real lo recalcula create-preference;
        // esto solo hace que la disclosure SERNAC muestre el precio que se cobrará. Sin previewTier (flujo
        // de registro clásico, donde el tier persistido ya es pago) cae al tier/ciclo persistidos.
        const previewTier = parsed.data.previewTier
        const pricingTier: SubscriptionTier =
            previewTier && isSaleTier(previewTier) ? previewTier : persistedTier
        const persistedCycle = normalizeCycle(coach.billing_cycle)
        const pricingCycle: BillingCycle =
            parsed.data.previewCycle && isBillingCycleAllowedForTier(pricingTier, parsed.data.previewCycle)
                ? parsed.data.previewCycle
                : isBillingCycleAllowedForTier(pricingTier, persistedCycle)
                ? persistedCycle
                : getDefaultBillingCycleForTier(pricingTier)
        const billable = toBillableAddons(await listLive(admin, user.id))

        const result = await redeemCoupon(admin, {
            code: parsed.data.code,
            coachId: user.id,
            coachEmail: user.email,
            tier: pricingTier,
            cycle: pricingCycle,
            billable,
            sourceIp: clientIp(request),
            couponTermsText: null, // server-built (evidencia SERNAC desde montos del server)
            couponTermsVersion: null,
            commit: parsed.data.commit ?? false, // default PREVIEW: el commit exige confirmación explícita
        })

        if (!result.ok) {
            return NextResponse.json(
                { code: result.code, error: result.message },
                { status: ERROR_STATUS[result.code] }
            )
        }

        // Auditoría SOLO del commit real (preview no escribe nada). Best-effort.
        if (result.redemptionId) await admin.from('admin_audit_logs').insert({
            admin_email: 'coupon-redeem',
            action: 'coach.coupon_redeemed',
            target_table: 'coupon_redemptions',
            target_id: result.redemptionId,
            payload: {
                coach_id: user.id,
                coupon_code: result.preview.couponCode,
                discount_clp: result.preview.discountClp,
                source: 'register',
            },
        }).then(({ error }) => {
            if (error) console.error('[redeem-coupon-signup] audit log failed:', error.message)
        })

        // En el registro NO hay preapproval vivo: el descuento NO se PUTea a MP acá. La redención
        // queda escrita (coaches.active_coupon_redemption_id la apunta vía trigger) y el primer
        // checkout (create-preference) ya threadea el spec en el monto. Sin PUT que hacer.
        return NextResponse.json({ ok: true, redemptionId: result.redemptionId, preview: result.preview })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo canjear el código.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
