'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

const OnboardingStepSchema = z.number().int().min(1).max(5)

async function getOrgAndVerifyAdmin(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug)
}

export async function advanceOnboardingStep(orgSlug: string, nextStep: number) {
    const parsedStep = OnboardingStepSchema.safeParse(nextStep)
    if (!parsedStep.success) return { error: 'Paso de onboarding invalido' }

    const ctx = await getOrgAndVerifyAdmin(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createServiceRoleClient()

    if (parsedStep.data >= 5) {
        await admin
            .from('organizations')
            .update({ onboarding_step: 5 })
            .eq('id', ctx.org.id)
        await writeOrgAuditEvent(admin, {
            orgId: ctx.org.id,
            actorId: ctx.user.id,
            action: 'onboarding.completed',
            targetType: 'organization',
            targetId: ctx.org.id,
            metadata: { step: 5 },
        })
        revalidatePath(`/org/${orgSlug}`)
        revalidatePath(`/org/${orgSlug}/audit`)
        redirect(`/org/${orgSlug}`)
    }

    await admin
        .from('organizations')
        .update({ onboarding_step: parsedStep.data })
        .eq('id', ctx.org.id)

    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'onboarding.step_advanced',
        targetType: 'organization',
        targetId: ctx.org.id,
        metadata: { step: parsedStep.data },
    })

    revalidatePath(`/org/${orgSlug}/onboarding`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function updateOrgBrandingAction(orgSlug: string, formData: FormData) {
    const ctx = await getOrgAndVerifyAdmin(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const name = String(formData.get('name') ?? '').trim()
    const primary_color = String(formData.get('primary_color') ?? '').trim()
    if (name.length < 2) return { error: 'Nombre muy corto' }

    const admin = createServiceRoleClient()
    const updateData: Record<string, unknown> = { name, onboarding_step: 1 }
    const validPrimaryColor = /^#[0-9a-fA-F]{6}$/.test(primary_color) ? primary_color : null
    if (validPrimaryColor) updateData.primary_color = validPrimaryColor

    const { error: dbErr } = await admin.from('organizations').update(updateData).eq('id', ctx.org.id)
    if (dbErr) return { error: dbErr.message }

    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'onboarding.branding_updated',
        targetType: 'organization',
        targetId: ctx.org.id,
        metadata: { name, primary_color: validPrimaryColor },
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
