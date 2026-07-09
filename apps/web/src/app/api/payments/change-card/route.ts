import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitCardChange, jsonRateLimited } from '@/lib/rate-limit'
import { CHANGE_CARD_ENABLED, CARD_CHANGE_DISCLOSURE } from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { FlowProvider } from '@/lib/payments/providers/flow'
import { changeCardForCoach } from '@/services/billing/change-card.service'

/**
 * POST /api/payments/change-card — cambio de tarjeta IN-PLACE del coach standalone (Modalidad A).
 *
 * Guards en orden (plan P0-5/P0-6, espeja /api/payments/addons):
 *   auth → flag CHANGE_CARD_ENABLED (gate de DINERO server-side) → rate-limit fail-closed →
 *   canViewBilling (excluye org/team) → zod → consentimiento (CARD_CHANGE_DISCLOSURE.version) →
 *   bifurcacion por gateway (T5.5, leido de `coaches.subscription_provider` — NUNCA del body):
 *     - 'flow'         → NO hay tokenizacion sincrona: re-enrolar por redirect Webpay
 *                        (FlowProvider.startCardReenrollment) → `{ kind: 'redirect', redirectUrl }`.
 *     - 'mercadopago'  → camino historico (cero regresion): changeCardForCoach (resuelve coach por
 *                        auth.uid(), NUNCA por el body; guards de estado/in-flight; PUT { card_token_id };
 *                        guard Q1; audit).
 *
 * El coach SIEMPRE se resuelve por `user.id` (auth.uid()) dentro del service — el body NUNCA trae
 * un mp_id/checkoutId/customerId (anti-IDOR). El `cardToken` no se loggea.
 */

const schema = z.object({
    // Requerido SOLO en la rama MercadoPago (tokenizacion sincrona con Secure Fields). La rama Flow
    // no manda cardToken — el cambio de tarjeta ahi es un redirect de re-enrolamiento, sin token.
    cardToken: z.string().min(8).max(256).optional(),
    acceptedTermsVersion: z.string().min(1),
    // DISPLAY-ONLY (no gatea nada): formato estricto para que un valor spoofeado no rompa la UI.
    last4: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    brand: z
        .string()
        .regex(/^[a-zA-Z0-9 _-]{1,40}$/)
        .optional(),
    paymentMethodId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{1,40}$/)
        .optional(),
})

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        // Gate de DINERO server-side: la ruta es alcanzable por API aun con la UI oculta → 403 si OFF.
        if (!CHANGE_CARD_ENABLED) {
            return NextResponse.json({ error: 'Función no disponible.', code: 'FEATURE_DISABLED' }, { status: 403 })
        }

        const rl = await rateLimitCardChange(user.id)
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        const parsed = schema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
                { status: 400 }
            )
        }
        const { cardToken, acceptedTermsVersion, last4, brand, paymentMethodId } = parsed.data

        // Consentimiento DEDICADO (Ley 19.496/21.398): versión vigente obligatoria (evidencia SERNAC).
        if (acceptedTermsVersion !== CARD_CHANGE_DISCLOSURE.version) {
            return NextResponse.json(
                { error: 'Debés aceptar las condiciones vigentes del cambio de tarjeta.', code: 'TERMS_OUTDATED' },
                { status: 400 }
            )
        }

        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

        // ── Bifurcacion por gateway (T5.5) — leido de DB, NUNCA del body (money-safety) ───────────
        const { data: gatewayRow } = await supabase
            .from('coaches')
            .select('subscription_provider, provider_customer_id')
            .eq('id', user.id)
            .maybeSingle()

        if (gatewayRow?.subscription_provider === 'flow') {
            if (!gatewayRow.provider_customer_id) {
                return NextResponse.json(
                    { error: 'Tu cuenta no tiene un cliente de Flow enrolado.', code: 'NO_FLOW_CUSTOMER' },
                    { status: 409 }
                )
            }
            const flowProvider = getPaymentsProvider('flow') as FlowProvider
            try {
                const { redirectUrl } = await flowProvider.startCardReenrollment(
                    gatewayRow.provider_customer_id,
                    // Puente publico /flow/retorno (303 → GET con cookies): el retorno de Flow es un
                    // POST cross-site y directo a /coach/* rebotaria a /login (incidente go-live).
                    `${appUrl}/flow/retorno?dest=card`
                )
                return NextResponse.json({ kind: 'redirect', redirectUrl }, { status: 200 })
            } catch (error) {
                console.error('[payments.change-card] Flow re-enrollment failed', {
                    coachId: user.id,
                    message: error instanceof Error ? error.message : String(error),
                })
                return NextResponse.json(
                    { error: 'No se pudo iniciar el cambio de tarjeta con Webpay. Intentá de nuevo.', code: 'GATEWAY_ERROR' },
                    { status: 502 }
                )
            }
        }

        // ── Rama MercadoPago (default, cero regresion) — requiere el cardToken tokenizado client-side ──
        if (!cardToken) {
            return NextResponse.json({ error: 'Token de tarjeta requerido.' }, { status: 400 })
        }

        const admin = createServiceRoleClient()
        const provider = getPaymentsProvider()

        const result = await changeCardForCoach(admin, provider, {
            coachId: user.id,
            cardToken,
            last4: last4 ?? null,
            brand: brand ?? null,
            paymentMethodId: paymentMethodId ?? null,
            acceptedTermsVersion,
            acceptedTermsText: JSON.stringify(CARD_CHANGE_DISCLOSURE.points),
            reactivateUrl: `${appUrl}/coach/reactivate`,
        })

        if (result.ok) {
            return NextResponse.json({ ok: true, last4: result.last4, brand: result.brand })
        }
        if (result.code === 'PREAPPROVAL_TERMINAL') {
            return NextResponse.json(
                { error: result.message, code: result.code, reactivateUrl: result.reactivateUrl },
                { status: result.status }
            )
        }
        return NextResponse.json(
            {
                error: result.message,
                code: result.code,
                retryable: 'retryable' in result ? result.retryable === true : false,
            },
            { status: result.status }
        )
    } catch (error) {
        // Mensaje genérico: nunca filtrar el body crudo de MP ni datos de tarjeta al cliente.
        console.error('[payments.change-card] error inesperado', {
            message: error instanceof Error ? error.message : String(error),
        })
        return NextResponse.json({ error: 'No se pudo cambiar la tarjeta.' }, { status: 500 })
    }
}
