'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { activateConfirmedFreeCoach } from '@/lib/auth/activate-confirmed-coach'
import {
    evaluateResendThrottle,
    readConfirmationResendTimestamps,
    recordConfirmationResend,
    resolveCoachConfirmationTarget,
} from '@/lib/auth/resend-confirmation'
import { rateLimitAuth } from '@/lib/rate-limit'

export type ResendConfirmationState = {
    ok?: boolean
    error?: string
    /** Buena noticia que no es un reenvío: la cuenta quedó activa al pedirlo (sanación). */
    message?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Reenvía el correo de confirmación del coach recién registrado.
 *
 * Existe por el QA pre-campaña 17-08: si el correo caía en spam o se perdía, el coach quedaba en
 * un callejón sin salida ABSOLUTO — el login lo rechaza hasta confirmar (con un mensaje que
 * encima le dice que se equivocó de clave), re-registrarse está bloqueado porque el email ya
 * existe, y el helper de reenvío llevaba semanas huérfano sin un solo llamador. Es el caso Ivan
 * del 16-08, que exigió intervención manual — con tráfico pago, escala lineal con el gasto.
 *
 * La identidad NUNCA sale del formulario. `generateLink({ type: 'magiclink' })` CREA el usuario si
 * el email no existe (documentado en `GoTrueAdminApi.d.ts`: "handles the creation of the user for
 * signup, invite and magiclink"), así que aceptar un email suelto convertía este endpoint en una
 * fábrica de `auth.users` huérfanos para cualquier dirección tipeada, y en un emisor de
 * magic-links para cuentas ajenas ya activas (alumnos incluidos). Se resuelve al revés: id de la
 * sesión (el proxy manda acá al coach `pending_email` logueado) o el `uid` que el registro pone en
 * la URL → `getUserById` da el email AUTORITATIVO → sólo se envía si ese id es un coach en
 * `pending_email`. Sin id resoluble no se genera ningún link.
 *
 * Esos guards viven desde W4 en `lib/auth/resend-confirmation.ts`, compartidos con el endpoint
 * móvil (`api/mobile/auth/resend-confirmation`). El limitador de Upstash por usuario sigue igual —
 * es el techo de volumen de esta superficie— y encima se suma el ledger durable de
 * `admin_audit_logs`, que la web LEE y ESCRIBE con las mismas reglas que el móvil:
 *
 * · Lee, porque el cupo es de la persona, no de la pantalla. Si la web solo escribiera, alguien
 *   podría vaciar los 5 del día desde el navegador y dejar el botón de la app dando 429 sin que la
 *   web misma se hubiera frenado nunca. Ahora las dos superficies comparten freno y ventana.
 * · Escribe ANTES de enviar (reserva; ver `recordConfirmationResend`): el ledger cuenta intentos.
 *
 * El mensaje del throttle es deliberadamente romo («Espera un momento…»): no dice si frenó el
 * cooldown de 60 s o el tope diario, ni cuánto falta. Acá el uid puede venir de la URL, así que
 * cualquier detalle sería el mismo oráculo que el endpoint móvil se cuida de no ser.
 */
export async function resendConfirmationAction(
    _prev: ResendConfirmationState,
    formData: FormData
): Promise<ResendConfirmationState> {
    const uidParam = (formData.get('uid') as string | null)?.trim() ?? ''

    const supabase = await createClient()
    const {
        data: { user: sessionUser },
    } = await supabase.auth.getUser()

    const userId = sessionUser?.id ?? (UUID_RE.test(uidParam) ? uidParam : null)
    if (!userId) {
        return {
            error: 'No pudimos identificar tu cuenta desde este enlace. Vuelve a registrarte o escríbenos a soporte.',
        }
    }

    const limited = await rateLimitAuth(`resend-confirmation:${userId}`)
    if (!limited.ok) {
        return { error: `Espera ${limited.retryAfter}s antes de pedir otro reenvío.` }
    }

    const admin = createServiceRoleClient()

    const target = await resolveCoachConfirmationTarget(admin, userId)
    if (target.status === 'not_found') {
        return { error: 'No encontramos la cuenta. Vuelve a registrarte o escríbenos a soporte.' }
    }
    if (target.status === 'already_confirmed') {
        // SANACIÓN (22-08): si GoTrue ya confirmó el email pero `coaches` quedó en `pending_email`
        // (link de recuperación, Google con el mismo correo), el coach está encerrado entre el
        // proxy y este mensaje. Se cierra acá la transición por el MISMO helper de `/auth/confirm`.
        const healed = await activateConfirmedFreeCoach({
            admin,
            userId,
            appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.eva-app.cl',
        })
        if (healed.activated) {
            return { message: 'Tu cuenta ya está activa. Inicia sesión para entrar al panel.' }
        }
        return { error: 'Tu correo ya está confirmado. Puedes iniciar sesión directamente.' }
    }

    const now = new Date()
    const ledger = await readConfirmationResendTimestamps(admin, userId, now)
    if (!ledger.ok) {
        // Fail-CLOSED, igual que el móvil: sin ledger legible no hay forma de saber si este uid ya
        // gastó sus 5, y un reenvío de más no vale saltarse el limitador. Log sin uid ni email.
        console.error('[resend-confirmation] ledger read failed:', ledger.error)
        return { error: 'Espera un momento antes de volver a reenviar.' }
    }
    if (!evaluateResendThrottle({ sentAtIso: ledger.sentAtIso, now }).allowed) {
        return { error: 'Espera un momento antes de volver a reenviar.' }
    }

    await recordConfirmationResend(admin, userId, 'web')

    const sent = await resendCoachSignupConfirmationEmail({
        email: target.email,
        coachName: target.coachName,
    })
    if (!sent.ok) {
        return { error: 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.' }
    }

    return { ok: true }
}
