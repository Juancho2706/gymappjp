'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import {
    evaluateResendThrottle,
    readConfirmationResendTimestamps,
    recordConfirmationResend,
} from '@/lib/auth/resend-confirmation'
import { rateLimitAuth } from '@/lib/rate-limit'

export type ResendVerificationResult = { ok: true } | { ok: false; error: string }

/**
 * Reenvía el correo de verificación desde el PANEL del coach (banner de W3.11).
 *
 * POR QUÉ NO SE REUSA `resendConfirmationAction` de `(auth)/verify-email` — y esto es una colisión
 * real, no una preferencia: ese action decide con `resolveCoachConfirmationTarget`, que corta con
 * `already_confirmed` si `auth.users.email_confirmed_at` está seteado o si el coach ya salió de
 * `pending_email`. Bajo D1 = A las dos cosas son ciertas para TODA alta free desde el minuto cero,
 * así que ese camino le contestaría «tu correo ya está confirmado» exactamente a la persona que el
 * banner intenta rescatar. Acá la puerta es la otra: `coaches.email_verified_at IS NULL`.
 *
 * IDENTIDAD: siempre la de la SESIÓN. Este action no acepta ni email ni uid, así que no puede
 * convertirse en el emisor de magic-links contra cuentas ajenas que documenta
 * `lib/auth/resend-confirmation.ts`. El destino sale de `auth.users` del propio usuario.
 *
 * FRENO: el limitador de Upstash por usuario + el MISMO ledger durable
 * (`admin_audit_logs`/`coach.confirmation_resent`) que ya comparten la web y el móvil — el cupo es
 * de la persona, no de la pantalla: 60 s de cooldown y 5 en 24 h entre las tres superficies.
 * Fail-CLOSED en la lectura del ledger, igual que las otras dos.
 *
 * El correo es el de `linkType: 'magiclink'` (`resendCoachSignupConfirmationEmail`): GoTrue rechaza
 * `signup`/`invite` para un usuario que ya existe, que es siempre el caso acá.
 */
export async function resendCoachEmailVerificationAction(): Promise<ResendVerificationResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: 'Vuelve a iniciar sesión para reenviar el correo.' }

    const limited = await rateLimitAuth(`resend-confirmation:${user.id}`)
    if (!limited.ok) {
        return { ok: false, error: `Espera ${limited.retryAfter}s antes de pedir otro reenvío.` }
    }

    const admin = createServiceRoleClient()

    const { data: coach, error } = await admin
        .from('coaches')
        .select('full_name, email_verified_at')
        .eq('id', user.id)
        .maybeSingle()
    if (error || !coach) {
        return { ok: false, error: 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.' }
    }
    if (coach.email_verified_at) {
        // Ya probó la casilla en otra pestaña/dispositivo: no se gasta un `generateLink`.
        return { ok: false, error: 'Tu correo ya está verificado. Recarga la página.' }
    }

    const now = new Date()
    const ledger = await readConfirmationResendTimestamps(admin, user.id, now)
    if (!ledger.ok) {
        // Fail-CLOSED: sin ledger legible no hay forma de saber si ya gastó sus 5. Log sin PII.
        console.error('[verify-email-banner] ledger read failed:', ledger.error)
        return { ok: false, error: 'Espera un momento antes de volver a reenviar.' }
    }
    if (!evaluateResendThrottle({ sentAtIso: ledger.sentAtIso, now }).allowed) {
        return { ok: false, error: 'Espera un momento antes de volver a reenviar.' }
    }

    // RESERVA antes de enviar: el ledger cuenta intentos, no éxitos (mismo criterio que las otras
    // dos superficies — `generateLink` es la operación cara y la que emite el token).
    await recordConfirmationResend(admin, user.id, 'web')

    const sent = await resendCoachSignupConfirmationEmail({
        email: user.email,
        coachName: coach.full_name ?? '',
    })
    if (!sent.ok) {
        return { ok: false, error: 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.' }
    }

    return { ok: true }
}
