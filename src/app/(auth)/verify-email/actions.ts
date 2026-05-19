'use server'

import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resendCoachSignupConfirmationEmail } from '@/lib/auth/send-coach-email-confirmation'
import { normalizePlatformEmail } from '@/lib/auth/platform-email'
import { z } from 'zod'

const schema = z.object({
    email: z.string().email('Email inválido'),
})

export type ResendConfirmationState = {
    error?: string
    success?: boolean
}

export async function resendConfirmationEmailAction(
    _prev: ResendConfirmationState,
    formData: FormData
): Promise<ResendConfirmationState> {
    const parsed = schema.safeParse({ email: formData.get('email') as string })
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const emailNorm = normalizePlatformEmail(parsed.data.email)
    const admin = createServiceRoleClient()

    const { data: coach } = await admin
        .from('coaches')
        .select('id, full_name, subscription_tier')
        .eq('trial_used_email', emailNorm)
        .eq('subscription_tier', 'free')
        .maybeSingle()

    if (!coach) {
        return { success: true }
    }

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(coach.id)
    if (authError || !authUser.user) {
        return { success: true }
    }

    if (authUser.user.email_confirmed_at) {
        return { error: 'Este correo ya está confirmado. Podés iniciar sesión.' }
    }

    const sent = await resendCoachSignupConfirmationEmail({
        email: authUser.user.email ?? parsed.data.email,
        coachName: coach.full_name ?? 'Coach',
    })

    if (!sent.ok) {
        return { error: 'No pudimos reenviar el correo. Intentá en unos minutos.' }
    }

    return { success: true }
}
