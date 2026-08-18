'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { rateLimitAuth } from '@/lib/rate-limit'

export type ResendConfirmationState = {
    ok?: boolean
    error?: string
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

    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) {
        return { error: 'No encontramos la cuenta. Vuelve a registrarte o escríbenos a soporte.' }
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('full_name, subscription_status')
        .eq('id', userId)
        .maybeSingle()

    if (!coach) {
        return { error: 'No encontramos la cuenta. Vuelve a registrarte o escríbenos a soporte.' }
    }
    if (coach.subscription_status !== 'pending_email') {
        return { error: 'Tu correo ya está confirmado. Puedes iniciar sesión directamente.' }
    }

    const sent = await resendCoachSignupConfirmationEmail({
        email,
        coachName: coach.full_name ?? '',
    })
    if (!sent.ok) {
        return { error: 'No pudimos reenviar el correo. Intenta de nuevo en un minuto.' }
    }

    return { ok: true }
}
