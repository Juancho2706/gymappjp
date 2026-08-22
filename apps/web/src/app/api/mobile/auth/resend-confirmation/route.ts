import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { clientIpFromRequest, rateLimitAuth } from '@/lib/rate-limit'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { activateConfirmedFreeCoach } from '@/lib/auth/activate-confirmed-coach'
import {
    CONFIRMATION_RESEND_COOLDOWN_SECONDS,
    evaluateResendThrottle,
    readConfirmationResendTimestamps,
    recordConfirmationResend,
    resolveCoachConfirmationTarget,
} from '@/lib/auth/resend-confirmation'

/**
 * POST /api/mobile/auth/resend-confirmation — reenvío del correo de confirmación DESDE LA APP.
 *
 * El agujero que cierra (W4 del embudo Free→Pro): un coach que se registra en la app recibe el
 * correo de confirmación y, si cae en spam, la cuenta queda muerta. El login lo rechaza hasta
 * confirmar, re-registrarse está bloqueado porque el email ya existe, y el reenvío de la web exige
 * sesión o el `uid` que el alta móvil no devolvía. Callejón sin salida absoluto.
 *
 * ORDEN DE OPERACIONES (importa, y no es el orden "natural"):
 *   limitador por IP → parse del body → lectura del ledger (throttle) → resolución de identidad →
 *   ESCRITURA del ledger (reserva del cupo) → envío.
 * El ledger se escribe ANTES de enviar porque es el limitador, no un recibo: cuenta intentos, no
 * éxitos (ver `recordConfirmationResend`). Si el envío falla después de la reserva, la fila queda
 * —el cupo se consume— y la respuesta sigue siendo neutra.
 *
 * Los 7 guards, espejo de `(auth)/verify-email/_actions/resend.actions.ts` (los 1-4 viven
 * compartidos en `lib/auth/resend-confirmation.ts`):
 *
 *  1. El `uid` tiene que resolver a una fila de `coaches`.
 *  2. Solo `subscription_status = 'pending_email'` recibe reenvío — y además `auth.users` no puede
 *     tener `email_confirmed_at` (GoTrue manda sobre la fila del coach si ésta quedó regresada).
 *  3. El email destino sale de `auth.users` de ESE uid — NUNCA del body. `generateLink` crea
 *     usuarios y manda links a cuentas ajenas si se le pasa un email suelto.
 *  4. Rate-limit por uid: 60 s de cooldown + 5 en 24 h, contados en `admin_audit_logs`
 *     (`coach.confirmation_resent`). La web frena con Upstash por usuario, que es una ventana
 *     corta en memoria del limitador (y fail-open si no hay Redis): no da tope diario ni sobrevive
 *     a un reinicio, así que la ventana durable tiene que ser una tabla.
 *     ¿Por qué `admin_audit_logs` y no `coach_email_ledger`? Porque el ledger de correos deduplica
 *     por `(coach_id, template_key)` con un único parcial (`coach_email_ledger_dedupe_uidx`): la
 *     segunda fila del mismo reenvío ni siquiera entra, así que jamás podría contar 5 intentos en
 *     24 h. `admin_audit_logs` es append-only y ya era la traza operativa de esta acción.
 *     La lectura tiene índice: `admin_audit_logs (action, target_id, created_at desc)`
 *     (`supabase/migrations/*_admin_audit_logs_action_target_idx.sql`), YA APLICADO EN LIVE — sin
 *     él cada request de un endpoint sin autenticar era un scan por `action` sobre una tabla que
 *     no se purga nunca.
 *  5. Turnstile NO aplica. En la web el captcha protege un formulario público que acepta lo que le
 *     tipeen; acá la única entrada es un `uid` con 122 bits de aleatoriedad (UUID v4) que solo
 *     conoce quien acaba de registrarse (y el server lo devuelve una vez, en la respuesta del
 *     alta). Un bot sin ese secreto no puede hacer que este endpoint mande absolutamente nada. El
 *     volumen crudo lo acota el limitador por IP de acá arriba.
 *  6. Respuesta 200 `{ ok: true }` SIEMPRE, salvo dos casos: 400 por body inválido y 429 por
 *     cooldown/tope. Todo lo demás —uid inexistente, cuenta ya confirmada, Resend caído, una
 *     excepción cualquiera— sale neutro: distinguirlos convertiría el endpoint en un oráculo de
 *     "este uid existe y está sin confirmar". El 429 SÍ es un oráculo parcial (solo un uid de un
 *     coach pendiente puede acumular filas en el ledger, así que un 429 delata que ese uid existe);
 *     riesgo aceptado, porque cerrarlo exigiría escribir el ledger para uids arbitrarios —o sea,
 *     regalar un vector de escritura sin autenticar: un DoS de inserts contra `admin_audit_logs`.
 *     Con 122 bits de por medio, adivinar el uid para preguntarle al oráculo no es un ataque.
 *  7. Logs sin PII y sin el uid: es la credencial del endpoint. Los mensajes de error de terceros
 *     (Resend devuelve el `to` en el cuerpo del 4xx) se recortan al encabezado. La traza de los
 *     envíos queda en el ledger, que es donde corresponde.
 */

// `z.guid()` y no `z.uuid()`: es la misma laxitud que el `UUID_RE` del Server Action web (hex con
// guiones, sin chequear versión/variante). Un id de GoTrue es v4, pero rechazar por variante sería
// un guard que no aporta nada y sí puede dejar afuera ids legítimos (ver seeds no-RFC del repo).
const bodySchema = z.object({ uid: z.guid() })

const NEUTRAL_OK = { ok: true } as const

function neutralOk() {
    return NextResponse.json(NEUTRAL_OK)
}

function tooManyRequests(retryAfterSeconds: number) {
    return NextResponse.json(
        { error: 'Espera un momento antes de pedir otro correo.', code: 'RATE_LIMIT', retryAfter: retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    )
}

/**
 * Etiqueta segura para el log. `sendTransactionalEmail` devuelve `Resend ${status}: ${body}` y el
 * cuerpo del 4xx de Resend REPITE la dirección de destino; los errores de GoTrue también pueden
 * traerla. Al log va solo el encabezado (`Resend 422`), y si aun así aparece un `@` se descarta
 * entero: un correo en los logs de Vercel es PII fuera de la DB.
 */
function safeErrorLabel(error: unknown): string {
    const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
    const head = raw.split(':')[0]!.trim().slice(0, 60)
    return head.length > 0 && !head.includes('@') ? head : 'error'
}

export async function POST(request: NextRequest) {
    // Techo de volumen por IP (fail-open sin Redis, como el resto de la app). No reemplaza al
    // limitador por uid: protege contra el barrido de uids al azar, que el otro no ve.
    const ipRate = await rateLimitAuth(`resend-confirmation-ip:${clientIpFromRequest(request)}`)
    if (!ipRate.ok) return tooManyRequests(ipRate.retryAfter)

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Solicitud invalida.', code: 'VALIDATION_ERROR' },
            { status: 400 }
        )
    }

    const uid = parsed.data.uid

    // TODO lo que sigue va dentro del try: el 200 neutro es un INVARIANTE, no un camino feliz. Sin
    // esto, una excepción no envuelta —`fetch failed` de Resend (que `sendTransactionalEmail` deja
    // propagar), GoTrue caído, el service-role sin env— salía como 500, y un 500 solo puede pasar
    // después de resolver la identidad: convertiría el endpoint en el oráculo que el guard 6 evita.
    try {
        const admin = createServiceRoleClient()
        const now = new Date()

        // El limitador va ANTES de resolver el destino: así una tormenta de requests no gasta un
        // `getUserById` por intento, y un ledger ilegible corta acá (fail-closed) en vez de mandar.
        const ledger = await readConfirmationResendTimestamps(admin, uid, now)
        if (!ledger.ok) {
            console.error('[mobile-resend-confirmation] ledger read failed:', safeErrorLabel(ledger.error))
            return tooManyRequests(CONFIRMATION_RESEND_COOLDOWN_SECONDS)
        }

        const throttle = evaluateResendThrottle({ sentAtIso: ledger.sentAtIso, now })
        if (!throttle.allowed) {
            console.warn('[mobile-resend-confirmation] throttled:', throttle.reason)
            return tooManyRequests(throttle.retryAfterSeconds)
        }

        const target = await resolveCoachConfirmationTarget(admin, uid)
        if (target.status !== 'ok') {
            if (target.status === 'already_confirmed') {
                // SANACIÓN (22-08): «ya confirmado» en GoTrue con `coaches` todavía en `pending_email`
                // era un callejón —el proxy lo manda a /verify-email y este endpoint le decía que no
                // había nada que reenviar—. Si la fila quedó atrás, se cierra acá la transición por el
                // MISMO helper de `/auth/confirm` (idempotente; manda bienvenida + drip una sola vez).
                // La respuesta sigue siendo neutra: sanar o no sanar no puede leerse desde afuera.
                const healed = await activateConfirmedFreeCoach({
                    admin,
                    userId: uid,
                    appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
                })
                console.warn('[mobile-resend-confirmation] already_confirmed:', healed.activated ? 'healed' : healed.reason)
            } else {
                console.warn('[mobile-resend-confirmation] skipped:', target.status)
            }
            return neutralOk()
        }

        // Reserva del cupo ANTES del envío (ver `recordConfirmationResend`): a partir de acá el
        // intento está contado, salga o no salga el correo.
        await recordConfirmationResend(admin, uid, 'mobile')

        const sent = await resendCoachSignupConfirmationEmail({
            email: target.email,
            coachName: target.coachName,
            source: 'app',
        })
        if (!sent.ok) {
            // 200 igual: el error de Resend no puede convertirse en "ese uid existe".
            console.error('[mobile-resend-confirmation] send failed:', safeErrorLabel(sent.error))
        }
        return neutralOk()
    } catch (err) {
        console.error('[mobile-resend-confirmation] unhandled:', safeErrorLabel(err))
        return neutralOk()
    }
}
