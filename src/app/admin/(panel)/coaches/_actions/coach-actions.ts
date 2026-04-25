'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

const UpdateCoachSchema = z.object({
    coachId: z.string().uuid(),
    full_name: z.string().min(1).optional(),
    brand_name: z.string().min(1).optional(),
    subscription_tier: z.enum(['starter', 'pro', 'elite', 'scale']).optional(),
    subscription_status: z.enum(['active', 'trialing', 'canceled', 'pending_payment', 'expired', 'past_due', 'paused']).optional(),
    max_clients: z.coerce.number().int().min(1).max(500).optional(),
    billing_cycle: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
})

export async function updateCoachAction(_prev: unknown, formData: FormData) {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = UpdateCoachSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const updateData: Record<string, unknown> = {}
    if (raw.full_name) updateData.full_name = raw.full_name as string
    if (raw.brand_name) updateData.brand_name = raw.brand_name as string
    if (raw.subscription_tier) updateData.subscription_tier = raw.subscription_tier as string
    if (raw.subscription_status) updateData.subscription_status = raw.subscription_status as string
    if (raw.max_clients) updateData.max_clients = Number(raw.max_clients)
    if (raw.billing_cycle) updateData.billing_cycle = raw.billing_cycle as string

    const { error } = await adminClient
        .from('coaches')
        .update(updateData)
        .eq('id', parsed.data.coachId)

    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.update', 'coaches', parsed.data.coachId, updateData)
    revalidatePath('/admin/coaches')
    revalidatePath('/admin/dashboard')
    return { success: true }
}

export async function deleteCoachAction(coachId: string) {
    const { adminClient } = await assertAdmin()

    // Delete the auth user (this cascades to coach via RLS if configured, but we do it explicitly)
    const { error: authError } = await adminClient.auth.admin.deleteUser(coachId)
    if (authError) {
        console.error('[admin] failed to delete auth user:', authError)
    }

    // Delete coach row (clients and other data should be handled by ON DELETE CASCADE or manual cleanup)
    const { error: dbError } = await adminClient
        .from('coaches')
        .delete()
        .eq('id', coachId)

    if (dbError) return { error: dbError.message }

    await logAdminAction(adminClient, 'coach.delete', 'coaches', coachId, undefined)
    revalidatePath('/admin/coaches')
    revalidatePath('/admin/dashboard')
    return { success: true }
}
