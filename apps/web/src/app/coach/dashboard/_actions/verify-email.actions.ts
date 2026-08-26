'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resendCoachEmailVerification } from '@/lib/auth/resend-verification'

export type ResendVerificationResult = { ok: true } | { ok: false; error: string }

/**
 * Reenvía el correo de verificación desde el PANEL del coach (banner de W3.11).
 *
 * Este action ya NO tiene lógica propia: todo lo que decide (limitador por usuario, puerta
 * `coaches.email_verified_at IS NULL`, ledger durable de 60 s / 5 en 24 h, envío del magic-link)
 * vive en `lib/auth/resend-verification.ts`, compartido con el banner de la APP
 * (`api/mobile/auth/resend-verification`). Si mañana se endurece un freno, se endurece para las
 * dos superficies a la vez — y el cupo del ledger es de la PERSONA, no de la pantalla.
 *
 * Lo único que queda acá es lo único que de verdad cambia entre superficies: la IDENTIDAD. Acá sale
 * de la sesión por cookie; en el endpoint móvil, de `admin.auth.getUser(token)`. El action no acepta
 * ni email ni uid, así que no puede convertirse en el emisor de magic-links contra cuentas ajenas
 * que documenta `lib/auth/resend-confirmation.ts`.
 *
 * POR QUÉ NO SE REUSA `resendConfirmationAction` de `(auth)/verify-email` — y esto es una colisión
 * real, no una preferencia: ese action decide con `resolveCoachConfirmationTarget`, que corta con
 * `already_confirmed` si `auth.users.email_confirmed_at` está seteado o si el coach ya salió de
 * `pending_email`. Bajo D1 = A las dos cosas son ciertas para TODA alta free desde el minuto cero,
 * así que ese camino le contestaría «tu correo ya está confirmado» exactamente a la persona que el
 * banner intenta rescatar. Acá la puerta es la otra: `coaches.email_verified_at IS NULL`.
 *
 * El coach DE PAGO también lo ve hasta que confirme: nace `email_confirm: true` porque el pago
 * prueba identidad, no la casilla (W3.0 c). Es deliberado — él tampoco puede recuperar su clave.
 */
export async function resendCoachEmailVerificationAction(): Promise<ResendVerificationResult> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) return { ok: false, error: 'Vuelve a iniciar sesión para reenviar el correo.' }

    const result = await resendCoachEmailVerification({
        admin: createServiceRoleClient(),
        userId: user.id,
        email: user.email,
        surface: 'web',
    })

    return result.ok ? { ok: true } : { ok: false, error: result.error }
}
