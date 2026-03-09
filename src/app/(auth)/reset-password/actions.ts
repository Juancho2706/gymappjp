'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const schema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
})

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
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

    if (error) {
        return { error: 'Error al actualizar la contraseña. El link puede haber expirado.' }
    }

    redirect('/login')
}
