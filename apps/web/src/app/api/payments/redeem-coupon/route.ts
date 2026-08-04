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

const PAID_ACTIVE = new Set(['active', 'trialing'])

// Map de error de negocio → HTTP. ALREADY_REDEEMED/CAP_REACHED = 409; elegibilidad = 422; no encontrado = 404.
// + variantes propias de la rama FREE (PLAN_REQUIRED 422, ALREADY_HAS_COUPON 409) que se chequean
// ANTES de redeemCoupon, pero se listan acá para que el map sea exhaustivo.
const ERROR_STATUS: Record<RedeemErrorCode | 'PLAN_REQUIRED' | 'ALREADY_HAS_COUPON', number> = {
    CODE_NOT_FOUND: 404,
    EXPIRED: 422,
    NOT_ELIGIBLE: 422,
    MODULE_DEFERRED: 422,
    MIN_AMOUNT: 422,
    ALREADY_REDEEMED: 409,
    CAP_REACHED: 409,
    NET_NOT_CHARGEABLE: 422,
    INSERT_FAILED: 500,
    PLAN_REQUIRED: 422,
    ALREADY_HAS_COUPON: 409,
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
            .select('subscription_tier, subscription_status, billing_cycle, subscription_mp_id, subscription_provider, subscription_provider_external_id, active_coupon_redemption_id')
            .eq('id', user.id)
            .maybeSingle()
        if (!coach) return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })

        const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
        const status = coach.subscription_status ?? ''
        // Coach FREE con cuenta ACTIVA (nunca pagó / plan gratuito vigente): NO tiene preapproval, pero sí
        // tiene dónde aplicar el descuento — `create-preference` resuelve la redención viva SIN gate de
        // tier/status y precia el tier/cycle del checkout, así que el descuento entra en su primer cobro.
        // Los demás free (expired/canceled/pending_payment) siguen fuera: esos van por
        // /redeem-coupon-signup (registro/reactivación), que es el dueño de ese hueco.
        const isFreeActive = tier === 'free' && status === 'active'
        // Solo un plan pago activo (con preapproval vivo) puede canjear: hay dónde aplicar el descuento.
        if (!isFreeActive && (tier === 'free' || !PAID_ACTIVE.has(status))) {
            return NextResponse.json(
                { code: 'NO_PAID_PLAN', error: 'Necesitas un plan pago activo para usar un código.' },
                { status: 422 }
            )
        }

        // Precio del canje. Coach PAGO: su tier/ciclo PERSISTIDOS (es literalmente lo que ya paga y lo que
        // se PUTea) — sin cambios. Coach FREE: el plan persistido es free ($0 ⇒ NET no cobrable), así que se
        // precia sobre el plan ELEGIDO en pantalla (`previewTier`/`previewCycle`), misma cascada que
        // /redeem-coupon-signup. El COBRO real lo recalcula create-preference; esto solo hace que la
        // disclosure SERNAC muestre el precio que se cobrará.
        let pricingTier: SubscriptionTier = tier
        let pricingCycle: BillingCycle = normalizeCycle(coach.billing_cycle)
        if (isFreeActive) {
            const previewTier = parsed.data.previewTier
            if (!previewTier || !isSaleTier(previewTier)) {
                return NextResponse.json(
                    { code: 'PLAN_REQUIRED', error: 'Elige el plan al que aplicará el código antes de canjearlo.' },
                    { status: 422 }
                )
            }
            pricingTier = previewTier
            pricingCycle =
                parsed.data.previewCycle && isBillingCycleAllowedForTier(previewTier, parsed.data.previewCycle)
                    ? parsed.data.previewCycle
                    : isBillingCycleAllowedForTier(previewTier, pricingCycle)
                    ? pricingCycle
                    : getDefaultBillingCycleForTier(previewTier)
            // Un solo código a la vez. El índice único parcial de coupon_redemptions igual lo bloquearía
            // (23505 → ALREADY_REDEEMED), pero el 409 explícito da el error correcto y no toca el motor.
            // Solo en la rama FREE: el coach pago conserva su comportamiento histórico exacto.
            if (coach.active_coupon_redemption_id) {
                return NextResponse.json(
                    { code: 'ALREADY_HAS_COUPON', error: 'Ya tienes un código aplicado a tu registro.' },
                    { status: 409 }
                )
            }
        }

        // Add-ons facturables del compuesto. En la rama FREE van vacíos a propósito: el descuento se precia
        // sobre el PLAN que el coach va a comprar, no sobre add-ons que todavía no paga (un free no puede
        // comprar add-ons: `canPurchaseAddon` exige plan pago activo, y las cortesías admin_grant ya las
        // excluye `toBillableAddons`). El monto real del checkout lo recalcula create-preference con el
        // compuesto verdadero. Evita además una lectura de DB inútil en este path.
        const billable = isFreeActive ? [] : toBillableAddons(await listLive(admin, user.id))

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
            },
        }).then(({ error }) => {
            if (error) console.error('[redeem-coupon] audit log failed:', error.message)
        })

        // Aplicación del descuento al plan, SEGÚN EL GATEWAY (U6):
        //   - MP: PUT del monto descontado de inmediato → el PRÓXIMO cobro ya sale al precio del
        //     disclosure (el ciclo actual, ya pagado, NO se toca: MP solo cambia el próximo). Best-effort:
        //     si el PUT falla, la redención queda escrita igual (drift lo loguea webhook/cron).
        //   - FLOW: NO se hace PUT inmediato. En Flow `updateCheckoutAmount` traduce a un changePlan que
        //     movería la plata del ciclo EN CURSO; el disclosure dice "desde tu próxima renovación", así
        //     que el cron `flow-reconcile` (ESCRITOR ÚNICO del compuesto Flow) materializa el monto
        //     descontado ANTES del próximo cobro. La redención YA quedó commiteada por redeemCoupon.
        //   - Sin preapproval (comp / internal) → no hay dónde aplicar (no-op). Antes un coach Flow caía
        //     acá con mp_id NULL y el descuento moría en silencio (cobraba lleno con snapshot descontado =
        //     SERNAC invertido) — ahora es EXPLÍCITO: lo aplica el cron.
        //   - FREE ACTIVO: no hay preapproval que tocar (todavía no compra nada). Se excluye EXPLÍCITAMENTE
        //     del PUT — no basta con que `subscription_mp_id` suela venir NULL: si sobreviviera un id de una
        //     suscripción vieja, el PUT movería el monto de una suscripción que NO es el plan que acabamos
        //     de preciar. El descuento entra solo en el primer checkout (create-preference). Fail-closed.
        const mpId = coach.subscription_mp_id?.trim() || null
        if (result.redemptionId && !isFreeActive) {
            if (coach.subscription_provider === 'flow') {
                console.info('[redeem-coupon] coach Flow — cron flow-reconcile aplica el compuesto descontado antes del próximo cobro', {
                    coachId: user.id,
                    redemptionId: result.redemptionId,
                })
            } else if (mpId) {
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
        }

        return NextResponse.json({ ok: true, redemptionId: result.redemptionId, preview: result.preview })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo canjear el código.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
