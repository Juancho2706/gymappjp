import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitCardChange, jsonRateLimited } from '@/lib/rate-limit'
import { CHANGE_CARD_ENABLED, CARD_CHANGE_DISCLOSURE } from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { changeCardForCoach } from '@/services/billing/change-card.service'

/**
 * POST /api/payments/change-card — cambio de tarjeta IN-PLACE del coach standalone (Modalidad A).
 *
 * Guards en orden (plan P0-5/P0-6, espeja /api/payments/addons):
 *   auth → flag CHANGE_CARD_ENABLED (gate de DINERO server-side) → rate-limit fail-closed →
 *   canViewBilling (excluye org/team) → zod → consentimiento (CARD_CHANGE_DISCLOSURE.version) →
 *   changeCardForCoach (resuelve coach por auth.uid(), NUNCA por el body; guards de estado/in-flight;
 *   PUT { card_token_id }; guard Q1; audit).
 *
 * El coach SIEMPRE se resuelve por `user.id` (auth.uid()) dentro del service — el body NUNCA trae
 * un mp_id/checkoutId (anti-IDOR). El `cardToken` no se loggea.
 */

const schema = z.object({
    cardToken: z.string().min(8).max(256),
    acceptedTermsVersion: z.string().min(1),
    // DISPLAY-ONLY (no gatea nada): formato estricto para que un valor spoofeado no rompa la UI.
    last4: z
        .string()
        .regex(/^\d{4}$/)
        .optional(),
    brand: z
        .string()
        .regex(/^[a-zA-Z _-]{1,40}$/)
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
