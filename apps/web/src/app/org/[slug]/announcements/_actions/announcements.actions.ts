'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const CreateAnnouncementSchema = z.object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
    active_until: z.string().optional(),
})

async function resolveAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' as const }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' as const }

    return { user, org, supabase }
}

export async function createAnnouncementAction(orgSlug: string, _prev: unknown, formData: FormData) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsed = CreateAnnouncementSchema.safeParse({
        title: formData.get('title'),
        body: formData.get('body'),
        active_until: formData.get('active_until') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()
    const { error } = await admin.from('org_announcements').insert({
        org_id: ctx.org.id,
        title: parsed.data.title,
        body: parsed.data.body,
        active_until: parsed.data.active_until ? new Date(parsed.data.active_until).toISOString() : null,
        created_by: ctx.user.id,
    })

    if (error) return { error: error.message }
    revalidatePath(`/org/${orgSlug}/announcements`)
    return { success: true }
}

export async function toggleAnnouncementAction(orgSlug: string, id: string, isActive: boolean) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_announcements')
        .update({ is_active: isActive })
        .eq('id', id)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    revalidatePath(`/org/${orgSlug}/announcements`)
    return { success: true }
}

export async function deleteAnnouncementAction(orgSlug: string, id: string) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_announcements')
        .delete()
        .eq('id', id)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    revalidatePath(`/org/${orgSlug}/announcements`)
    return { success: true }
}
