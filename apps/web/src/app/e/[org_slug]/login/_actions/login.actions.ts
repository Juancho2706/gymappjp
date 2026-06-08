'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { setLastWorkspace } from '@/services/auth/workspace.service'

export type EnterpriseLoginState = {
    error?: string
    success?: boolean
    redirectUrl?: string
}

/**
 * P1.4: enterprise alumno login — org-scoped (NOT coach-scoped). The org shares ONE entry
 * link `/e/[org_slug]/login` for all its alumnos. After auth we verify the user is an active
 * ENTERPRISE member of THIS org (source of truth: client_memberships; fallback: clients row),
 * set the enterprise workspace, and route them into their org-branded experience.
 *
 * Zero-regression: brand-new route. Standalone alumnos keep using /c/[coach_slug]/login.
 * Reuses the existing org-branded /c app for assigned alumnos until the /e screen tree (P1.3
 * extraction) lands; pool/orphan alumnos land on /e/[org_slug]/dashboard.
 */
export async function enterpriseClientLoginAction(
    _prev: EnterpriseLoginState,
    formData: FormData
): Promise<EnterpriseLoginState> {
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const orgSlug = String(formData.get('org_slug') ?? '').trim()

    if (!email || !password || !orgSlug) {
        return { error: 'Completa tu email y contraseña.' }
    }

    const supabase = await createClient()

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
        return { error: 'Email o contraseña incorrectos.' }
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return { error: 'Error al obtener sesión.' }
    }

    const admin = createServiceRoleClient()

    const { data: org } = await admin
        .from('organizations')
        .select('id, name, slug')
        .eq('slug', orgSlug)
        .maybeSingle()

    if (!org) {
        await supabase.auth.signOut()
        return { error: 'Organización no encontrada.' }
    }

    // Source of truth: an active enterprise membership in THIS org (identity-split model).
    const { data: membership } = await admin
        .from('client_memberships')
        .select('client_id, coach_id, coaches(slug)')
        .eq('account_id', user.id)
        .eq('org_id', org.id)
        .eq('scope', 'enterprise')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    let clientId: string | null = null
    let coachSlug: string | null = null
    let coachId: string | null = null

    if (membership) {
        clientId = membership.client_id
        coachId = membership.coach_id
        coachSlug = (membership.coaches as unknown as { slug: string | null } | null)?.slug ?? null
    } else {
        // Fallback for un-backfilled accounts: derive from the legacy clients row.
        const { data: client } = await admin
            .from('clients')
            .select('id, coach_id, org_id, coaches(slug)')
            .eq('id', user.id)
            .maybeSingle()
        if (!client || client.org_id !== org.id) {
            await supabase.auth.signOut()
            return { error: 'No tienes acceso a esta organización.' }
        }
        clientId = client.id
        coachId = client.coach_id
        coachSlug = (client.coaches as unknown as { slug: string | null } | null)?.slug ?? null
    }

    // Account-state guard (pause/suspend lives on the clients row).
    const { data: clientState } = await admin
        .from('clients')
        .select('is_active, is_archived')
        .eq('id', clientId)
        .maybeSingle()
    if (clientState?.is_active === false || clientState?.is_archived === true) {
        await supabase.auth.signOut()
        return { error: 'Tu cuenta está pausada. Contacta a tu organización.' }
    }

    const workspace: WorkspaceSummary = {
        type: 'student_enterprise',
        userId: user.id,
        clientId: clientId!,
        orgId: org.id,
        coachId,
        label: `Entrenar con ${org.name}`,
        brandName: org.name,
        slug: coachSlug,
    }
    await setLastWorkspace(supabase, workspace)

    // Assigned alumno → org-branded client app (proxy paints org white-label via client.org_id).
    // Pool/orphan alumno (no coach yet) → the enterprise area's holding screen.
    const redirectUrl = coachSlug
        ? `/c/${coachSlug}/dashboard`
        : `/e/${orgSlug}/dashboard`

    return { success: true, redirectUrl }
}
