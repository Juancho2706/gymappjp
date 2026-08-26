import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { rateLimitAuth } from '@/lib/rate-limit'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import {
    evaluateResendThrottle,
    readConfirmationResendTimestamps,
    recordConfirmationResend,
} from '@/lib/auth/resend-confirmation'

/**
 * NÚCLEO COMPARTIDO del botón «Reenviar correo» del banner de verificación (FCN W3.11).
 *
 * Lo escribió primero el server action del panel web
 * (`coach/dashboard/_actions/verify-email.actions.ts`); el banner de la APP necesita exactamente lo
 * mismo detrás de un Bearer (`api/mobile/auth/resend-verification`), así que la lógica vive acá y
 * las dos superficies la importan. Lo único que NO está acá es la resolución de identidad: la web
 * la saca de la cookie de sesión y el endpoint móvil de `admin.auth.getUser(token)`. Ese es el
 * único punto donde las superficies se diferencian, y por eso `userId`/`email` entran como
 * argumento — este helper NUNCA los acepta de un body ni de un formulario (ver el invariante de
 * `lib/auth/resend-confirmation.ts`: `generateLink` crea usuarios y manda links a la dirección que
 * reciba).
 *
 * POR QUÉ NO SE REUSA `resolveCoachConfirmationTarget`, que es la puerta del OTRO reenvío: ese
 * helper corta con `already_confirmed` si `auth.users.email_confirmed_at` está seteado o si el
 * coach ya salió de `pending_email`. Bajo D1 = A las dos cosas son ciertas para TODA alta free
 * desde el minuto cero, así que le contestaría «tu correo ya está confirmado» justo a la persona
 * que el banner intenta rescatar. Acá la puerta es la otra: `coaches.email_verified_at IS NULL`.
 *
 * FRENOS: el limitador de Upstash por usuario + el MISMO ledger durable
 * (`admin_audit_logs`/`coach.confirmation_resent`) que ya comparten la web y el móvil — el cupo es
 * de la persona, no de la pantalla: 60 s de cooldown y 5 en 24 h entre las tres superficies.
 * Fail-CLOSED en la lectura del ledger, igual que las otras dos.
 *
 * El correo es el de `linkType: 'magiclink'` (`resendCoachSignupConfirmationEmail`): GoTrue rechaza
 * `signup`/`invite` para un usuario que ya existe, que es siempre el caso acá.
 */

type Db = SupabaseClient<Database>

/**
 * Motivo del rechazo. El código es lo que consume cada superficie para decidir su HTTP status y su
 * copy; `error` es el mensaje YA redactado de la web (el móvil puede reemplazarlo, porque «Recarga
 * la página» no existe en un teléfono).
 */
export type ResendVerificationFailureCode =
    | 'rate_limited'
    | 'lookup_failed'
    | 'already_verified'
    | 'throttled'
    | 'send_failed'

export type ResendCoachEmailVerificationResult =
    | { ok: true }
    | {
          ok: false
          code: ResendVerificationFailureCode
          error: string
          /** Solo en `rate_limited`/`throttled`: segundos honestos de espera (el tope diario pide horas). */
          retryAfterSeconds?: number
      }

const GENERIC_ERROR = 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.'
const WAIT_ERROR = 'Espera un momento antes de volver a reenviar.'

export async function resendCoachEmailVerification(input: {
    /** Cliente service-role de quien llama (la web y el endpoint móvil ya tienen uno). */
    admin: Db
    /** Identidad de la SESIÓN (cookie) o del TOKEN (Bearer). Jamás del body. */
    userId: string
    /** Destino, resuelto por el caller desde `auth.users` del mismo usuario. */
    email: string
    /** Solo para la traza del ledger — NO particiona el cupo. */
    surface: 'web' | 'mobile'
}): Promise<ResendCoachEmailVerificationResult> {
    const { admin, userId, email, surface } = input

    const limited = await rateLimitAuth(`resend-confirmation:${userId}`)
    if (!limited.ok) {
        return {
            ok: false,
            code: 'rate_limited',
            error: `Espera ${limited.retryAfter}s antes de pedir otro reenvío.`,
            retryAfterSeconds: limited.retryAfter,
        }
    }

    const { data: coach, error } = await admin
        .from('coaches')
        .select('full_name, email_verified_at')
        .eq('id', userId)
        .maybeSingle()
    if (error || !coach) {
        return { ok: false, code: 'lookup_failed', error: GENERIC_ERROR }
    }
    if (coach.email_verified_at) {
        // Ya probó la casilla en otra pestaña/dispositivo: no se gasta un `generateLink`.
        return { ok: false, code: 'already_verified', error: 'Tu correo ya está verificado. Recarga la página.' }
    }

    const now = new Date()
    const ledger = await readConfirmationResendTimestamps(admin, userId, now)
    if (!ledger.ok) {
        // Fail-CLOSED: sin ledger legible no hay forma de saber si ya gastó sus 5. Log sin PII.
        console.error(`[verify-email-banner:${surface}] ledger read failed:`, ledger.error)
        return { ok: false, code: 'throttled', error: WAIT_ERROR }
    }
    const throttle = evaluateResendThrottle({ sentAtIso: ledger.sentAtIso, now })
    if (!throttle.allowed) {
        return {
            ok: false,
            code: 'throttled',
            error: WAIT_ERROR,
            retryAfterSeconds: throttle.retryAfterSeconds,
        }
    }

    // RESERVA antes de enviar: el ledger cuenta intentos, no éxitos (mismo criterio que las otras
    // dos superficies — `generateLink` es la operación cara y la que emite el token).
    await recordConfirmationResend(admin, userId, surface)

    const sent = await resendCoachSignupConfirmationEmail({
        email,
        coachName: coach.full_name ?? '',
    })
    if (!sent.ok) {
        return { ok: false, code: 'send_failed', error: GENERIC_ERROR }
    }

    return { ok: true }
}
