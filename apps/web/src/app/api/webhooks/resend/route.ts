import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyResendSignature } from '@/lib/email/resend-webhook-signature'
import {
    findByProviderMessageId,
    updateStatusByProviderMessageId,
    type CoachEmailLedgerStatus,
    type CoachEmailLedgerStatusPatch,
} from '@/infrastructure/db/coach-email-ledger.repository'
import type { Json } from '@/lib/database.types'

/**
 * Webhook de Resend — cierra el ciclo de vida del ledger de correos (`coach_email_ledger`).
 *
 * SIN ESTO el ledger solo sabe lo que EVA pidió («agendé», «mandé»), nunca lo que pasó después: un
 * correo que rebota queda para siempre como `sent` y el dedupe lo trata como entregado.
 *
 * URL a registrar en Resend (dashboard → Webhooks → Add):
 *   https://www.eva-app.cl/api/webhooks/resend
 *
 * AUTH: firma Svix (`svix-id` / `svix-timestamp` / `svix-signature`) contra `RESEND_WEBHOOK_SECRET`,
 * verificada por la función pura `verifyResendSignature`. FAIL-CLOSED: sin el secreto en el entorno
 * el endpoint responde 503 y no toca nada — un webhook público sin verificar es un `UPDATE` gratis
 * sobre la DB para cualquiera que sepa la URL.
 *
 * RESPUESTAS: 401 si la firma no valida; 503 si falta el secreto; 500 solo si la DB falla (para que
 * Svix reintente); 200 en todo lo demás, incluidos los eventos que no nos interesan y los correos
 * que no pasan por el ledger (bienvenidas, recibos, dunning: la mayoría). Un 4xx por un evento
 * desconocido haría que Resend marque el endpoint como caído.
 *
 * IDEMPOTENTE: la fila se localiza por `data.email_id` = `provider_message_id` (UNIQUE) y la
 * transición se escribe con el mismo valor cada vez. `onlyFromStatuses` protege del desorden de
 * entrega: un `email.sent` que llega tarde no puede pisar un `bounced` ya registrado.
 */

/** Nombres verificados en https://resend.com/docs/dashboard/webhooks/event-types (2026-08-21). */
const HANDLED_EVENTS = [
    'email.sent',
    'email.delivered',
    'email.bounced',
    'email.complained',
    'email.delivery_delayed',
    'email.failed',
    'email.suppressed',
] as const

type HandledEvent = (typeof HANDLED_EVENTS)[number]

/**
 * Eventos que ANOTAN en el `payload` y por eso necesitan leer la fila antes de escribirla: jsonb se
 * reemplaza entero en un update y PostgREST no sabe hacer `||`.
 */
const PAYLOAD_EVENTS = ['email.delivery_delayed', 'email.failed', 'email.suppressed'] as const

type PayloadEvent = (typeof PAYLOAD_EVENTS)[number]

/**
 * Transiciones directas (un solo UPDATE, sin leer). `onlyFrom` declara desde qué estados es legítimo
 * el salto (guard de orden): `bounced`/`complained` aplican SIEMPRE porque son la señal que más
 * importa conservar.
 */
const TRANSITIONS: Record<
    Exclude<HandledEvent, PayloadEvent>,
    { status: CoachEmailLedgerStatus; stamp?: 'sent_at' | 'delivered_at'; onlyFrom?: readonly CoachEmailLedgerStatus[] }
> = {
    'email.sent': { status: 'sent', stamp: 'sent_at', onlyFrom: ['scheduled', 'sent', 'failed'] },
    'email.delivered': {
        status: 'delivered',
        stamp: 'delivered_at',
        onlyFrom: ['scheduled', 'sent', 'delivered', 'failed'],
    },
    'email.bounced': { status: 'bounced' },
    'email.complained': { status: 'complained' },
}

/**
 * Guard de orden de `email.failed` / `email.suppressed`. Los dos dejan la fila `failed`, que es el
 * ÚNICO estado fuera del dedupe (`ACTIVE_LEDGER_STATUSES`) ⇒ el correo se puede reintentar. Por eso
 * mismo no pueden pisar un `delivered`, `bounced` ni `complained` que llegó antes: eso reabriría el
 * dedupe de una dirección que rebotó o que se quejó, justo lo que el dedupe existe para impedir.
 */
const FAILURE_ONLY_FROM: readonly CoachEmailLedgerStatus[] = ['scheduled', 'sent', 'failed']

type ResendWebhookBody = {
    type?: string
    created_at?: string
    data?: {
        email_id?: string
        /** `email.failed` trae el motivo acá (doc de Resend, 2026-08-21). */
        failed?: { reason?: string }
    }
}

function isHandled(type: string | undefined): type is HandledEvent {
    return (HANDLED_EVENTS as readonly string[]).includes(type ?? '')
}

function isPayloadEvent(type: HandledEvent): type is PayloadEvent {
    return (PAYLOAD_EVENTS as readonly string[]).includes(type)
}

/** El `payload` de la fila es jsonb libre; solo se puede extender si hoy es un objeto plano. */
function asObject(value: Json | undefined): Record<string, Json> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, Json>)
        : {}
}

export async function POST(request: Request) {
    const secret = process.env.RESEND_WEBHOOK_SECRET
    if (!secret) {
        console.error('[resend-webhook] RESEND_WEBHOOK_SECRET ausente — endpoint cerrado')
        return NextResponse.json({ ok: false, error: 'Webhook not configured' }, { status: 503 })
    }

    // Body CRUDO: la firma se calcula sobre estos bytes exactos.
    const rawBody = await request.text()
    const verified = verifyResendSignature({
        secret,
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signatureHeader: request.headers.get('svix-signature') ?? '',
        rawBody,
        now: new Date(),
    })
    if (!verified.ok) {
        console.warn('[resend-webhook] firma rechazada', { reason: verified.reason })
        return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
    }

    let body: ResendWebhookBody
    try {
        body = JSON.parse(rawBody) as ResendWebhookBody
    } catch {
        // Firma válida pero body ilegible: no hay nada que hacer y reintentarlo daría lo mismo.
        return NextResponse.json({ ok: true, ignored: true, reason: 'unparsable_body' })
    }

    const type = body.type
    if (!isHandled(type)) {
        return NextResponse.json({ ok: true, ignored: true, reason: 'unhandled_event', event: type ?? null })
    }

    const emailId = body.data?.email_id
    if (!emailId) {
        return NextResponse.json({ ok: true, ignored: true, reason: 'missing_email_id', event: type })
    }

    const admin = createServiceRoleClient()

    try {
        if (isPayloadEvent(type)) {
            // Estos tres anotan en el payload, así que hay que leer la fila primero: escribir el
            // marcador a secas borraría el `to`/`subject`/`utm` que dejó el envío.
            const row = await findByProviderMessageId(admin, emailId)
            if (!row) return NextResponse.json({ ok: true, ignored: true, reason: 'no_ledger_row', event: type })
            const at = body.created_at ?? new Date().toISOString()

            if (type === 'email.delivery_delayed') {
                // Solo anota: el correo sigue en camino, el estado NO cambia. `onlyFromStatuses` con
                // el estado que acabamos de leer es el guard contra la carrera: si entre el SELECT y
                // el UPDATE llegó el `bounced`, este update no matchea nada en vez de reescribir el
                // estado viejo encima.
                const { matched } = await updateStatusByProviderMessageId(
                    admin,
                    emailId,
                    {
                        status: row.status,
                        payload: { ...asObject(row.payload), delivery_delayed_at: at },
                    },
                    { onlyFromStatuses: [row.status] }
                )
                if (!matched) {
                    return NextResponse.json({ ok: true, ignored: true, reason: 'stale_status', event: type })
                }
                return NextResponse.json({ ok: true, event: type, status: row.status })
            }

            // `email.failed` (Resend no pudo entregarlo) y `email.suppressed` (la dirección está en
            // la lista de supresión) dejan la fila `failed`: el correo NUNCA salió, así que sale del
            // dedupe y se puede reintentar cuando el motivo se resuelva.
            const payload: Record<string, Json> = { ...asObject(row.payload) }
            if (type === 'email.suppressed') payload.suppressed = true
            const reason = body.data?.failed?.reason
            if (reason) payload.error = reason

            const { matched } = await updateStatusByProviderMessageId(
                admin,
                emailId,
                { status: 'failed', payload },
                { onlyFromStatuses: FAILURE_ONLY_FROM }
            )
            if (!matched) {
                return NextResponse.json({ ok: true, ignored: true, reason: 'stale_status', event: type })
            }
            return NextResponse.json({ ok: true, event: type, status: 'failed' })
        }

        const transition = TRANSITIONS[type]
        const patch: CoachEmailLedgerStatusPatch = { status: transition.status }
        if (transition.stamp) patch[transition.stamp] = body.created_at ?? new Date().toISOString()

        const { matched } = await updateStatusByProviderMessageId(admin, emailId, patch, {
            onlyFromStatuses: transition.onlyFrom,
        })
        if (!matched) {
            // Lo normal: el correo no pasa por el ledger (bienvenidas, recibos, dunning). También cae
            // acá un evento fuera de orden que el guard descartó.
            return NextResponse.json({ ok: true, ignored: true, reason: 'no_ledger_row', event: type })
        }
        return NextResponse.json({ ok: true, event: type, status: transition.status })
    } catch (err) {
        // La DB falló: 500 para que Svix reintente (el reintento es idempotente). Un 200 acá perdería
        // el evento para siempre.
        console.error('[resend-webhook] no se pudo aplicar el evento al ledger', {
            event: type,
            message: err instanceof Error ? err.message : String(err),
        })
        return NextResponse.json({ ok: false, error: 'Ledger update failed' }, { status: 500 })
    }
}
