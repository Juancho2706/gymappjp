'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const SetupSchema = z.object({
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirm_password: z.string(),
    tos_accepted: z.literal('on', { error: 'Debes aceptar los términos' }),
    privacy_accepted: z.literal('on', { error: 'Debes aceptar la política de privacidad' }),
}).refine(d => d.password === d.confirm_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm_password'],
})

export type SetupAccountState = {
    error?: string
}

export async function setupAccountAction(
    _prev: SetupAccountState,
    formData: FormData
): Promise<SetupAccountState> {
    const raw = {
        password: formData.get('password'),
        confirm_password: formData.get('confirm_password'),
        tos_accepted: formData.get('tos_accepted'),
        privacy_accepted: formData.get('privacy_accepted'),
    }

    const parsed = SetupSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
    }

    const supabase = await createClient()
    const admin = createServiceRoleClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Sesión inválida. Solicita un nuevo link de activación.' }

    // Verify org_owner membership
    const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id, role')
        .eq('user_id', user.id)
        .eq('role', 'org_owner')
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    if (!membership?.org_id) {
        return { error: 'No tienes acceso de propietario a ninguna organización.' }
    }

    // Set password
    const { error: passwordErr } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (passwordErr) return { error: passwordErr.message }

    // Get org slug to redirect
    const { data: org } = await admin
        .from('organizations')
        .select('slug')
        .eq('id', membership.org_id)
        .maybeSingle()

    if (!org?.slug) return { error: 'Organización no encontrada.' }

    // Audit log (best-effort)
    await admin.from('admin_audit_logs').insert({
        admin_email: user.email ?? 'unknown',
        action: 'org_owner.setup_account',
        target_table: 'organization_members',
        target_id: membership.org_id,
        payload: { org_slug: org.slug },
    }).then(({ error: logErr }) => {
        if (logErr) console.error('[setup-account] audit log failed:', logErr)
    })

    redirect(`/org/${org.slug}/onboarding`)
}
