'use server'

import { createHash } from 'crypto'
import { redirect } from 'next/navigation'
import { EnterpriseCoachLoginSchema } from '@eva/schemas'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { writeOrgAuditEvent } from '@/services/org/org.service'
import { setLastWorkspace } from '@/services/auth/workspace.service'

export type EnterpriseCoachLoginState = {
    error?: string
}

const GENERIC_ERROR = 'No pudimos validar el acceso enterprise.'

function normalizeCode(value: string) {
    return value.trim().replace(/\s+/g, '').toUpperCase()
}

function tokenHash(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

export async function enterpriseCoachLoginAction(
    _prevState: EnterpriseCoachLoginState,
    formData: FormData
): Promise<EnterpriseCoachLoginState> {
    const parsed = EnterpriseCoachLoginSchema.safeParse({
        code: formData.get('code'),
        email: formData.get('email'),
        password: formData.get('password'),
    })

    if (!parsed.success) return { error: GENERIC_ERROR }

    const email = parsed.data.email.trim().toLowerCase()
    const code = normalizeCode(parsed.data.code)
    const hash = tokenHash(code)

    const supabase = await createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: parsed.data.password,
    })

    if (signInError) return { error: GENERIC_ERROR }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) return { error: GENERIC_ERROR }

    const admin = createServiceRoleClient()
    const { data: invite } = await admin
        .from('organization_invites')
        .select('id, org_id, email, role, status, expires_at, used_at, deleted_at, max_attempts, attempt_count')
        .eq('token_hash', hash)
        .maybeSingle()

    if (!invite || invite.deleted_at || invite.status !== 'active') {
        await supabase.auth.signOut()
        return { error: GENERIC_ERROR }
    }

    if (invite.attempt_count >= invite.max_attempts || new Date(invite.expires_at) < new Date()) {
        await admin
            .from('organization_invites')
            .update({
                status: new Date(invite.expires_at) < new Date() ? 'expired' : invite.status,
                attempt_count: Math.min(invite.max_attempts, invite.attempt_count + 1),
                last_attempt_at: new Date().toISOString(),
            })
            .eq('id', invite.id)
        await supabase.auth.signOut()
        return { error: GENERIC_ERROR }
    }

    if (invite.role !== 'coach' || invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        await admin
            .from('organization_invites')
            .update({ attempt_count: invite.attempt_count + 1, last_attempt_at: new Date().toISOString() })
            .eq('id', invite.id)
        await supabase.auth.signOut()
        return { error: GENERIC_ERROR }
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) {
        await supabase.auth.signOut()
        return { error: 'Tu email existe, pero no tiene perfil coach. Pide a la empresa que cree o vincule tu cuenta coach.' }
    }

    const { data: existingMember } = await admin
        .from('organization_members')
        .select('id, status')
        .eq('org_id', invite.org_id)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()

    let memberId = existingMember?.id ?? null

    if (!memberId) {
        const { data: createdMember, error: memberError } = await admin
            .from('organization_members')
            .insert({
                org_id: invite.org_id,
                user_id: user.id,
                coach_id: coach.id,
                role: 'coach',
                status: 'active',
                joined_at: new Date().toISOString(),
            })
            .select('id')
            .single()

        if (memberError || !createdMember?.id) {
            await supabase.auth.signOut()
            return { error: GENERIC_ERROR }
        }
        memberId = createdMember.id
    } else if (existingMember?.status !== 'active') {
        const { error: updateMemberError } = await admin
            .from('organization_members')
            .update({ status: 'active', joined_at: new Date().toISOString(), coach_id: coach.id, role: 'coach' })
            .eq('id', memberId)

        if (updateMemberError) {
            await supabase.auth.signOut()
            return { error: GENERIC_ERROR }
        }
    }

    await admin
        .from('organization_invites')
        .update({
            status: 'redeemed',
            used_at: new Date().toISOString(),
            redeemed_at: new Date().toISOString(),
            redeemed_by: user.id,
            attempt_count: invite.attempt_count + 1,
            last_attempt_at: new Date().toISOString(),
        })
        .eq('id', invite.id)

    await writeOrgAuditEvent(admin, {
        orgId: invite.org_id,
        actorId: user.id,
        action: 'invite.redeemed',
        targetType: 'organization_invite',
        targetId: invite.id,
        metadata: { role: 'coach' },
    })

    await setLastWorkspace(admin, {
        type: 'enterprise_coach',
        userId: user.id,
        orgId: invite.org_id,
        coachId: coach.id,
        memberId,
    })

    redirect('/coach/dashboard')
}
