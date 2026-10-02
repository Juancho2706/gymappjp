import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { isMetaCapiConfigured, sendMetaCapiEvent, type MetaCapiRequestContext } from '@/lib/meta/capi'
import {
    checkoutIntentEventId,
    readCheckoutIntentMeta,
    type CheckoutIntentChannel,
    type CheckoutIntentMeta,
} from '@/lib/payments/checkout-intent'
import { isTestCoachEmail } from '@/lib/test-accounts'

/**
 * Píxel de compra por servidor — plan C (`docs/specs/meta-purchase-capi`).
 *
 * Se llama justo después de cada `insertBillingSnapshot` de un cobro `recurring` (webhook MP/Flow
 * y la Fase 2 de Flow). Manda a Meta UN `Purchase` por coach: el de su PRIMER cobro real.
 *
 * Por qué no se usa el `{ inserted }` de `insertBillingSnapshot`: con `ignoreDuplicates` el upsert
 * devuelve siempre `inserted: true`, también en el reintento del webhook. Por eso «primer cobro» se
 * pregunta a la base: el snapshot MÁS ANTIGUO del coach tiene que ser ESTE cobro. Eso cubre:
 *  - el reintento del mismo webhook (mismo `event_id` ⇒ Meta lo descarta dentro de 48 h, y la marca
 *    `meta.purchase_sent` corta los siguientes);
 *  - el mismo primer cobro de Flow llegando por dos caminos con id distinto: solo uno es el más antiguo;
 *  - renovaciones y prorrateos: nunca son el más antiguo.
 *
 * Contexto: SIEMPRE explícito, con lo guardado en el intent del checkout cuando el coach eligió cómo
 * pagar (`fbp`, `fbc`, user-agent; sin IP). Nunca el del request en curso, que es de MP o de Flow.
 *
 * Nunca lanza y nunca demora más que el corte del helper (3 s): un fallo de Meta no puede tocar un pago.
 */

type Admin = SupabaseClient<Database>

export const META_PURCHASE_AUDIT_ACTION = 'meta.purchase_sent'

/** Coaches que no pagan de verdad: cuentas internas y beta. Sus cobros, si existieran, no van a Meta. */
const EXCLUDED_PAYMENT_PROVIDERS = new Set(['internal', 'beta'])

export const PURCHASE_EVENT_SOURCE_URL = 'https://www.eva-app.cl/coach/subscription'

export type FirstPurchaseInput = {
    coachId: string
    /** Gateway del cobro, igual que `billing_snapshots.provider`. */
    provider: string
    providerPaymentId: string
    totalClp: number
    tier: string
    cycle: string
}

export type FirstPurchaseOutcome =
    | 'sent'
    | 'not_configured'
    | 'zero_amount'
    | 'not_first_charge'
    | 'already_sent'
    | 'excluded_provider'
    | 'test_account'
    | 'send_failed'
    | 'error'

export function purchaseEventId(provider: string, providerPaymentId: string): string {
    return `purchase:${provider}:${providerPaymentId}`
}

/** Canal del intent que corresponde al gateway; el del registro queda de respaldo. */
function intentChannelsFor(provider: string): CheckoutIntentChannel[] {
    if (provider === 'flow') return ['flow', 'signup']
    if (provider === 'mercadopago') return ['mercadopago', 'signup']
    return ['signup']
}

async function loadIntentMeta(admin: Admin, coachId: string, provider: string): Promise<CheckoutIntentMeta | null> {
    const channels = intentChannelsFor(provider)
    const ids = channels.map((c) => checkoutIntentEventId(c, coachId))
    const { data } = await admin
        .from('subscription_events')
        .select('provider_event_id, payload')
        .in('provider_event_id', ids)
    const rows = data ?? []
    for (const id of ids) {
        const row = rows.find((r) => r.provider_event_id === id)
        const meta = readCheckoutIntentMeta(row?.payload ?? null)
        if (meta) return meta
    }
    return null
}

export function purchaseContextFromIntent(meta: CheckoutIntentMeta | null): MetaCapiRequestContext {
    return {
        fbp: meta?.fbp ?? null,
        fbc: meta?.fbc ?? null,
        // Nunca la IP: ni la del webhook (sería la de MP/Flow) ni guardada (Ley 21.719).
        clientIpAddress: null,
        clientUserAgent: meta?.ua ?? null,
        origin: null,
    }
}

export async function sendFirstPurchaseToMeta(
    admin: Admin,
    input: FirstPurchaseInput
): Promise<FirstPurchaseOutcome> {
    try {
        if (!isMetaCapiConfigured()) return 'not_configured'
        const value = Math.round(input.totalClp)
        if (!(value > 0)) return 'zero_amount'

        // 1) ¿Es el primer cobro del coach? El snapshot más antiguo tiene que ser este.
        const { data: first, error: firstError } = await admin
            .from('billing_snapshots')
            .select('provider, provider_payment_id')
            .eq('coach_id', input.coachId)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .limit(1)
            .maybeSingle()
        if (firstError) throw new Error(firstError.message)
        if (
            !first ||
            first.provider !== input.provider ||
            first.provider_payment_id !== input.providerPaymentId
        ) {
            return 'not_first_charge'
        }

        // 2) ¿Ya se mandó? (reintentos del webhook, o los dos caminos de Flow con el mismo id).
        const { data: sent, error: sentError } = await admin
            .from('admin_audit_logs')
            .select('id')
            .eq('action', META_PURCHASE_AUDIT_ACTION)
            .eq('target_id', input.coachId)
            .limit(1)
        if (sentError) throw new Error(sentError.message)
        if ((sent ?? []).length > 0) return 'already_sent'

        // 3) Fuera cuentas internas, beta y de prueba.
        const { data: coach } = await admin
            .from('coaches')
            .select('payment_provider')
            .eq('id', input.coachId)
            .maybeSingle()
        if (coach?.payment_provider && EXCLUDED_PAYMENT_PROVIDERS.has(coach.payment_provider)) {
            return 'excluded_provider'
        }
        const { data: authData } = await admin.auth.admin.getUserById(input.coachId)
        const email = authData?.user?.email ?? null
        if (isTestCoachEmail(email)) return 'test_account'

        // 4) Envío con el contexto guardado del navegador del coach.
        const eventId = purchaseEventId(input.provider, input.providerPaymentId)
        const meta = await loadIntentMeta(admin, input.coachId, input.provider)
        const result = await sendMetaCapiEvent({
            eventName: 'Purchase',
            eventId,
            eventSourceUrl: PURCHASE_EVENT_SOURCE_URL,
            actionSource: 'website',
            userData: { email, externalId: input.coachId },
            customData: {
                value,
                currency: 'CLP',
                content_name: `${input.tier}_${input.cycle}`,
            },
            context: purchaseContextFromIntent(meta),
        })
        if (!result.ok) return 'send_failed'

        // 5) Marca auditable (sin PII): corta los reintentos y deja rastro para conciliar con Meta.
        const { error: auditError } = await admin.from('admin_audit_logs').insert({
            admin_email: 'system',
            action: META_PURCHASE_AUDIT_ACTION,
            target_table: 'coaches',
            target_id: input.coachId,
            payload: {
                event_id: eventId,
                provider: input.provider,
                total_clp: value,
                with_browser_context: Boolean(meta),
            },
        })
        if (auditError) console.warn('[meta-purchase] marca de auditoría falló', auditError.message)
        return 'sent'
    } catch (err) {
        console.warn('[meta-purchase] no se pudo evaluar el envío', err instanceof Error ? err.message : String(err))
        return 'error'
    }
}
