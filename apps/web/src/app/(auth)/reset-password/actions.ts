'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ResetPasswordSchema } from '@eva/schemas'

export type ResetPasswordState = {
    error?: string
}

export async function resetPasswordAction(
    _prev: ResetPasswordState,
    formData: FormData
): Promise<ResetPasswordState> {
    const raw = {
        password: formData.get('password') as string,
        confirm_password: formData.get('confirm_password') as string,
        coach_slug: formData.get('coach_slug') as string | null
    }

    const parsed = ResetPasswordSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

    if (error) {
        return { error: 'Error al actualizar la contraseña. El link puede haber expirado.' }
    }

    const redirectPath = raw.coach_slug ? `/c/${raw.coach_slug}/login` : '/login'
    redirect(redirectPath)
}
