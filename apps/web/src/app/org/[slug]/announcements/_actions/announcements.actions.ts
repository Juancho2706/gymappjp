'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

const CreateAnnouncementSchema = z.object({
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
    active_until: z.string().optional(),
})

const AnnouncementIdSchema = z.uuid()

async function resolveAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug)
}

export async function createAnnouncementAction(orgSlug: string, _prev: unknown, formData: FormData) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsed = CreateAnnouncementSchema.safeParse({
        title: formData.get('title'),
        body: formData.get('body'),
        active_until: formData.get('active_until') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const admin = createServiceRoleClient()
    const { data: announcement, error } = await admin.from('org_announcements').insert({
        org_id: ctx.org.id,
        title: parsed.data.title,
        body: parsed.data.body,
        active_until: parsed.data.active_until ? new Date(parsed.data.active_until).toISOString() : null,
        created_by: ctx.user.id,
    }).select('id').single()

    if (error) return { error: error.message }
    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'org_announcement.created',
        targetType: 'org_announcement',
        targetId: announcement.id,
        metadata: { title: parsed.data.title, active_until: parsed.data.active_until ?? null },
    })
    revalidatePath(`/org/${orgSlug}/announcements`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function toggleAnnouncementAction(orgSlug: string, id: string, isActive: boolean) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsedId = AnnouncementIdSchema.safeParse(id)
    if (!parsedId.success) return { error: 'Anuncio invalido' }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_announcements')
        .update({ is_active: isActive })
        .eq('id', parsedId.data)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: isActive ? 'org_announcement.activated' : 'org_announcement.deactivated',
        targetType: 'org_announcement',
        targetId: parsedId.data,
        metadata: { is_active: isActive },
    })
    revalidatePath(`/org/${orgSlug}/announcements`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function deleteAnnouncementAction(orgSlug: string, id: string) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsedId = AnnouncementIdSchema.safeParse(id)
    if (!parsedId.success) return { error: 'Anuncio invalido' }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_announcements')
        .delete()
        .eq('id', parsedId.data)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'org_announcement.deleted',
        targetType: 'org_announcement',
        targetId: parsedId.data,
        metadata: {},
    })
    revalidatePath(`/org/${orgSlug}/announcements`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
