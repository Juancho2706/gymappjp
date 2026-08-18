import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildCoachEmailConfirmationEmail } from '@/lib/email/transactional-templates'

type SendCoachEmailConfirmationInput = {
    email: string
    coachName: string
    password?: string
}

export type SendCoachEmailConfirmationResult =
    | { ok: true }
    | { ok: false; error: string }

function appBaseUrl() {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}

async function deliverConfirmationLink(input: {
    email: string
    coachName: string
    linkType: 'signup' | 'magiclink'
    password?: string
}): Promise<SendCoachEmailConfirmationResult> {
    const admin = createServiceRoleClient()
    const appUrl = appBaseUrl()

    // El REENVÍO usa `magiclink`, no `invite`: GoTrue rechaza `invite` (y `signup`) para un
    // usuario que ya existe, que es exactamente el caso del reenvío — el alta ya corrió y solo
    // falta confirmar. Verificar un magiclink confirma el email igual, y `/auth/confirm` activa
    // al coach `pending_email` en su rama de siempre. (QA pre-campaña 17-08: el camino viejo con
    // `invite` habría fallado en el primer uso real.)
    const { data, error } =
        input.linkType === 'signup'
            ? await admin.auth.admin.generateLink({
                  type: 'signup',
                  email: input.email,
                  password: input.password!,
                  options: { redirectTo: `${appUrl}/auth/confirm` },
              })
            : await admin.auth.admin.generateLink({
                  type: 'magiclink',
                  email: input.email,
                  options: { redirectTo: `${appUrl}/auth/confirm` },
              })

    if (error) {
        console.error('[coach-email-confirmation] generateLink:', error)
        return { ok: false, error: error.message }
    }

    const hashedToken = data.properties?.hashed_token
    if (!hashedToken) {
        return { ok: false, error: 'No se pudo generar el enlace de confirmación.' }
    }

    const otpType = input.linkType === 'signup' ? 'email' : 'magiclink'
    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${otpType}`
    const { subject, html } = buildCoachEmailConfirmationEmail({
        coachName: input.coachName,
        confirmUrl,
    })

    const sent = await sendTransactionalEmail({ to: input.email, subject, html })
    if (!sent.ok) {
        console.error('[coach-email-confirmation] Resend:', sent.error)
        return { ok: false, error: sent.error }
    }

    return { ok: true }
}

/**
 * Admin createUser does not send Supabase auth emails. Generate a signup OTP link
 * and deliver it via Resend to match /auth/confirm (verifyOtp token_hash flow).
 */
export async function sendCoachSignupConfirmationEmail(
    input: SendCoachEmailConfirmationInput & { password: string }
): Promise<SendCoachEmailConfirmationResult> {
    return deliverConfirmationLink({
        email: input.email,
        coachName: input.coachName,
        password: input.password,
        linkType: 'signup',
    })
}

/** Resend without password (verify-email page). */
export async function resendCoachSignupConfirmationEmail(
    input: SendCoachEmailConfirmationInput
): Promise<SendCoachEmailConfirmationResult> {
    return deliverConfirmationLink({
        email: input.email,
        coachName: input.coachName,
        linkType: 'magiclink',
    })
}
