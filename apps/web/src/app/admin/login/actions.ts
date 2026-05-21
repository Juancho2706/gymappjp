'use server'

import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { redirect } from 'next/navigation'
import { LoginSchema } from '@eva/schemas'

export type AdminLoginState = {
    error?: string
    success?: boolean
}

export async function adminLoginAction(
    _prevState: AdminLoginState,
    formData: FormData
): Promise<AdminLoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const parsed = LoginSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    })

    if (error) {
        if (error.message.includes('Invalid login credentials')) {
            return { error: 'Email o contraseña incorrectos.' }
        }
        return { error: error.message }
    }

    // Verify the user is in admin allowlist
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Error al obtener la sesión.' }

    if (!isAdminEmail(user.email)) {
        await supabase.auth.signOut()
        return { error: 'Esta cuenta no tiene acceso al Panel CEO.' }
    }

    redirect('/admin/dashboard')
}
