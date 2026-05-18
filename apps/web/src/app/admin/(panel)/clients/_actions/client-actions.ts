'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { normalizePlatformEmail, assertPlatformEmailAvailable } from '@/lib/auth/platform-email'

const UpdateClientSchema = z.object({
    clientId: z.string().uuid(),
    full_name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    is_active: z.coerce.boolean().optional(),
    coach_id: z.string().uuid().optional(),
})

export async function updateClientAction(_prev: unknown, formData: FormData) {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = UpdateClientSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const updateData: Record<string, unknown> = {}
    if (raw.full_name) updateData.full_name = raw.full_name as string
    if (raw.email) updateData.email = raw.email as string
    if (raw.phone) updateData.phone = raw.phone as string
    if (raw.is_active !== undefined) updateData.is_active = raw.is_active === 'true' || raw.is_active === 'on'
    if (raw.coach_id) updateData.coach_id = raw.coach_id as string

    const { error } = await adminClient
        .from('clients')
        .update(updateData)
        .eq('id', parsed.data.clientId)

    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'client.update', 'clients', parsed.data.clientId, updateData)
    revalidatePath('/admin/clients')
    return { success: true }
}

// ── Create Client ────────────────────────────────────────────────

const CreateClientSchema = z.object({
    coach_id: z.string().uuid(),
    full_name: z.string().min(2).max(100),
    email: z.string().email(),
    temp_password: z.string().min(8),
    phone: z.string().optional(),
})

export type CreateClientResult =
    | { success: true; clientId: string; email: string; tempPassword: string; loginUrl: string }
    | { error: string }

export async function createClientAction(
    _prev: CreateClientResult | null,
    formData: FormData
): Promise<CreateClientResult> {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = CreateClientSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const { coach_id, full_name, email, temp_password, phone } = parsed.data

    const { data: coach, error: coachErr } = await adminClient
        .from('coaches')
        .select('id, max_clients, full_name, brand_name, slug')
        .eq('id', coach_id)
        .single()

    if (coachErr || !coach) return { error: 'Coach no encontrado' }

    const { count } = await adminClient
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach_id)

    if ((count ?? 0) >= (coach.max_clients ?? 0)) {
        return { error: `El coach alcanzó su límite de ${coach.max_clients} alumnos` }
    }

    const emailNorm = normalizePlatformEmail(email)
    const availability = await assertPlatformEmailAvailable(adminClient, email)
    if (!availability.ok) return { error: availability.error }

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: emailNorm,
        password: temp_password,
        email_confirm: true,
    })
    if (authError || !authData.user) {
        return { error: authError?.message ?? 'Error al crear el usuario' }
    }

    const { error: clientError } = await adminClient.from('clients').insert({
        id: authData.user.id,
        coach_id,
        full_name,
        email: emailNorm,
        phone: phone || null,
        force_password_change: true,
        onboarding_completed: false,
    })

    if (clientError) {
        await adminClient.auth.admin.deleteUser(authData.user.id)
        return { error: clientError.message }
    }

    await logAdminAction(adminClient, 'client.create', 'clients', authData.user.id, {
        coach_id,
        coach_name: coach.full_name,
    })
    revalidatePath('/admin/clients')

    return {
        success: true,
        clientId: authData.user.id,
        email: emailNorm,
        tempPassword: temp_password,
        loginUrl: `/c/${coach.slug}/login`,
    }
}

export async function deleteClientAction(clientId: string) {
    const { adminClient } = await assertAdmin()

    const { error: authError } = await adminClient.auth.admin.deleteUser(clientId)
    if (authError) {
        console.error('[admin] failed to delete auth user:', authError)
    }

    const { error: dbError } = await adminClient
        .from('clients')
        .delete()
        .eq('id', clientId)

    if (dbError) return { error: dbError.message }

    await logAdminAction(adminClient, 'client.delete', 'clients', clientId, null)
    revalidatePath('/admin/clients')
    return { success: true }
}
