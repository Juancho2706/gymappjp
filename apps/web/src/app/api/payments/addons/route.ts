import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { MODULE_KEYS } from '@/services/entitlements.service'
import { ADDON_PAYMENT_RULES } from '@/lib/constants'
import { activateAddonForCoach, canPurchaseAddon } from '@/services/billing/addons.service'
import { buildAddonPaymentsPort } from './_lib/payments-port'
import { buildActivateContext, fetchCoachBillingRow } from './_lib/coach-context'

/**
 * POST /api/payments/addons — ALTA de un add-on self-service (plan 05 F4.1).
 *
 * Guards en orden (doc fuente §2.3 + D8):
 *   auth → canViewBilling (excluye team/org) → canPurchaseAddon → checkbox obligatorio
 *   (acceptedTermsVersion === ADDON_PAYMENT_RULES.version) → activateAddonForCoach.
 *
 * Respuesta ÚNICA para TODOS los ciclos (D4): { checkoutUrl } del one-shot prorrateado.
 * La fila, el PUT diferido, el evento de historial, el snapshot y el recibo llegan vía
 * webhook al aprobarse el pago (F3) — incluido el ciclo mensual, que antes activaba en el acto.
 *
 * El monto SIEMPRE lo calcula el server. La feature está detrás de SELF_SERVICE_ADDONS_ENABLED.
 */

const schema = z.object({
    moduleKey: z.enum(MODULE_KEYS),
    acceptedTermsVersion: z.string().min(1),
})

const DENIAL_STATUS: Record<string, number> = {
    no_paid_plan: 403,
    requires_nutrition_tier: 403,
    managed_by_team_or_org: 403,
}

const DENIAL_MESSAGE: Record<string, string> = {
    no_paid_plan: 'Necesitas un plan pago activo para agregar un módulo.',
    requires_nutrition_tier: 'Este módulo requiere un plan con nutrición (Pro o superior).',
    managed_by_team_or_org: 'Los módulos de un equipo se gestionan por contrato.',
}

/** El índice único parcial mapea "fila viva ya existe" → módulo ya activo (409 amable). */
function isAlreadyActiveError(message: string): boolean {
    return /one_live_per_module|duplicate key|unique constraint/i.test(message)
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

        const rl = await rateLimitPayment(user.id)
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Billing disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        const parsed = schema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }
        const { moduleKey, acceptedTermsVersion } = parsed.data

        // Checkbox obligatorio: la versión aceptada debe ser la vigente (evidencia SERNAC).
        if (acceptedTermsVersion !== ADDON_PAYMENT_RULES.version) {
            return NextResponse.json(
                { error: 'Debes aceptar las condiciones de pago vigentes.', code: 'TERMS_OUTDATED' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const coach = await fetchCoachBillingRow(admin, user.id)
        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

        const gate = canPurchaseAddon(
            {
                subscriptionTier: coach.subscription_tier as never,
                subscriptionStatus: coach.subscription_status,
                isManagedByTeamOrOrg: false, // canViewBilling ya excluyó team/org
                currentPeriodEnd: coach.current_period_end,
            },
            moduleKey
        )
        if (!gate.allowed) {
            return NextResponse.json(
                { error: DENIAL_MESSAGE[gate.reason], code: gate.reason },
                { status: DENIAL_STATUS[gate.reason] ?? 403 }
            )
        }

        // URLs del one-shot (back_urls + webhook) desde NEXT_PUBLIC_SITE_URL — mismo patrón que
        // create-preference. MP exige back_urls.success cuando se manda auto_return.
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const webhookToken = process.env.MERCADOPAGO_WEBHOOK_TOKEN
        const webhookUrl = webhookToken
            ? `${appUrl}/api/payments/webhook?token=${webhookToken}`
            : `${appUrl}/api/payments/webhook`
        // buildActivateContext normaliza el ciclo y deriva el corte para el prorrateo del service.
        const ctx = buildActivateContext(coach, user.email, {
            successUrl: `${appUrl}/coach/subscription?addon=success`,
            failureUrl: `${appUrl}/coach/subscription?addon=failure`,
            pendingUrl: `${appUrl}/coach/subscription?addon=pending`,
            webhookUrl,
        })
        const payments = buildAddonPaymentsPort()

        let result
        try {
            result = await activateAddonForCoach(
                admin,
                payments,
                ctx,
                moduleKey,
                acceptedTermsVersion
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (isAlreadyActiveError(msg)) {
                return NextResponse.json(
                    { error: 'Ya tienes este módulo activo.', code: 'ALREADY_ACTIVE' },
                    { status: 409 }
                )
            }
            throw err
        }

        // TODOS los ciclos: one-shot prorrateado. La fila + PUT diferido + evento + snapshot +
        // recibo llegan por webhook al aprobarse el pago (F3); acá solo se redirige al checkout.
        if (result.kind !== 'one_shot_checkout') {
            // Inalcanzable: el service converge a one-shot en todos los ciclos (D4).
            return NextResponse.json(
                { error: 'No se pudo iniciar el cobro del módulo.' },
                { status: 500 }
            )
        }
        return NextResponse.json({
            kind: 'one_shot_checkout',
            checkoutUrl: result.checkoutUrl,
            prorationClp: result.prorationClp,
            cycleAmountClp: result.cycleAmountClp,
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'No se pudo agregar el módulo.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
