'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import type { Tables } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTierMaxClients, type SubscriptionTier } from '@/lib/constants'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildClientWelcomeEmail, buildUpgradeRequiredEmail } from '@/lib/email/transactional-templates'
import {
    assertPlatformEmailAvailable,
    isAuthDuplicateEmailMessage,
    normalizePlatformEmail,
} from '@/lib/auth/platform-email'

// ────────────────────────────────────────────────────────────────
// Create Client Action
// Uses Admin API (service_role) so the coach session is NOT affected
// ────────────────────────────────────────────────────────────────

const createClientSchema = z.object({
    full_name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(100),
    email: z.string().email('Email inválido'),
    phone: z.string().optional(),
    subscription_start_date: z.string().optional(),
    temp_password: z
        .string()
        .min(8, 'La contraseña temporal debe tener al menos 8 caracteres'),
})

export type CreateClientState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
    newClientPhone?: string
    loginUrl?: string
    clientName?: string
    upgradeRequired?: boolean
    currentLimit?: number
}

export async function createClientAction(
    _prev: CreateClientState,
    formData: FormData
): Promise<CreateClientState> {
    const raw = {
        full_name: formData.get('full_name') as string,
        email: formData.get('email') as string,
        phone: formData.get('phone') as string,
        subscription_start_date: formData.get('subscription_start_date') as string,
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
        .select('id, slug, full_name, brand_name, welcome_message, subscription_tier, max_clients')
        .eq('id', coachUser.id)
        .maybeSingle()

    const coach = rawCoachData as Pick<Tables<'coaches'>, 'id' | 'slug' | 'full_name' | 'brand_name' | 'welcome_message' | 'subscription_tier' | 'max_clients'> | null

    if (!coach) return { error: 'Coach no encontrado.' }

    const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    const maxClients = coach.max_clients ?? getTierMaxClients(tier)
    const { count: activeClientsCount, error: countError } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)

    if (countError) {
        return { error: 'No pudimos validar el límite de alumnos de tu plan.' }
    }
    if ((activeClientsCount ?? 0) >= maxClients) {
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const { subject, html } = buildUpgradeRequiredEmail({
            coachName: coach.full_name ?? 'Coach',
            brandName: coach.brand_name ?? 'EVA',
            currentLimit: maxClients,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })
        sendTransactionalEmail({ to: coachUser.email!, subject, html }).catch(() => null)

        return {
            error: `Alcanzaste el límite de ${maxClients} alumnos de tu plan actual.`,
            upgradeRequired: true,
            currentLimit: maxClients,
        }
    }

    const admin = await createRawAdminClient()
    const emailNorm = normalizePlatformEmail(parsed.data.email)
    const availability = await assertPlatformEmailAvailable(admin, parsed.data.email)
    if (!availability.ok) {
        return { error: availability.error }
    }

    // Create the auth user with Admin API (does NOT sign out the coach)
    const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
        email: emailNorm,
        password: parsed.data.temp_password,
        email_confirm: true, // auto-confirm so client can log in immediately
    })

    if (authError) {
        if (isAuthDuplicateEmailMessage(authError.message)) {
            return { error: 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.' }
        }
        console.error('Admin createUser error:', authError)
        return { error: `Error al crear el usuario: ${authError.message}` }
    }

    // Insert the client record in public.clients
    const { error: dbError } = await admin.from('clients').insert({
        id: newAuthUser.user.id,
        coach_id: coach.id,
        full_name: parsed.data.full_name,
        email: emailNorm,
        phone: parsed.data.phone || null,
        subscription_start_date: parsed.data.subscription_start_date || null,
        force_password_change: true,
    })

    if (dbError) {
        // Rollback: delete the auth user we just created
        await admin.auth.admin.deleteUser(newAuthUser.user.id)
        console.error('DB insert client error:', dbError)
        if (dbError.code === '23505') {
            return { error: 'Este correo ya está registrado en la plataforma. Usa otro correo o inicia sesión si ya tienes cuenta.' }
        }
        return { error: 'Error al guardar el alumno en la base de datos.' }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
    const loginUrl = appUrl ? `${appUrl}/c/${coach.slug}/login` : `https://app.tu-dominio.com/c/${coach.slug}/login`
    const welcomeEmail = buildClientWelcomeEmail({
        brandName: coach.brand_name,
        coachName: coach.full_name,
        clientName: parsed.data.full_name,
        loginUrl,
        tempPassword: parsed.data.temp_password,
        welcomeMessage: coach.welcome_message,
    })
    const emailResult = await sendTransactionalEmail({
        to: emailNorm,
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
    })
    if (!emailResult.ok) {
        console.error('Welcome email delivery error:', emailResult.error)
    }

    revalidatePath('/coach/clients')
    return {
        success: true,
        newClientPhone: parsed.data.phone || undefined,
        loginUrl,
        clientName: parsed.data.full_name,
    }
}

// ────────────────────────────────────────────────────────────────
// Get Client Intake Action (for edit modal)
// ────────────────────────────────────────────────────────────────

export type ClientIntakeData = {
    full_name: string
    phone: string | null
    weight_kg: number | null
    height_cm: number | null
    goals: string | null
    experience_level: string | null
    availability: string | null
    injuries: string | null
    medical_conditions: string | null
}

export async function getClientIntakeAction(clientId: string): Promise<{ data?: ClientIntakeData; error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }

    const { data: client } = await supabase
        .from('clients')
        .select('full_name, phone, coach_id, client_intake(weight_kg, height_cm, goals, experience_level, availability, injuries, medical_conditions)')
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)
        .maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const intake = Array.isArray(client.client_intake) ? client.client_intake[0] : client.client_intake

    return {
        data: {
            full_name: client.full_name,
            phone: client.phone ?? null,
            weight_kg: intake?.weight_kg ?? null,
            height_cm: intake?.height_cm ?? null,
            goals: intake?.goals ?? null,
            experience_level: intake?.experience_level ?? null,
            availability: intake?.availability ?? null,
            injuries: intake?.injuries ?? null,
            medical_conditions: intake?.medical_conditions ?? null,
        },
    }
}

// ────────────────────────────────────────────────────────────────
// Update Client Data Action (name, phone + intake)
// ────────────────────────────────────────────────────────────────

const updateClientDataSchema = z.object({
    client_id: z.string().uuid(),
    full_name: z.string().min(2, 'Nombre muy corto').max(100),
    phone: z.string().optional(),
    weight_kg: z.coerce.number().positive().optional().or(z.literal('')),
    height_cm: z.coerce.number().positive().optional().or(z.literal('')),
    goals: z.string().optional(),
    experience_level: z.string().optional(),
    availability: z.string().optional(),
    injuries: z.string().optional(),
    medical_conditions: z.string().optional(),
})

export type UpdateClientDataState = {
    error?: string
    success?: boolean
    fieldErrors?: Record<string, string[]>
}

export async function updateClientDataAction(
    _prev: UpdateClientDataState,
    formData: FormData
): Promise<UpdateClientDataState> {
    const raw = {
        client_id: formData.get('client_id') as string,
        full_name: formData.get('full_name') as string,
        phone: formData.get('phone') as string,
        weight_kg: formData.get('weight_kg') as string,
        height_cm: formData.get('height_cm') as string,
        goals: formData.get('goals') as string,
        experience_level: formData.get('experience_level') as string,
        availability: formData.get('availability') as string,
        injuries: formData.get('injuries') as string,
        medical_conditions: formData.get('medical_conditions') as string,
    }

    const parsed = updateClientDataSchema.safeParse(raw)
    if (!parsed.success) {
        return { fieldErrors: parsed.error.flatten().fieldErrors }
    }

    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }

    // Update clients table
    const { error: clientErr } = await supabase
        .from('clients')
        .update({
            full_name: parsed.data.full_name,
            phone: parsed.data.phone || null,
        })
        .eq('id', parsed.data.client_id)
        .eq('coach_id', coachUser.id)

    if (clientErr) return { error: 'Error al actualizar datos del alumno.' }

    // Upsert client_intake
    const intakePayload = {
        client_id: parsed.data.client_id,
        weight_kg: parsed.data.weight_kg !== '' ? Number(parsed.data.weight_kg) : 0,
        height_cm: parsed.data.height_cm !== '' ? Number(parsed.data.height_cm) : 0,
        goals: parsed.data.goals || '',
        experience_level: parsed.data.experience_level || '',
        availability: parsed.data.availability || '',
        injuries: parsed.data.injuries || null,
        medical_conditions: parsed.data.medical_conditions || null,
    }

    const { error: intakeErr } = await supabase
        .from('client_intake')
        .upsert(intakePayload, { onConflict: 'client_id' })

    if (intakeErr) return { error: 'Error al actualizar datos de onboarding.' }

    revalidatePath('/coach/clients')
    revalidatePath(`/coach/clients/${parsed.data.client_id}`)
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

    const admin = await createRawAdminClient()

    // If this user is also a coach, preserve their auth account and coach data.
    // Only remove the client row; CASCADE cleans up all client-related data.
    const { data: coachProfile } = await admin.from('coaches').select('id').eq('id', clientId).maybeSingle()

    if (coachProfile) {
        const { error: delErr } = await admin
            .from('clients')
            .delete()
            .eq('id', clientId)
            .eq('coach_id', coachUser.id)
        if (delErr) return { error: delErr.message }
    } else {
        // Regular client: delete the auth user. The clients row (and all related
        // data via CASCADE) is automatically removed because clients.id FKs
        // to auth.users(id) ON DELETE CASCADE.
        const { error } = await admin.auth.admin.deleteUser(clientId)
        if (error) return { error: error.message }
    }

    revalidatePath('/coach/clients')
    return {}
}

// ────────────────────────────────────────────────────────────────
// Reset Client Password Action (Admin API)
// ────────────────────────────────────────────────────────────────

export async function resetClientPasswordAction(clientId: string): Promise<{ error?: string, tempPassword?: string }> {
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

    // Generate random 6-digit PIN
    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString()

    const admin = await createRawAdminClient()
    const { error: authError } = await admin.auth.admin.updateUserById(clientId, {
        password: tempPassword,
    })

    if (authError) return { error: `Error al actualizar: ${authError.message}` }

    // Force password change on next login
    const { error: dbError } = await supabase
        .from('clients')
        .update({ force_password_change: true })
        .eq('id', clientId)

    if (dbError) return { error: 'Error al actualizar base de datos.' }

    revalidatePath('/coach/clients')
    return { tempPassword }
}


export async function toggleClientStatusAction(clientId: string, isActive: boolean): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user: coachUser } } = await supabase.auth.getUser()
    if (!coachUser) return { error: 'No autenticado.' }

    // Usar admin client para asegurar que la actualización pase incluso si las políticas de RLS
    // aún no han sido aplicadas manualmente por el usuario.
    const admin = await createRawAdminClient()
    
    const { error } = await admin
        .from('clients')
        .update({ is_active: isActive })
        .eq('id', clientId)
        .eq('coach_id', coachUser.id)

    if (error) {
        console.error('Error toggling client status:', error)
        return { error: `Error al actualizar el estado: ${error.message}` }
    }

    revalidatePath('/coach/clients')
    return {}
}
