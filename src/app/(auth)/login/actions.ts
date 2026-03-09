'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const loginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export type LoginState = {
    error?: string
    success?: boolean
}

export async function loginAction(
    _prevState: LoginState,
    formData: FormData
): Promise<LoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }

    const parsed = loginSchema.safeParse(raw)
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

    // Verify the user is actually a coach
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Error al obtener la sesión.' }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) {
        // Not a coach → sign them out
        await supabase.auth.signOut()
        return { error: 'Esta cuenta no tiene acceso al panel de Coach.' }
    }

    revalidatePath('/coach/dashboard')
    redirect('/coach/dashboard')
}
