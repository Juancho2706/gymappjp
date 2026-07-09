import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { MODULE_KEYS } from '@/services/entitlements.service'
import { SELF_SERVICE_ADDONS_ENABLED } from '@/lib/constants'
import { requestAddonCancellation } from '@/services/billing/addons.service'
import { buildAddonPaymentsPort } from '../_lib/payments-port'
import {
    addonLabel,
    buildCancelContext,
    fetchCoachBillingRow,
    formatDateEsCl,
} from '../_lib/coach-context'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildAddonCancellationReceiptEmail } from '@/lib/email/addon-receipt-templates'

/**
 * POST /api/payments/addons/cancel — BAJA de un add-on (plan 05 F4.2).
 *
 * body: { moduleKey, reason? }. Guards: auth → canViewBilling → requestAddonCancellation.
 * Respuesta con la fecha efectiva (regla 3 mensual sin cobrar → null "tras tu primer cobro";
 * regla 4 → fin del período ya pagado). Evento de historial + recibo fire-and-forget.
 */

const schema = z.object({
    moduleKey: z.enum(MODULE_KEYS),
    reason: z.string().max(500).optional(),
})

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // El switch de lanzamiento gatea la RUTA, no solo la UI (espejo del alta): sin esto la baja
        // self-service era alcanzable por API con el flag off, antes del flip de lanzamiento.
        if (!SELF_SERVICE_ADDONS_ENABLED) {
            return NextResponse.json({ error: 'Función no disponible.', code: 'FEATURE_DISABLED' }, { status: 403 })
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
        const { moduleKey, reason } = parsed.data

        const admin = createServiceRoleClient()
        const coach = await fetchCoachBillingRow(admin, user.id)
        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

        const ctx = buildCancelContext(coach)
        // Provider POR COACH (Ola 5): un coach Flow baja el monto vía changePlan sobre su sub Flow;
        // buildCancelContext ya pasa el ref del gateway (external_id para Flow, mp_id para MP).
        const payments = buildAddonPaymentsPort(coach)

        let result
        try {
            result = await requestAddonCancellation(admin, payments, ctx, moduleKey)
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            // El service lanza un mensaje amable cuando no hay add-on vivo del módulo.
            if (/módulo|add-on activo/i.test(msg)) {
                return NextResponse.json(
                    { error: 'No tienes este módulo activo para cancelar.', code: 'NOT_ACTIVE' },
                    { status: 409 }
                )
            }
            throw err
        }

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const effectiveDate = formatDateEsCl(result.effectiveAt)

        // Evento de historial (gateway del coach para trazabilidad correcta MP/Flow).
        await admin.from('subscription_events').insert({
            coach_id: user.id,
            provider: coach.subscription_provider === 'flow' ? 'flow' : 'mercadopago',
            provider_event_id: `addon:${moduleKey}:cancel:${Date.now()}`,
            provider_status: 'addon_cancel_requested',
            payload: {
                action: 'addon_cancel_requested',
                module_key: moduleKey,
                effective_at: result.effectiveAt,
                put_applied: result.putApplied,
                ...(reason ? { cancel_reason: reason } : {}),
            } as never,
        })

        // Recibo email — fire-and-forget; error loggeado, NUNCA bloquea la baja.
        void sendAddonCancellationReceipt({
            to: user.email,
            moduleLabel: addonLabel(moduleKey),
            effectiveDate,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })

        return NextResponse.json({
            ok: true,
            moduleKey: result.moduleKey,
            status: result.status,
            effectiveAt: result.effectiveAt,
            putApplied: result.putApplied,
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'No se pudo cancelar el módulo.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

/** Recibo de baja (fire-and-forget). Loggea y nunca relanza. */
async function sendAddonCancellationReceipt(input: {
    to: string
    moduleLabel: string
    effectiveDate: string | null
    subscriptionUrl: string
}): Promise<void> {
    try {
        const { subject, html } = buildAddonCancellationReceiptEmail({
            coachName: input.to.split('@')[0] ?? 'coach',
            addonLabel: input.moduleLabel,
            effectiveDate: input.effectiveDate,
            subscriptionUrl: input.subscriptionUrl,
        })
        const res = await sendTransactionalEmail({ to: input.to, subject, html })
        if (!res.ok) console.error('[addons] cancel receipt email failed:', res.error)
    } catch (err) {
        console.error('[addons] cancel receipt email threw:', err)
    }
}
