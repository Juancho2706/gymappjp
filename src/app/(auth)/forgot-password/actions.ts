'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
    email: z.string().email('Email inválido'),
})

export type ForgotPasswordState = {
    error?: string
    success?: boolean
}

export async function forgotPasswordAction(
    _prev: ForgotPasswordState,
    formData: FormData
): Promise<ForgotPasswordState> {
    const raw = { email: formData.get('email') as string }
    const parsed = schema.safeParse(raw)

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
    })

    if (error) {
        console.error('Supabase password reset error:', error)
        return { error: 'No se pudo enviar el email. Verifica que el correo sea correcto.' }
    }

    return { success: true }
}
