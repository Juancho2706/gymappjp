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
import { buildAmountPutIdempotencyKey } from '@/services/billing/discount.service'
import { getPaymentsProvider } from '@/lib/payments/provider'
import type { BillingCycle, SubscriptionTier } from '@/lib/constants'

// GATE de dinero server-side fail-closed, SEPARADO de NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED. El
// canje escribe una redención que baja el precio del próximo cobro → es money path. Exacto '=== true'.
// Default OFF en prod (hasta firma legal O3 + QA sandbox); Preview = 'true' para QA.
const COUPON_REDEMPTION_ENABLED = process.env.COUPON_REDEMPTION_ENABLED === 'true'

const PAID_ACTIVE = new Set(['active', 'trialing'])

// Map de error de negocio → HTTP. ALREADY_REDEEMED/CAP_REACHED = 409; elegibilidad = 422; no encontrado = 404.
const ERROR_STATUS: Record<RedeemErrorCode, number> = {
    CODE_NOT_FOUND: 404,
    EXPIRED: 422,
    NOT_ELIGIBLE: 422,
    MODULE_DEFERRED: 422,
    MIN_AMOUNT: 422,
    ALREADY_REDEEMED: 409,
    CAP_REACHED: 409,
    NET_NOT_CHARGEABLE: 422,
    INSERT_FAILED: 500,
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
            .select('subscription_tier, subscription_status, billing_cycle, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle()
        if (!coach) return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })

        const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
        const status = coach.subscription_status ?? ''
        // Solo un plan pago activo (con preapproval vivo) puede canjear: hay dónde aplicar el descuento.
        if (tier === 'free' || !PAID_ACTIVE.has(status)) {
            return NextResponse.json(
                { code: 'NO_PAID_PLAN', error: 'Necesitas un plan pago activo para usar un código.' },
                { status: 422 }
            )
        }

        const cycle = normalizeCycle(coach.billing_cycle)
        const billable = toBillableAddons(await listLive(admin, user.id))

        const result = await redeemCoupon(admin, {
            code: parsed.data.code,
            coachId: user.id,
            coachEmail: user.email,
            tier,
            cycle,
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
            },
        }).then(({ error }) => {
            if (error) console.error('[redeem-coupon] audit log failed:', error.message)
        })

        // Commit con preapproval vivo: PUT del monto descontado a MP de inmediato → el PRÓXIMO cobro
        // ya sale al precio del disclosure (el ciclo actual, ya pagado, NO se toca: MP solo cambia el
        // próximo). Best-effort: si el PUT falla, la redención queda escrita igual (drift lo loguea
        // webhook/cron); NUNCA tumbamos el canje por un fallo del provider. Sin preapproval (comp /
        // internal) no hay dónde aplicar → no-op. result.preview.totalClp = neto server-side descontado.
        const mpId = coach.subscription_mp_id?.trim() || null
        if (result.redemptionId && mpId) {
            try {
                await getPaymentsProvider().updateCheckoutAmount(
                    mpId,
                    result.preview.totalClp,
                    buildAmountPutIdempotencyKey(user.id, result.preview.totalClp)
                )
            } catch (putErr) {
                console.error('[redeem-coupon] PUT del monto descontado falló — redención escrita, reconcile reintenta', {
                    coachId: user.id,
                    message: putErr instanceof Error ? putErr.message : String(putErr),
                })
            }
        }

        return NextResponse.json({ ok: true, redemptionId: result.redemptionId, preview: result.preview })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo canjear el código.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
