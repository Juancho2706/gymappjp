'use server'

import { headers } from 'next/headers'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitInviteAccept } from '@/lib/rate-limit'
import { resolveInvite } from '../_lib/resolve-invite'

const JoinSchema = z.object({
    full_name: z.string().min(2).max(120),
    email: z.email(),
    phone: z.string().max(30).optional().or(z.literal('')),
    password: z.string().min(8).max(72),
})

export async function joinViaInviteAction(inviteCode: string, _prev: unknown, formData: FormData) {
    const hdrs = await headers()
    const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const rl = await rateLimitInviteAccept(ip)
    if (!rl.ok) return { error: 'Demasiados intentos. Espera un momento antes de volver a intentar.' }

    const parsed = JoinSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        password: formData.get('password'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()

    // B-7: the code itself decides the scope. An ENTERPRISE code (organization_members.invite_code)
    // creates an org-scoped alumno (org_id set + coach assignment); a STANDALONE code
    // (coaches.invite_code) creates a standalone alumno (org_id null). Single source of truth.
    const invite = await resolveInvite(admin, inviteCode)
    if (!invite) return { error: 'Código de invitación inválido' }

    const { data: existing } = await admin
        .from('clients')
        .select('id')
        .eq('email', parsed.data.email)
        .maybeSingle()
    if (existing) return { error: 'Ya existe una cuenta con ese email' }

    const { data: newUser, error: authErr } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name },
    })
    if (authErr) return { error: authErr.message }

    const { error: insertErr } = await admin.from('clients').insert({
        id: newUser.user.id,
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        phone: parsed.data.phone || null,
        coach_id: invite.coachId,
        org_id: invite.orgId,
        is_active: true,
        force_password_change: false,
        age_confirmed_at: new Date().toISOString(),
    })

    if (insertErr) {
        await admin.auth.admin.deleteUser(newUser.user.id)
        return { error: insertErr.message }
    }

    // Enterprise self-signup: record the coach↔client assignment in the org.
    if (invite.scope === 'enterprise') {
        await admin.from('coach_client_assignments').insert({
            org_id: invite.orgId,
            client_id: newUser.user.id,
            coach_id: invite.coachId,
            assigned_by: invite.coachId,
        })
    }

    return { success: true, coachSlug: invite.coachSlug }
}
