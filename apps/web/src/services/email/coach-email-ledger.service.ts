import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    findActiveByCoachAndKeys,
    insertLedgerRow,
    listScheduledByCoach,
    markCancelNotPossible,
    markCancelled,
} from '@/infrastructure/db/coach-email-ledger.repository'

/**
 * Envío de correos a coaches CON LIBRO MAYOR (`coach_email_ledger`, migración 20260822004243).
 *
 * QUÉ RESUELVE (embudo Free→Pro W2.9/W2.10 + «correos por comportamiento» de onboarding v2):
 *
 * 1. **Dedupe por `(coach_id, template_key)`** — un mismo correo lógico se manda UNA vez por coach.
 *    Dos flujos distintos (el drip y un gatillo de comportamiento) pueden pedir el mismo
 *    `templateKey` sin que el coach reciba dos copias.
 * 2. **Cancelación real** — el drip agenda en Resend con `scheduled_at` a 2 y 14 días. Hasta ahora
 *    el `provider_message_id` que devuelve la API se tiraba a la basura, así que el D+2 «precio y
 *    link» le llegaba igual al coach que ya había pagado. Guardarlo es lo que hace posible
 *    `cancelCoachEmails`.
 *
 * TRES INVARIANTES:
 *
 * · **NUNCA LANZA.** Todo camino devuelve un resultado. Un correo es un efecto secundario: no puede
 *   tumbar un alta, un webhook de pago ni una corrida de cron.
 *
 * · **LEDGER FAIL-OPEN** (a diferencia del cron `cap-nudge`, que es fail-CLOSED). Si la lectura del
 *   dedupe falla, se manda igual y se loguea. Es la elección opuesta y es deliberada: `cap-nudge`
 *   barre a TODO el padrón cada día, así que un ledger ciego ahí significa spam diario perpetuo; acá
 *   el disparo es puntual (un alta, un pago, un comportamiento) y el peor caso de un ledger ciego es
 *   UN correo repetido. Perder el correo de bienvenida de un coach cuesta más que repetirlo.
 *
 * · **EL LEDGER NO ES EL ENVÍO.** Si Resend acepta el correo pero el insert de la fila falla, el
 *   resultado sigue siendo `ok` (con `ledgerId: null`): el correo YA salió, negarlo haría que el
 *   caller reintente y el coach reciba dos. Se loguea para que el hueco sea visible.
 */

type Db = SupabaseClient<Database>

export type CoachEmailTrigger = 'attempt' | 'sweep' | 'drip' | 'transactional' | 'behavior'

export type ScheduleCoachEmailInput = {
    coachId: string
    /** Identidad lógica del correo. Es la mitad de la clave de dedupe. */
    templateKey: string
    trigger: CoachEmailTrigger
    to: string
    subject: string
    html: string
    /** ISO. Presente = Resend lo agenda (y queda cancelable); ausente = sale ya. */
    scheduledAt?: string | null
    /** Contexto de auditoría. Nunca el cuerpo del correo ni datos sensibles. */
    payload?: Record<string, Json>
    /**
     * Saltea el dedupe y manda igual. HOY NADIE LA USA, y es deliberado que sea explícita: existe
     * para el día en que un correo legítimamente se repita (un recordatorio periódico con la misma
     * key, un reenvío pedido por soporte) sin que la salida sea «bajemos el dedupe para todos».
     *
     * ⚠️ El índice único parcial de la DB (`coach_email_ledger_dedupe_uidx`) NO se saltea: el
     * segundo INSERT con la misma `(coach_id, template_key)` viva sigue chocando con un `23505` y se
     * trata como carrera. Para repetir de verdad, el correo necesita una key distinta
     * (`nudge_cap_2026_09`, no `nudge_cap`).
     */
    force?: boolean
}

export type ScheduleCoachEmailResult =
    | { ok: true; ledgerId: string | null; providerMessageId: string | null; deduped: false }
    | { ok: true; deduped: true; ledgerId: string | null; providerMessageId: null }
    | { ok: false; reason: 'send_failed'; error: string }

/**
 * Las dos keys del drip de venta que dejan de tener sentido cuando el coach ya pagó. Las define el
 * módulo de plantillas (`lib/email/drip-templates.ts`); se exportan acá para que el webhook de pagos
 * y el drip compartan una sola fuente y no se desincronicen por un typo.
 */
export const DRIP_SALES_KEYS = [
    'day2_pro',
    'day14_last_call',
    // Reenvío único del día 2 (`scripts/day2-pro-catchup.ts`, D2 del owner 05-09): es el mismo
    // correo de venta con otra key, así que si el coach paga antes de que salga se cancela igual.
    'day2_pro_catchup',
] as const

/** Endpoint de cancelación de Resend. PURO (testeable sin red). */
export function resendCancelUrl(id: string): string {
    return `https://api.resend.com/emails/${encodeURIComponent(id)}/cancel`
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
}

/**
 * `23505` = unique_violation de Postgres. Acá solo lo puede tirar el índice parcial
 * `coach_email_ledger_dedupe_uidx` (o el UNIQUE de `provider_message_id`, que implica lo mismo:
 * esa fila ya está escrita). Se mira el `code` y no el mensaje: el texto cambia entre versiones.
 */
function isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505'
}

/** El `payload` de la fila es jsonb libre: solo se puede extender si hoy es un objeto plano. */
function asObject(value: Json | null | undefined): Record<string, Json> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, Json>)
        : {}
}

/**
 * Cancela UN correo agendado en Resend. Vive aparte porque tiene DOS llamadores: el barrido de
 * `cancelCoachEmails` y la carrera de dedupe de `scheduleCoachEmail` (que acaba de agendar un
 * correo que sobra y tiene que retirarlo sin fila que cerrar).
 *
 * `404`/`422` son TERMINALES, no fallos: significan «ese correo ya salió o no es cancelable». Un
 * agendado que ya se envió no se puede retirar, y contarlo como error hacía que cada cancelación
 * normal (webhook de Resend sin registrar ⇒ filas que quedan `scheduled` para siempre) reportara
 * fallos que nadie podía arreglar.
 */
async function cancelOneInResend(
    apiKey: string,
    providerMessageId: string
): Promise<
    | { outcome: 'cancelled' }
    | { outcome: 'already_sent'; status: number }
    | { outcome: 'failed'; status: number | null; message?: string }
> {
    try {
        const res = await fetch(resendCancelUrl(providerMessageId), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        })
        if (res.ok) return { outcome: 'cancelled' }
        if (res.status === 404 || res.status === 422) return { outcome: 'already_sent', status: res.status }
        return { outcome: 'failed', status: res.status }
    } catch (err) {
        return { outcome: 'failed', status: null, message: errMessage(err) }
    }
}

/**
 * Manda (o agenda) un correo al coach dejando su fila en el ledger.
 *
 * Orden deliberado: PRIMERO el dedupe, DESPUÉS Resend. Al revés se gastaría un envío para descubrir
 * que sobraba.
 */
export async function scheduleCoachEmail(
    admin: Db,
    input: ScheduleCoachEmailInput
): Promise<ScheduleCoachEmailResult> {
    const { coachId, templateKey, trigger, to, subject, html } = input
    const scheduledAt = input.scheduledAt ?? null

    // ── 1. Dedupe (fail-OPEN: un ledger ilegible no puede dejar sin correo a un coach) ──
    try {
        const existing = input.force
            ? []
            : await findActiveByCoachAndKeys(admin, coachId, [templateKey])
        if (existing.length > 0) {
            return { ok: true, deduped: true, ledgerId: existing[0].id, providerMessageId: null }
        }
    } catch (err) {
        console.warn('[coach-email-ledger] dedupe ilegible — se manda igual (fail-open)', {
            coachId,
            templateKey,
            message: errMessage(err),
        })
    }

    // ── 2. Envío ──
    let sent: Awaited<ReturnType<typeof sendTransactionalEmail>>
    try {
        sent = await sendTransactionalEmail({
            to,
            subject,
            html,
            ...(scheduledAt ? { scheduledAt } : {}),
        })
    } catch (err) {
        // `sendTransactionalEmail` no lanza por diseño, pero un fetch abortado o un mock roto sí.
        sent = { ok: false, error: errMessage(err) }
    }

    if (!sent.ok) {
        // Fila `failed` best-effort: es la única traza de que lo intentamos. NO bloquea el dedupe
        // (`failed` está fuera de `ACTIVE_LEDGER_STATUSES`), así que el correo puede reintentarse.
        await insertLedgerRow(admin, {
            coach_id: coachId,
            template_key: templateKey,
            trigger,
            status: 'failed',
            scheduled_at: scheduledAt,
            payload: { ...(input.payload ?? {}), to, subject, error: sent.error },
        }).catch((err) => {
            console.error('[coach-email-ledger] no se pudo registrar el envío fallido', {
                coachId,
                templateKey,
                message: errMessage(err),
            })
        })
        return { ok: false, reason: 'send_failed', error: sent.error }
    }

    // ── 3. Fila del envío exitoso ──
    const nowIso = new Date().toISOString()
    try {
        const row = await insertLedgerRow(admin, {
            coach_id: coachId,
            template_key: templateKey,
            trigger,
            status: scheduledAt ? 'scheduled' : 'sent',
            provider_message_id: sent.providerMessageId,
            scheduled_at: scheduledAt,
            sent_at: scheduledAt ? null : nowIso,
            payload: { ...(input.payload ?? {}), to, subject },
        })
        return {
            ok: true,
            deduped: false,
            ledgerId: row.id,
            providerMessageId: sent.providerMessageId,
        }
    } catch (err) {
        // ── Carrera de dedupe (I-7) ──────────────────────────────────────────────────────────
        // El `23505` lo tira el índice único parcial: entre nuestro SELECT y nuestro INSERT, OTRA
        // ejecución escribió la fila. Es el caso real del doble clic en el link de confirmación
        // (dos GET a `/auth/confirm` antes de que commitee el UPDATE a `pending_email`): las dos
        // pasan el dedupe y las dos agendan la serie entera en Resend.
        //
        // La fila NO es nuestra, así que no hay nada que cerrar; lo que sí es nuestro es el correo
        // que Resend acaba de aceptar, y hay que retirarlo. Solo se puede si estaba AGENDADO: uno
        // inmediato ya voló y el coach recibirá dos (mal menor, y ya no se puede evitar acá).
        if (isUniqueViolation(err)) {
            if (scheduledAt && sent.providerMessageId) {
                const apiKey = process.env.RESEND_API_KEY
                const undo = apiKey
                    ? await cancelOneInResend(apiKey, sent.providerMessageId)
                    : { outcome: 'failed' as const, status: null, message: 'sin RESEND_API_KEY' }
                if (undo.outcome === 'failed') {
                    console.error('[coach-email-ledger] carrera de dedupe: el duplicado NO se pudo retirar', {
                        coachId,
                        templateKey,
                        providerMessageId: sent.providerMessageId,
                        status: undo.status,
                    })
                }
            }
            console.warn('[coach-email-ledger] carrera de dedupe — otra ejecución ganó el INSERT', {
                coachId,
                templateKey,
                scheduled: Boolean(scheduledAt),
            })
            return { ok: true, deduped: true, ledgerId: null, providerMessageId: null }
        }

        // El correo YA salió: devolver un error acá haría que el caller reintente y el coach reciba
        // dos. Se degrada a `ledgerId: null` (ese correo queda sin dedupe ni cancelación posibles).
        console.error('[coach-email-ledger] correo enviado pero SIN fila de ledger', {
            coachId,
            templateKey,
            providerMessageId: sent.providerMessageId,
            message: errMessage(err),
        })
        return {
            ok: true,
            deduped: false,
            ledgerId: null,
            providerMessageId: sent.providerMessageId,
        }
    }
}

/**
 * Tope de filas por llamada. Con las dos keys del drip nunca se roza; con `'*'` (baja de cuenta) sí:
 * cada fila es un POST a Resend, y un coach con muchos agendados podía dejar la invocación
 * cancelando correos hasta el timeout de Vercel, justo en medio de un webhook de pago.
 *
 * `listScheduledByCoach` ordena por `scheduled_at`, así que el lote se come primero lo que está más
 * cerca de dispararse. Si sobran filas se loguea y la próxima llamada sigue.
 */
const CANCEL_BATCH_LIMIT = 50

export type CancelCoachEmailsResult = {
    /** Resend confirmó la cancelación y la fila quedó `cancelled`. */
    cancelled: number
    /** El correo ya había salido (404/422): la fila se cierra como `sent`. NO es un fallo. */
    alreadySent: number
    /** Todo lo demás: 5xx, red caída, fila agendada sin `provider_message_id`. */
    failed: number
}

/**
 * Cancela en Resend los correos AGENDADOS del coach para esas keys (`'*'` = todos) y cierra sus
 * filas. Se llama cuando el correo dejó de tener sentido: el coach subió de plan, cargó su primer
 * alumno, se dio de baja.
 *
 * Nunca lanza. `failed` cuenta SOLO lo que hay que mirar (5xx, red caída, fila sin id del
 * proveedor); el correo que ya se envió cae en `alreadySent`, que es un desenlace normal.
 */
export async function cancelCoachEmails(
    admin: Db,
    coachId: string,
    templateKeys: readonly string[] | '*'
): Promise<CancelCoachEmailsResult> {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
        console.error('[coach-email-ledger] cancelación sin RESEND_API_KEY — no se cancela nada', {
            coachId,
        })
        return { cancelled: 0, alreadySent: 0, failed: 0 }
    }

    let pending: Awaited<ReturnType<typeof listScheduledByCoach>>
    try {
        pending = await listScheduledByCoach(admin, coachId, templateKeys)
    } catch (err) {
        console.error('[coach-email-ledger] no se pudo listar lo agendado — cancelación abortada', {
            coachId,
            message: errMessage(err),
        })
        return { cancelled: 0, alreadySent: 0, failed: 0 }
    }

    if (pending.length > CANCEL_BATCH_LIMIT) {
        console.warn('[coach-email-ledger] más agendados que el tope del lote — quedan para la próxima', {
            coachId,
            total: pending.length,
            limit: CANCEL_BATCH_LIMIT,
        })
        pending = pending.slice(0, CANCEL_BATCH_LIMIT)
    }

    const cancelledIds: string[] = []
    let alreadySent = 0
    let failed = 0

    for (const row of pending) {
        if (!row.provider_message_id) {
            // Fila agendada sin id del proveedor: no hay nada que cancelar en Resend (la escribió un
            // envío al que le falló el id). Se cuenta como fallo para que aparezca en el resumen.
            failed += 1
            continue
        }

        const result = await cancelOneInResend(apiKey, row.provider_message_id)

        if (result.outcome === 'cancelled') {
            cancelledIds.push(row.id)
            continue
        }

        if (result.outcome === 'already_sent') {
            // El correo salió: la fila deja de ser `scheduled` (nada que cancelar nunca más) y el
            // motivo queda escrito en el payload. El merge lo arma el service porque jsonb se
            // reemplaza entero en un update.
            alreadySent += 1
            try {
                await markCancelNotPossible(admin, row.id, {
                    ...asObject(row.payload),
                    cancel_not_possible: result.status,
                })
            } catch (err) {
                console.warn('[coach-email-ledger] no se pudo cerrar la fila ya enviada', {
                    coachId,
                    templateKey: row.template_key,
                    message: errMessage(err),
                })
            }
            continue
        }

        failed += 1
        if (result.status === null) {
            console.warn('[coach-email-ledger] error de red cancelando en Resend', {
                coachId,
                templateKey: row.template_key,
                message: result.message,
            })
        } else {
            console.warn('[coach-email-ledger] Resend rechazó la cancelación', {
                coachId,
                templateKey: row.template_key,
                status: result.status,
            })
        }
    }

    if (cancelledIds.length > 0) {
        try {
            await markCancelled(admin, cancelledIds)
        } catch (err) {
            // Cancelado en Resend pero sin cerrar la fila: el correo NO se envía (que es lo que
            // importa) y la fila queda `scheduled` hasta el próximo intento, que dará 404 y caerá en
            // `alreadySent`. Se loguea para poder cerrarla a mano.
            console.error('[coach-email-ledger] cancelado en Resend pero la fila quedó abierta', {
                coachId,
                ids: cancelledIds,
                message: errMessage(err),
            })
        }
    }

    return { cancelled: cancelledIds.length, alreadySent, failed }
}
