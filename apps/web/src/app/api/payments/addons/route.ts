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
import {
    acceptedRulesForCycle,
    addonLabel,
    buildActivateContext,
    computeCompositeBreakdown,
    cycleLabel,
    fetchCoachBillingRow,
    formatDateEsCl,
    normalizeCycle,
} from './_lib/coach-context'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildAddonActivationReceiptEmail } from '@/lib/email/addon-receipt-templates'

/**
 * POST /api/payments/addons — ALTA de un add-on self-service (plan 05 F4.1).
 *
 * Guards en orden (doc fuente §2.3 + D8):
 *   auth → canViewBilling (excluye team/org) → canPurchaseAddon → checkbox obligatorio
 *   (acceptedTermsVersion === ADDON_PAYMENT_RULES.version) → activateAddonForCoach.
 *
 * Respuesta BIFURCADA por ciclo (D4):
 *   - mensual          → fila creada (INSERT service-role + PUT con reversión D5) + nuevo
 *                        total compuesto + evento de historial + recibo email.
 *   - trimestral/anual → { checkoutUrl } del one-shot prorrateado (la fila, el PUT, el evento,
 *                        el snapshot y el recibo llegan vía webhook al aprobarse el pago — F3).
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

        const cycle = normalizeCycle(coach.billing_cycle)
        const ctx = buildActivateContext(coach, user.email)
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

        // Trimestral / anual: la fila + PUT + evento + recibo llegan por webhook (F3).
        if (result.kind === 'one_shot_checkout') {
            return NextResponse.json({
                kind: 'one_shot_checkout',
                checkoutUrl: result.checkoutUrl,
                prorationClp: result.prorationClp,
                cycleAmountClp: result.cycleAmountClp,
            })
        }

        // Mensual: fila ya creada + PUT aplicado. Evento de historial + recibo fire-and-forget.
        const breakdown = await computeCompositeBreakdown(admin, user.id, ctx.tier, cycle)
        const rules = acceptedRulesForCycle(cycle)
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

        // Evento de historial con el TEXTO íntegro de las reglas aceptadas (evidencia SERNAC, F3.4).
        await admin.from('subscription_events').insert({
            coach_id: user.id,
            provider: 'mercadopago',
            provider_event_id: `addon:${result.addon.id}:activate`,
            provider_status: 'addon_activated',
            payload: {
                action: 'addon_activated',
                module_key: moduleKey,
                billing_cycle: cycle,
                terms_version: acceptedTermsVersion,
                base_clp: breakdown.baseClp,
                addons_clp: breakdown.addonsClp,
                total_clp: breakdown.totalClp,
                accepted_rules: rules,
            } as never,
        })

        // Recibo email — fire-and-forget; error loggeado, NUNCA bloquea la mutación de cobro.
        void sendAddonActivationReceipt({
            to: user.email,
            moduleLabel: addonLabel(moduleKey),
            cycleText: cycleLabel(cycle),
            baseClp: breakdown.baseClp,
            addonLines: breakdown.addonLines,
            totalClp: breakdown.totalClp,
            oneShotClp: null,
            nextChargeDate: formatDateEsCl(coach.current_period_end),
            acceptedRules: rules,
            termsVersion: acceptedTermsVersion,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })

        return NextResponse.json({
            kind: 'monthly_activated',
            addon: result.addon,
            billing: {
                baseClp: breakdown.baseClp,
                addonsClp: breakdown.addonsClp,
                totalClp: breakdown.totalClp,
            },
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'No se pudo agregar el módulo.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

/** Recibo de alta (fire-and-forget). Loggea y nunca relanza. */
async function sendAddonActivationReceipt(input: {
    to: string
    moduleLabel: string
    cycleText: string
    baseClp: number
    addonLines: { label: string; cycleAmountClp: number }[]
    totalClp: number
    oneShotClp: number | null
    nextChargeDate: string | null
    acceptedRules: { number: number; title: string; text: string }[]
    termsVersion: string
    subscriptionUrl: string
}): Promise<void> {
    try {
        const { subject, html } = buildAddonActivationReceiptEmail({
            coachName: input.to.split('@')[0] ?? 'coach',
            addonLabel: input.moduleLabel,
            cycleLabel: input.cycleText,
            baseClp: input.baseClp,
            addonLines: input.addonLines,
            totalClp: input.totalClp,
            oneShotClp: input.oneShotClp,
            nextChargeDate: input.nextChargeDate,
            acceptedRules: input.acceptedRules,
            termsVersion: input.termsVersion,
            subscriptionUrl: input.subscriptionUrl,
        })
        const res = await sendTransactionalEmail({ to: input.to, subject, html })
        if (!res.ok) console.error('[addons] receipt email failed:', res.error)
    } catch (err) {
        console.error('[addons] receipt email threw:', err)
    }
}
