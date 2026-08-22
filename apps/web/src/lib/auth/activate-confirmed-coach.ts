import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'

type Db = SupabaseClient<Database>

/**
 * Activa al coach Free cuyo email GoTrue YA confirmó, venga por donde venga la confirmación.
 *
 * Por qué existe (22-08, dos coaches reales atascados el mismo día):
 * `coaches.subscription_status` pasaba de `pending_email` a `active` en UN solo lugar —
 * `/auth/confirm` con `type=email|magiclink`— pero GoTrue confirma el email por otros caminos que
 * nunca pasan por ahí:
 *   - el link de «olvidé mi contraseña»: `recoverVerify` marca `email_confirmed_at` y nuestra ruta
 *     entraba por la rama `recovery`, que redirigía al reset ANTES de la activación;
 *   - «Continuar con Google» con el mismo correo después de registrarse por email: Supabase linkea
 *     la identidad (correo verificado por Google) y `completeOAuthOnboarding` no corre porque la
 *     fila de `coaches` ya existía.
 * Resultado: auth confirmado, `coaches` en `pending_email`, el proxy manda a `/verify-email` para
 * siempre y el reenvío contesta «ya confirmado» (guard de W4.7). Callejón sin salida.
 *
 * Este helper es la ÚNICA transición `pending_email → active` del coach Free y es idempotente:
 *   - solo actúa si GoTrue dice confirmado (`email_confirmed_at`, o `confirmedNow` cuando el caller
 *     acaba de verificar un OTP — GoTrue confirma en esa misma llamada);
 *   - el UPDATE lleva `eq('subscription_status', 'pending_email')` y devuelve las filas tocadas:
 *     dos callers concurrentes (la página y el endpoint, por ejemplo) activan UNA vez y mandan los
 *     correos UNA vez;
 *   - los correos se esperan (`await`) y nunca lanzan hacia afuera: la cuenta ya quedó activa y un
 *     fallo de correo no puede convertirse en un 500 para alguien que acaba de confirmar.
 *
 * Logs sin PII: ni email ni uid (el uid es la credencial del reenvío móvil).
 */
export type ActivateConfirmedCoachResult =
    | { activated: true; emails: 'sent' | 'failed' }
    | {
          activated: false
          reason:
              | 'not_confirmed'
              | 'no_email'
              | 'not_found'
              | 'not_free'
              | 'not_pending'
              | 'update_failed'
              | 'raced'
      }

export type ActivateConfirmedCoachAuthUser = {
    email?: string | null
    email_confirmed_at?: string | null
}

export async function activateConfirmedFreeCoach(params: {
    admin: Db
    userId: string
    /** Base de los links de los correos (`NEXT_PUBLIC_SITE_URL` o el origin del request). */
    appUrl: string
    /**
     * Usuario de GoTrue si el caller ya lo tiene (`verifyOtp`, `getUser`). Si falta, se lee con el
     * service-role: así el endpoint móvil puede sanar por `uid` sin sesión.
     */
    authUser?: ActivateConfirmedCoachAuthUser | null
    /**
     * `true` cuando el caller acaba de verificar un OTP con éxito. El objeto que devuelve
     * `verifyOtp` puede venir sin `email_confirmed_at` poblado y aun así el email está confirmado.
     */
    confirmedNow?: boolean
}): Promise<ActivateConfirmedCoachResult> {
    const { admin, userId } = params

    let authUser: ActivateConfirmedCoachAuthUser | null | undefined = params.authUser
    if (!authUser) {
        const { data } = await admin.auth.admin.getUserById(userId)
        authUser = data?.user ?? null
    }

    const confirmed = params.confirmedNow === true || Boolean(authUser?.email_confirmed_at)
    if (!confirmed) return { activated: false, reason: 'not_confirmed' }

    const email = authUser?.email ?? null
    if (!email) return { activated: false, reason: 'no_email' }

    const { data: coach } = await admin
        .from('coaches')
        .select('id, subscription_status, subscription_tier, full_name, brand_name, invite_code')
        .eq('id', userId)
        .maybeSingle()

    if (!coach) return { activated: false, reason: 'not_found' }
    if (coach.subscription_tier !== 'free') return { activated: false, reason: 'not_free' }
    if (coach.subscription_status !== 'pending_email') return { activated: false, reason: 'not_pending' }

    // Transición CONDICIONAL: si otro caller ganó la carrera, acá vuelven cero filas y no se manda
    // nada (el ledger de correos deduplicaría igual, pero no hace falta llegar hasta ahí).
    const { data: flipped, error: updateError } = await admin
        .from('coaches')
        .update({ subscription_status: 'active' })
        .eq('id', coach.id)
        .eq('subscription_status', 'pending_email')
        .select('id')

    if (updateError) {
        console.error('[activate-confirmed-coach] update failed:', updateError.message)
        return { activated: false, reason: 'update_failed' }
    }
    if (!flipped || flipped.length === 0) return { activated: false, reason: 'raced' }

    // Bienvenida + drip ahora que el email está confirmado. `await` obligatorio: al devolver el
    // redirect Vercel congela la función y mata cualquier request pendiente — el 19-08 así se
    // perdieron 2 de 5 bienvenidas de este camino.
    try {
        await sendFreeCoachOnboardingEmails({
            admin,
            coachId: coach.id,
            email,
            coachName: coach.full_name ?? '',
            brandName: coach.brand_name ?? '',
            inviteCode: coach.invite_code,
            appUrl: params.appUrl,
        })
        return { activated: true, emails: 'sent' }
    } catch {
        console.warn('[activate-confirmed-coach] onboarding email failed')
        return { activated: true, emails: 'failed' }
    }
}
