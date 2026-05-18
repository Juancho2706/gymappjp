'use server'

import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { headers } from 'next/headers'

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
    const raw = { 
        email: formData.get('email') as string,
        coach_slug: formData.get('coach_slug') as string | null
    }
    const parsed = schema.safeParse(raw)

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()

    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    const nextPath = raw.coach_slug 
        ? `/reset-password?coach_slug=${raw.coach_slug}` 
        : '/reset-password'

    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`,
    })

    if (error) {
        console.error('Supabase password reset error:', error)
        return { error: 'No se pudo enviar el email. Verifica que el correo sea correcto.' }
    }

    return { success: true }
}
