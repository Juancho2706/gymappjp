'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

async function getOrgAndVerifyAdmin(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const, org: null, supabase: null }

    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug, onboarding_step')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' as const, org: null, supabase: null }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('coach_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos' as const, org: null, supabase: null }

    return { error: null, org, supabase }
}

export async function advanceOnboardingStep(orgSlug: string, nextStep: number) {
    const { error, org } = await getOrgAndVerifyAdmin(orgSlug)
    if (error || !org) return { error: error ?? 'Error' }

    const admin = createServiceRoleClient()

    if (nextStep >= 5) {
        await admin
            .from('organizations')
            .update({ onboarding_step: 5 })
            .eq('id', org.id)
        revalidatePath(`/org/${orgSlug}`)
        redirect(`/org/${orgSlug}`)
    }

    await admin
        .from('organizations')
        .update({ onboarding_step: nextStep })
        .eq('id', org.id)

    revalidatePath(`/org/${orgSlug}/onboarding`)
    return { success: true }
}

export async function updateOrgBrandingAction(orgSlug: string, formData: FormData) {
    const { error, org } = await getOrgAndVerifyAdmin(orgSlug)
    if (error || !org) return { error: error ?? 'Error' }

    const name = String(formData.get('name') ?? '').trim()
    const primary_color = String(formData.get('primary_color') ?? '').trim()
    if (name.length < 2) return { error: 'Nombre muy corto' }

    const admin = createServiceRoleClient()
    const updateData: Record<string, unknown> = { name, onboarding_step: 1 }
    if (/^#[0-9a-fA-F]{6}$/.test(primary_color)) updateData.primary_color = primary_color

    const { error: dbErr } = await admin.from('organizations').update(updateData).eq('id', org.id)
    if (dbErr) return { error: dbErr.message }

    revalidatePath(`/org/${orgSlug}`)
    return { success: true }
}
