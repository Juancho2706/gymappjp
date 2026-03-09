'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ────────────────────────────────────────────────────────────────
// Create Client Action
// Uses Admin API (service_role) so the coach session is NOT affected
// ────────────────────────────────────────────────────────────────

const createClientSchema = z.object({
    full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    email: z.string().email('Email inválido'),
    temp_password: z
        .string()
        .min(8, 'La contraseña temporal debe tener al menos 8 caracteres'),
})

export type CreateClientState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
}

export async function createClientAction(
    _prev: CreateClientState,
    formData: FormData
): Promise<CreateClientState> {
    const raw = {
        full_name: formData.get('full_name') as string,
        email: formData.get('email') as string,
        temp_password: formData.get('temp_password') as string,
    }

    const parsed = createClientSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    // Get the currently authenticated coach
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }

    const { data: rawCoachData } = await supabase
        .from('coaches')
        .select('id, slug')
        .eq('id', coachUser.id)
        .maybeSingle()

    const coach = rawCoachData as Pick<import('@/lib/database.types').Coach, 'id' | 'slug'> | null

    if (!coach) return { error: 'Coach no encontrado.' }

    // Create the auth user with Admin API (does NOT sign out the coach)
    const admin = await createRawAdminClient()
    const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.temp_password,
        email_confirm: true, // auto-confirm so client can log in immediately
    })

    if (authError) {
        if (authError.message.includes('already been registered')) {
            return { error: 'Ya existe un usuario con ese email.' }
        }
        console.error('Admin createUser error:', authError)
        return { error: `Error al crear el usuario: ${authError.message}` }
    }

    // Insert the client record in public.clients
    const { error: dbError } = await admin.from('clients').insert({
        id: newAuthUser.user.id,
        coach_id: coach.id,
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        force_password_change: true,
    })

    if (dbError) {
        // Rollback: delete the auth user we just created
        await admin.auth.admin.deleteUser(newAuthUser.user.id)
        console.error('DB insert client error:', dbError)
        return { error: 'Error al guardar el alumno en la base de datos.' }
    }

    revalidatePath('/coach/clients')
    return { success: true }
}

// ────────────────────────────────────────────────────────────────
// Delete Client Action
// ────────────────────────────────────────────────────────────────

export async function deleteClientAction(clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }

    // Verify client belongs to this coach
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
        .maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    // Delete from Auth (cascades to public.clients via FK)
    const admin = await createRawAdminClient()
    const { error } = await admin.auth.admin.deleteUser(clientId)
    if (error) return { error: error.message }

    revalidatePath('/coach/clients')
    return {}
}
