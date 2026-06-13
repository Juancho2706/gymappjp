'use server'

import { z } from 'zod/v4'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { createClient } from '@/lib/supabase/server'

const ResendSchema = z.object({
    orgId: z.uuid(),
    email: z.email(),
})

const SetOrgStatusSchema = z.object({
    orgId: z.uuid(),
    status: z.enum(['active', 'suspended']),
})

export async function resendOwnerInviteAction(
    _prev: { error?: string; success?: boolean },
    formData: FormData
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !isAdminEmail(user.email)) return { error: 'No autorizado' }

    const parsed = ResendSchema.safeParse({
        orgId: formData.get('orgId'),
        email: formData.get('email'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'

    const { error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
        data: { org_id: parsed.data.orgId, role: 'org_owner' },
        redirectTo: `${siteUrl}/org/setup-account`,
    })

    if (error) return { error: error.message }

    await admin.from('admin_audit_logs').insert({
        admin_email: user.email,
        action: 'org.resend_owner_invite',
        target_table: 'organizations',
        target_id: parsed.data.orgId,
        payload: { email: parsed.data.email },
    }).then(({ error: logErr }) => {
        if (logErr) console.error('[resendOwnerInvite] audit log failed:', logErr)
    })

    return { success: true }
}

export type SetOrgStatusResult = { success: true } | { error: string }

/**
 * Activar o suspender manualmente una organización enterprise.
 * Registra en admin_audit_logs con trazabilidad.
 */
export async function setOrgStatusAction(orgId: string, status: 'active' | 'suspended'): Promise<SetOrgStatusResult> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email || !isAdminEmail(user.email)) return { error: 'No autorizado' }

    const parsed = SetOrgStatusSchema.safeParse({ orgId, status })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()

    const { error } = await admin
        .from('organizations')
        .update({ status: parsed.data.status })
        .eq('id', parsed.data.orgId)

    if (error) return { error: error.message }

    await admin.from('admin_audit_logs').insert({
        admin_email: user.email,
        action: status === 'active' ? 'org.status_manual_active' : 'org.status_manual_suspended',
        target_table: 'organizations',
        target_id: parsed.data.orgId,
        payload: { orgId: parsed.data.orgId, reason: 'manual_admin_action' },
    }).then(({ error: logErr }) => {
        if (logErr) console.error('[setOrgStatus] audit log failed:', logErr)
    })

    revalidatePath('/admin/orgs')
    return { success: true }
}
