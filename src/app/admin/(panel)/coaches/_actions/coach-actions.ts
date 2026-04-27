'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

function revalidateAdmin() {
    revalidatePath('/admin/coaches', 'page')
    revalidatePath('/admin/dashboard', 'page')
    revalidateTag('admin-dashboard', 'default')
}

const UpdateCoachSchema = z.object({
    coachId: z.string().uuid(),
    full_name: z.string().min(1).optional(),
    brand_name: z.string().min(1).optional(),
    subscription_tier: z.enum(['starter', 'pro', 'elite', 'scale']).optional(),
    subscription_status: z.enum(['active', 'trialing', 'canceled', 'pending_payment', 'expired', 'past_due', 'paused']).optional(),
    max_clients: z.coerce.number().int().min(1).max(500).optional(),
    billing_cycle: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
    current_period_end: z.string().datetime().optional(),
    trial_ends_at: z.string().datetime().optional(),
    admin_notes: z.string().max(2000).optional(),
})

export async function updateCoachAction(_prev: unknown, formData: FormData) {
    const { adminClient } = await assertAdmin()

    const raw = Object.fromEntries(formData)
    const parsed = UpdateCoachSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const updateData: Record<string, unknown> = {}
    const fields = ['full_name', 'brand_name', 'subscription_tier', 'subscription_status', 'billing_cycle', 'current_period_end', 'trial_ends_at', 'admin_notes'] as const
    for (const f of fields) {
        if (raw[f]) updateData[f] = raw[f] as string
    }
    if (raw.max_clients) updateData.max_clients = Number(raw.max_clients)

    const { error } = await adminClient.from('coaches').update(updateData).eq('id', parsed.data.coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.update', 'coaches', parsed.data.coachId, updateData)
    revalidateAdmin()
    return { success: true }
}

export async function deleteCoachAction(coachId: string) {
    const { adminClient } = await assertAdmin()

    const { error: authError } = await adminClient.auth.admin.deleteUser(coachId)
    if (authError) console.error('[admin] failed to delete auth user:', authError)

    const { error: dbError } = await adminClient.from('coaches').delete().eq('id', coachId)
    if (dbError) return { error: dbError.message }

    await logAdminAction(adminClient, 'coach.delete', 'coaches', coachId, undefined)
    revalidateAdmin()
    return { success: true }
}

// Extend current_period_end by N days
export async function extendCoachPeriodAction(coachId: string, days: 7 | 14 | 30) {
    const { adminClient } = await assertAdmin()

    const { data: coach } = await adminClient.from('coaches').select('current_period_end').eq('id', coachId).single()
    const base = coach?.current_period_end && new Date(coach.current_period_end) > new Date()
        ? new Date(coach.current_period_end)
        : new Date()
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

    const { error } = await adminClient.from('coaches').update({ current_period_end: newEnd }).eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.period_extend', 'coaches', coachId, { days, new_period_end: newEnd })
    revalidateAdmin()
    return { success: true }
}

// Set subscription_status = 'paused'
export async function suspendCoachAction(coachId: string, reason?: string) {
    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'paused' })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.suspend', 'coaches', coachId, { reason: reason ?? null })
    revalidateAdmin()
    return { success: true }
}

// Force expired — coach will see /reactivate on next visit
export async function expireCoachAction(coachId: string) {
    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'expired' })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.force_expire', 'coaches', coachId, {})
    revalidateAdmin()
    return { success: true }
}

// Reactivate + extend period
export async function reactivateCoachAdminAction(coachId: string, extendDays = 30) {
    const { adminClient } = await assertAdmin()

    const newEnd = new Date(Date.now() + extendDays * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: 'active', current_period_end: newEnd })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.reactivate', 'coaches', coachId, { extend_days: extendDays })
    revalidateAdmin()
    return { success: true }
}

// Update current_period_end to a specific date
export async function updateCoachPeriodEndAction(coachId: string, newDate: string) {
    const parsed = z.string().datetime().safeParse(newDate)
    if (!parsed.success) return { error: 'Fecha inválida' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ current_period_end: newDate })
        .eq('id', coachId)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'coach.period_end_update', 'coaches', coachId, { new_date: newDate })
    revalidateAdmin()
    return { success: true }
}

// Bulk status update
export async function bulkCoachStatusAction(coachIds: string[], status: string) {
    const statusSchema = z.enum(['active', 'trialing', 'canceled', 'pending_payment', 'expired', 'past_due', 'paused'])
    if (!statusSchema.safeParse(status).success) return { error: 'Status inválido' }
    if (!coachIds.length) return { error: 'Sin coaches seleccionados' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_status: status })
        .in('id', coachIds)
    if (error) return { error: error.message }

    for (const id of coachIds) {
        await logAdminAction(adminClient, 'coach.bulk_status', 'coaches', id, { status })
    }
    revalidateAdmin()
    return { success: true }
}

// Bulk tier update
export async function bulkCoachTierAction(coachIds: string[], tier: string, maxClients: number) {
    const tierSchema = z.enum(['starter', 'pro', 'elite', 'scale'])
    if (!tierSchema.safeParse(tier).success) return { error: 'Tier inválido' }
    if (!coachIds.length) return { error: 'Sin coaches seleccionados' }

    const { adminClient } = await assertAdmin()

    const { error } = await adminClient.from('coaches')
        .update({ subscription_tier: tier, max_clients: maxClients })
        .in('id', coachIds)
    if (error) return { error: error.message }

    for (const id of coachIds) {
        await logAdminAction(adminClient, 'coach.bulk_tier', 'coaches', id, { tier, max_clients: maxClients })
    }
    revalidateAdmin()
    return { success: true }
}
