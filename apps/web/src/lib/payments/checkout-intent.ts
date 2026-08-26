import type { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { BillingCycle, SubscriptionTier } from '@/lib/constants'
import type { Json, TablesInsert } from '@/lib/database.types'

/**
 * INTENT DURABLE DE COMPRA — qué vino a comprar el coach, guardado APARTE de la fila `coaches`.
 *
 * Por qué existe (A1, ola checkout 25-08): la fila del coach ya NO puede llevar la intención de
 * compra. Un alta con tier pago nacía en `subscription_tier='pro'` + `subscription_status=
 * 'pending_payment'` ANTES de cobrar un peso, y `pending_payment` es bloqueo DURO sin gracia
 * (`lib/coach-subscription-gate.ts`): el coach que abandonaba MercadoPago se quedaba sin producto.
 * Desde esta ola TODA alta nace como un alta free (free + active + cupo free) y lo que el coach
 * quería comprar viaja acá. El tier pago lo escriben el webhook / confirm-subscription al CONFIRMAR
 * el pago, leyendo tier|ciclo del `external_reference` del checkout — nunca de la fila del coach.
 *
 * El mecanismo NO es nuevo: es exactamente el intent que la Fase 1 de Flow ya escribía en
 * `subscription_events` (`flow_checkout_intent:<coachId>`) porque su rama free tampoco podía
 * apoyarse en la fila del coach. Este módulo lo generaliza a los tres canales y deja el de Flow
 * BYTE-IDÉNTICO (misma clave, mismo `provider_status`, mismo payload) para no tocar la Fase 2
 * (`api/payments/flow/confirm-enrollment`), que lo lee por esa clave literal.
 *
 * Canales (una fila por canal y por coach — la UNIQUE de `provider_event_id` la mantiene única):
 *  - `signup`      → lo escribe el registro: el plan que el coach ELIGIÓ al crear la cuenta.
 *  - `mercadopago` → lo escribe create-preference: el plan del ÚLTIMO checkout MP pedido.
 *  - `flow`        → lo escribe create-preference: idem para Webpay/Flow. Lo LEE la Fase 2.
 *
 * ⚠️ `provider_status` NUNCA puede ser `'pending'`: ese valor es el que el cron
 * `api/cron/checkout-abandoned` usa para detectar un checkout muerto en la pasarela. Los intents
 * usan `<canal>_checkout_intent`, que ningún gateway emite.
 */

type AdminClient = ReturnType<typeof createServiceRoleClient>

export const CHECKOUT_INTENT_CHANNELS = ['signup', 'mercadopago', 'flow'] as const
export type CheckoutIntentChannel = (typeof CHECKOUT_INTENT_CHANNELS)[number]

export type CheckoutIntent = {
    tier: SubscriptionTier
    cycle: BillingCycle
    /** MODULE_KEYS ya saneados por el caller. Siempre array (vacío si no hay). */
    addons: string[]
    /** Cupón saneado del signup (REGISTER-CODE). Solo informativo: el canje vive en /processing. */
    coupon?: string | null
}

/** Clave única del intent. Para `flow` devuelve `flow_checkout_intent:<coachId>` (contrato vivo). */
export function checkoutIntentEventId(channel: CheckoutIntentChannel, coachId: string): string {
    return `${channel}_checkout_intent:${coachId}`
}

/** `provider_status` del intent. Jamás un estado de gateway real (ver la nota del cron arriba). */
export function checkoutIntentStatus(channel: CheckoutIntentChannel): string {
    return `${channel}_checkout_intent`
}

/**
 * Payload puro del intent. Se mantiene MÍNIMO y con las mismas tres claves que lee hoy
 * `flow/confirm-enrollment` (`tier` / `cycle` / `addons`); `coupon` solo aparece cuando existe,
 * para que el payload de Flow siga siendo idéntico al histórico.
 */
export function buildCheckoutIntentPayload(intent: CheckoutIntent): Json {
    return {
        tier: intent.tier,
        cycle: intent.cycle,
        addons: [...intent.addons],
        ...(intent.coupon ? { coupon: intent.coupon } : {}),
    } as Json
}

export type PersistCheckoutIntentResult = { ok: true } | { ok: false; error: string }

/**
 * Persiste (o PISA) el intent del canal. El último gesto manda: `onConflict: provider_event_id`
 * deja UN intent por canal y coach.
 *
 * NO lanza: devuelve el error para que cada caller decida su política. Hoy:
 *  - Flow (create-preference): falla DURA — sin intent la Fase 2 no puede completar el alta.
 *  - MercadoPago / signup: best-effort — el `external_reference` del checkout ya lleva tier|cycle
 *    y es la fuente de verdad del cobro; perder el intent no puede tumbar un alta ni un checkout.
 */
export async function persistCheckoutIntent(
    admin: AdminClient,
    args: {
        coachId: string
        channel: CheckoutIntentChannel
        /** Valor de la columna `provider` (gateway real, o el default para el canal `signup`). */
        provider: string
        intent: CheckoutIntent
    }
): Promise<PersistCheckoutIntentResult> {
    const row: TablesInsert<'subscription_events'> = {
        coach_id: args.coachId,
        provider: args.provider,
        provider_event_id: checkoutIntentEventId(args.channel, args.coachId),
        provider_status: checkoutIntentStatus(args.channel),
        payload: buildCheckoutIntentPayload(args.intent),
    }
    const { error } = await admin
        .from('subscription_events')
        .upsert(row, { onConflict: 'provider_event_id' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
}
