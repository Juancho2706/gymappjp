'use server'

import { createClient } from '@/lib/supabase/server'
import { ForgotPasswordSchema } from '@eva/schemas'
import { headers } from 'next/headers'

export type ForgotPasswordState = {
    error?: string
    success?: boolean
}

export async function forgotPasswordAction(
    _prev: ForgotPasswordState,
    formData: FormData
): Promise<ForgotPasswordState> {
    // formData.get() devuelve null cuando el campo no esta en el form (sin coach/team slug en la
    // URL). Normalizamos null -> undefined para no chocar con la validacion de string del schema.
    const raw = {
        email: formData.get('email') as string,
        coach_slug: (formData.get('coach_slug') as string | null) ?? undefined,
        team_slug: (formData.get('team_slug') as string | null) ?? undefined,
    }
    const parsed = ForgotPasswordSchema.safeParse(raw)

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()

    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const appUrl = `${protocol}://${host}`

    // El alumno de team (pool) debe volver a su login white-label /t/[team_slug];
    // priorizamos team_slug sobre coach_slug para preservar la marca del pool.
    const resetParams = new URLSearchParams()
    if (raw.team_slug) resetParams.set('team_slug', raw.team_slug)
    if (raw.coach_slug) resetParams.set('coach_slug', raw.coach_slug)
    const queryString = resetParams.toString()
    const nextPath = queryString
        ? `/reset-password?${queryString}`
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
