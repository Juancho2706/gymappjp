'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const AssignClientSchema = z.object({
    clientId: z.string().uuid(),
    coachId: z.string().uuid(),
})

export async function assignClientToCoach(orgSlug: string, clientId: string, coachId: string) {
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const parsed = AssignClientSchema.safeParse({ clientId, coachId })
    if (!parsed.success) return { error: 'Datos inválidos' }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: myMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!myMembership) return { error: 'Sin permisos de administrador' }

    // Verify target coach is in org
    const { data: coachMembership } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', org.id)
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!coachMembership) return { error: 'El coach no pertenece a esta organización' }

    // Upsert assignment + update client.coach_id
    const { error: upsertErr } = await admin
        .from('coach_client_assignments')
        .upsert({ org_id: org.id, client_id: clientId, coach_id: coachId }, { onConflict: 'org_id,client_id' })
    if (upsertErr) return { error: upsertErr.message }

    await admin.from('clients').update({ coach_id: coachId }).eq('id', clientId).eq('org_id', org.id)

    await admin.from('org_audit_logs').insert({
        org_id: org.id,
        actor_id: user.id,
        action: 'assign_client',
        target_type: 'client',
        target_id: clientId,
        metadata: { coach_id: coachId },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    return { success: true }
}

const AddClientToOrgSchema = z.object({
    full_name: z.string().min(1).max(120),
    email: z.email(),
    phone: z.string().max(30).optional().or(z.literal('')),
    coach_id: z.string().uuid().optional().or(z.literal('')),
    age_confirmed: z.literal('on'),
})

export async function addClientToOrgAction(orgSlug: string, formData: FormData) {
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const parsed = AddClientToOrgSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        coach_id: formData.get('coach_id') || undefined,
        age_confirmed: formData.get('age_confirmed'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: myMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!myMembership) return { error: 'Sin permisos de administrador' }

    // Check email uniqueness within org
    const { data: existing } = await admin
        .from('clients')
        .select('id')
        .eq('org_id', org.id)
        .eq('email', parsed.data.email)
        .maybeSingle()
    if (existing) return { error: 'Ya existe un cliente con ese email en la organización' }

    const coachId = parsed.data.coach_id || user.id

    // Create auth user — clients.id = auth.uid
    const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!'
    const { data: newAuthUser, error: authErr } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: tempPassword,
        email_confirm: true,
    })
    if (authErr) return { error: authErr.message }

    const { data: client, error: insertErr } = await admin
        .from('clients')
        .insert({
            id: newAuthUser.user.id,
            full_name: parsed.data.full_name,
            email: parsed.data.email,
            phone: parsed.data.phone || null,
            coach_id: coachId,
            org_id: org.id,
            is_active: true,
            force_password_change: true,
            age_confirmed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
    if (insertErr) {
        await admin.auth.admin.deleteUser(newAuthUser.user.id)
        return { error: insertErr.message }
    }

    if (parsed.data.coach_id) {
        await admin.from('coach_client_assignments').insert({
            org_id: org.id,
            client_id: client.id,
            coach_id: parsed.data.coach_id,
        })
    }

    await admin.from('org_audit_logs').insert({
        org_id: org.id,
        actor_id: user.id,
        action: 'add_client',
        target_type: 'client',
        target_id: client.id,
        metadata: { email: parsed.data.email },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    return { success: true, clientId: client.id }
}

export type ImportClientRow = {
    full_name: string
    email: string
    phone?: string
    coach_id?: string
}

export type ImportClientResult = {
    email: string
    success: boolean
    error?: string
}

const ImportRowSchema = z.object({
    full_name: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
    coach_id: z.uuid().optional(),
})

export async function importClientsFromCSVAction(
    orgSlug: string,
    rows: ImportClientRow[]
): Promise<{ results: ImportClientResult[] }> {
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { results: [] }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { results: [] }

    const { data: myMembership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!myMembership) return { results: [] }

    const results: ImportClientResult[] = []

    for (const row of rows) {
        const parsed = ImportRowSchema.safeParse(row)
        if (!parsed.success) {
            results.push({ email: row.email, success: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
            continue
        }

        const { data: existing } = await admin
            .from('clients')
            .select('id')
            .eq('org_id', org.id)
            .eq('email', parsed.data.email)
            .maybeSingle()
        if (existing) {
            results.push({ email: parsed.data.email, success: false, error: 'Email ya existe en la org' })
            continue
        }

        const tempPassword = Math.random().toString(36).slice(-10) + 'Aa1!'
        const { data: newAuthUser, error: authErr } = await admin.auth.admin.createUser({
            email: parsed.data.email,
            password: tempPassword,
            email_confirm: true,
        })
        if (authErr) {
            results.push({ email: parsed.data.email, success: false, error: authErr.message })
            continue
        }

        const coachIdForInsert = parsed.data.coach_id ?? user.id

        const { data: client, error: insertErr } = await admin
            .from('clients')
            .insert({
                id: newAuthUser.user.id,
                full_name: parsed.data.full_name,
                email: parsed.data.email,
                phone: parsed.data.phone ?? null,
                coach_id: coachIdForInsert,
                org_id: org.id,
                is_active: true,
                force_password_change: true,
                age_confirmed_at: new Date().toISOString(),
            })
            .select('id')
            .single()

        if (insertErr) {
            await admin.auth.admin.deleteUser(newAuthUser.user.id)
            results.push({ email: parsed.data.email, success: false, error: insertErr.message })
            continue
        }

        if (parsed.data.coach_id) {
            try {
                await admin.from('coach_client_assignments').insert({
                    org_id: org.id,
                    client_id: client.id,
                    coach_id: parsed.data.coach_id,
                })
            } catch { /* best-effort */ }
        }

        await admin.from('org_audit_logs').insert({
            org_id: org.id,
            actor_id: user.id,
            action: 'add_client',
            target_type: 'client',
            target_id: client.id,
            metadata: { email: parsed.data.email, source: 'csv_import' },
        })

        results.push({ email: parsed.data.email, success: true })
    }

    revalidatePath(`/org/${orgSlug}/clients`)
    return { results }
}
