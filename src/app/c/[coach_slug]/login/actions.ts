'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

const clientLoginSchema = z.object({
    email: z.string().email('Email inválido'),
    password: z.string().min(1, 'La contraseña es requerida'),
    coach_slug: z.string(),
})

export type ClientLoginState = {
    error?: string
    success?: boolean
    redirectUrl?: string
}

export async function clientLoginAction(
    _prev: ClientLoginState,
    formData: FormData
): Promise<ClientLoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        coach_slug: formData.get('coach_slug') as string,
    }

    const parsed = clientLoginSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const { email, password, coach_slug } = parsed.data
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        console.error('[LoginAction] Error signing in:', error.message)
        return { error: 'Email o contraseña incorrectos.' }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        console.error('[LoginAction] No user after successful sign in:', userError)
        return { error: 'Error al obtener sesión.' }
    }

    // Use admin client for the initial check to bypass RLS if it's restrictive
    const rawAdmin = await createRawAdminClient()

    // Verify the logged-in user is a client of this coach
    const { data: coachData, error: coachError } = await rawAdmin
        .from('coaches')
        .select('id')
        .eq('slug', coach_slug)
        .maybeSingle()

    if (coachError) {
        console.error('[LoginAction] Error fetching coach (admin):', coachError)
    }

    const coach = coachData as Pick<Coach, 'id'> | null

    if (!coach) {
        console.error('[LoginAction] Coach not found for slug (admin):', coach_slug)
        await supabase.auth.signOut()
        return { error: 'Coach no encontrado.' }
    }

    const { data: clientData, error: clientError } = await rawAdmin
        .from('clients')
        .select('id, force_password_change, is_active')
        .eq('id', user.id)
        .eq('coach_id', coach.id)
        .maybeSingle()
    
    if (clientError) {
        console.error('[LoginAction] Error fetching client (admin):', clientError)
    }

    const client = clientData as Pick<Client, 'id' | 'force_password_change' | 'is_active'> | null

    if (!client) {
        console.warn('[LoginAction] User is not a client of this coach (admin):', { userId: user.id, coachId: coach.id })
        await supabase.auth.signOut()
        return { error: 'No tienes acceso a esta plataforma.' }
    }

    if (client.is_active === false) {
        await supabase.auth.signOut()
        return { error: 'Tu cuenta ha sido pausada. Contacta a tu coach para más información.' }
    }

    const redirectUrl = client.force_password_change 
        ? `/c/${coach_slug}/change-password`
        : `/c/${coach_slug}/dashboard`

    return { success: true, redirectUrl }
}

// ----------------------------------------------------------------
// Change password action (for first login)
// ----------------------------------------------------------------
const changePasswordSchema = z.object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    confirm_password: z.string(),
    coach_slug: z.string(),
}).refine((d) => d.password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
})

export type ChangePasswordState = {
    error?: string
    success?: boolean
}

export async function changePasswordAction(
    _prev: ChangePasswordState,
    formData: FormData
): Promise<ChangePasswordState> {
    const raw = {
        password: formData.get('password') as string,
        confirm_password: formData.get('confirm_password') as string,
        coach_slug: formData.get('coach_slug') as string,
    }

    const parsed = changePasswordSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const { password, coach_slug } = parsed.data
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión expirada. Por favor inicia sesión de nuevo.' }

    // Update password in Auth
    const { error: authError } = await supabase.auth.updateUser({ password })
    if (authError) return { error: authError.message }

    // Mark force_password_change as false — use raw admin client (no type generic)
    // to work around Supabase v2 TypeScript inference issue on RLS-enabled tables
    const rawAdmin = await createRawAdminClient()
    await rawAdmin
        .from('clients')
        .update({ force_password_change: false })
        .eq('id', user.id)

    redirect(`/c/${coach_slug}/dashboard`)
}
