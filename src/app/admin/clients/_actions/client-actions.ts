'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

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
