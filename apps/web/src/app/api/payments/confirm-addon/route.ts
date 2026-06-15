import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { mapProviderStatus } from '@/lib/payments/subscription-state'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { parseOneShotAddonReference } from '@/lib/payments/providers/mercadopago'
import { materializeAddonFromOneShot } from '@/services/billing/addons.service'
import { buildAddonPaymentsPort } from '../addons/_lib/payments-port'
import { fetchCoachBillingRow, normalizeCycle } from '../addons/_lib/coach-context'
import { SELF_SERVICE_ADDONS_ENABLED, type SubscriptionTier } from '@/lib/constants'

/**
 * POST /api/payments/confirm-addon — camino SÍNCRONO de confirmación del one-shot de add-on
 * (plan 05). Espejo de confirm-subscription: al volver del Checkout Pro, la pantalla
 * `addon-processing` llama acá con el `payment_id` que MP agregó al back_url, materializa la
 * fila del add-on en el acto y NO depende del webhook (que sigue como backstop idempotente).
 *
 * Idempotencia: `materializeAddonFromOneShot` reusa la fila viva preexistente (índice único
 * parcial `coach_addons_one_live_per_module`) — llamarlo dos veces (esta ruta + el webhook) no
 * duplica filas ni dispara dos PUT incoherentes. El `billing_snapshot` lo escribe SOLO el
 * webhook (dedup por `provider_payment_id`): acá NO se escribe para no competir.
 *
 * Guards en orden: auth → canViewBilling (excluye team/org) → rate-limit → paymentId (zod).
 * El monto/estado SIEMPRE los resuelve el server contra MP; el cliente solo manda el id.
 */

const schema = z.object({
    paymentId: z.string().min(1),
})

export async function POST(request: Request) {
    try {
        const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (!SELF_SERVICE_ADDONS_ENABLED) {
            return NextResponse.json({ error: 'Función no disponible.', code: 'FEATURE_DISABLED' }, { status: 403 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Billing disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        const rl = await rateLimitPayment(user.id)
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        const parsed = schema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }
        const { paymentId } = parsed.data

        const provider = getPaymentsProvider()
        let payment
        try {
            payment = await provider.fetchPaymentSnapshot(paymentId)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Provider fetch failed'
            return NextResponse.json({ error: message }, { status: 502 })
        }

        const status = mapProviderStatus(payment.status ?? null)
        // Pendiente/rechazado: NO se otorga nada (abandono = cero filas, cero módulos). La pantalla
        // sigue polleando hasta que el estado pase a activo o venza el timeout.
        if (status !== 'active') {
            return NextResponse.json({ ok: true, status })
        }

        const ref = parseOneShotAddonReference(payment.external_reference ?? null)
        if (!ref) {
            return NextResponse.json(
                { error: 'El pago no corresponde a un módulo.' },
                { status: 400 }
            )
        }
        // No-privilege-escalation: el reference debe pertenecer al coach de la sesión.
        if (ref.coachId !== user.id) {
            return NextResponse.json(
                { error: 'Este pago no pertenece al usuario actual.' },
                { status: 403 }
            )
        }

        const admin = createServiceRoleClient()
        const coach = await fetchCoachBillingRow(admin, user.id)
        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }
        if (!coach.subscription_mp_id) {
            // Backstop defensivo: el alta (POST /api/payments/addons) ya bloquea con 409
            // NO_ACTIVE_SUBSCRIPTION ANTES de cobrar cuando no hay preapproval, así que este camino es
            // rara vez alcanzable. Se conserva porque sin preapproval no hay dónde aplicar el PUT del
            // valor completo desde la renovación. NO cambiar su comportamiento (no es el punto de
            // prevención del charged-and-fail: ese vive en el alta, antes de tomar el dinero).
            return NextResponse.json(
                { error: 'No hay una suscripción activa donde sumar el módulo.' },
                { status: 409 }
            )
        }

        const payments = buildAddonPaymentsPort()
        // El snapshot del pago no trae fecha; usamos `now` (el webhook fija el valor canónico de
        // first_charged_at si llega antes — y materializeAddonFromOneShot es idempotente igual).
        const paidAt = new Date().toISOString()
        const { addon } = await materializeAddonFromOneShot(
            admin,
            payments,
            {
                coachId: user.id,
                tier: coach.subscription_tier as SubscriptionTier,
                cycle: normalizeCycle(coach.billing_cycle),
                subscriptionMpId: coach.subscription_mp_id,
            },
            ref.moduleKey,
            ref.termsVersion,
            paidAt
        )

        console.info('[payments.confirm-addon] materialized', {
            traceId,
            coachId: user.id,
            moduleKey: addon.moduleKey,
            paymentId,
        })

        return NextResponse.json({ ok: true, status: 'active', moduleKey: addon.moduleKey })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar el módulo.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
