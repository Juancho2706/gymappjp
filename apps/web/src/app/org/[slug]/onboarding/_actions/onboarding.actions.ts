'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { writeOrgAuditEvent } from '@/services/org/org.service'

async function getOrgAndVerifyAdmin(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const, org: null, supabase: null, user: null }

    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug, onboarding_step')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' as const, org: null, supabase: null, user: null }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos' as const, org: null, supabase: null, user: null }

    return { error: null, org, supabase, user }
}

export async function advanceOnboardingStep(orgSlug: string, nextStep: number) {
    const { error, org, user } = await getOrgAndVerifyAdmin(orgSlug)
    if (error || !org || !user) return { error: error ?? 'Error' }

    const admin = createServiceRoleClient()

    if (nextStep >= 5) {
        await admin
            .from('organizations')
            .update({ onboarding_step: 5 })
            .eq('id', org.id)
        await writeOrgAuditEvent(admin, {
            orgId: org.id,
            actorId: user.id,
            action: 'onboarding.completed',
            targetType: 'organization',
            targetId: org.id,
            metadata: { step: 5 },
        })
        revalidatePath(`/org/${orgSlug}`)
        revalidatePath(`/org/${orgSlug}/audit`)
        redirect(`/org/${orgSlug}`)
    }

    await admin
        .from('organizations')
        .update({ onboarding_step: nextStep })
        .eq('id', org.id)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'onboarding.step_advanced',
        targetType: 'organization',
        targetId: org.id,
        metadata: { step: nextStep },
    })

    revalidatePath(`/org/${orgSlug}/onboarding`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function updateOrgBrandingAction(orgSlug: string, formData: FormData) {
    const { error, org, user } = await getOrgAndVerifyAdmin(orgSlug)
    if (error || !org || !user) return { error: error ?? 'Error' }

    const name = String(formData.get('name') ?? '').trim()
    const primary_color = String(formData.get('primary_color') ?? '').trim()
    if (name.length < 2) return { error: 'Nombre muy corto' }

    const admin = createServiceRoleClient()
    const updateData: Record<string, unknown> = { name, onboarding_step: 1 }
    const validPrimaryColor = /^#[0-9a-fA-F]{6}$/.test(primary_color) ? primary_color : null
    if (validPrimaryColor) updateData.primary_color = validPrimaryColor

    const { error: dbErr } = await admin.from('organizations').update(updateData).eq('id', org.id)
    if (dbErr) return { error: dbErr.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'onboarding.branding_updated',
        targetType: 'organization',
        targetId: org.id,
        metadata: { name, primary_color: validPrimaryColor },
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
