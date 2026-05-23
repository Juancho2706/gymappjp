'use server'

import { headers } from 'next/headers'
import { z } from 'zod/v4'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitInviteAccept } from '@/lib/rate-limit'

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

    const { data: coach } = await admin
        .from('coaches')
        .select('id, active_org_id, slug')
        .eq('invite_code', inviteCode)
        .maybeSingle()
    if (!coach) return { error: 'Código de invitación inválido' }

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
        coach_id: coach.id,
        org_id: coach.active_org_id,
        is_active: true,
        force_password_change: false,
        age_confirmed_at: new Date().toISOString(),
    })

    if (insertErr) {
        await admin.auth.admin.deleteUser(newUser.user.id)
        return { error: insertErr.message }
    }

    if (coach.active_org_id) {
        await admin.from('coach_client_assignments').insert({
            org_id: coach.active_org_id,
            client_id: newUser.user.id,
            coach_id: coach.id,
        })
    }

    return { success: true, coachSlug: coach.slug }
}
