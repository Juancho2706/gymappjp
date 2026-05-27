'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

const AssignClientSchema = z.object({
    clientId: z.string().uuid(),
    coachId: z.string().uuid(),
})

const BulkAssignClientsSchema = z.object({
    clientIds: z.array(z.string().uuid()).min(1).max(50),
    coachId: z.string().uuid(),
})

const AddClientToOrgSchema = z.object({
    full_name: z.string().min(1).max(120),
    email: z.email(),
    phone: z.string().max(30).optional().or(z.literal('')),
    coach_id: z.string().uuid().optional().or(z.literal('')),
    age_confirmed: z.literal('on'),
})

const ImportRowSchema = z.object({
    full_name: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
    coach_id: z.uuid().optional(),
})

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

async function resolveOrgAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug)
}

async function assertCoachInOrg(
    admin: ReturnType<typeof createServiceRoleClient>,
    orgId: string,
    coachId: string
) {
    const { data } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()

    return Boolean(data)
}

export async function assignClientToCoach(orgSlug: string, clientId: string, coachId: string) {
    const parsed = AssignClientSchema.safeParse({ clientId, coachId })
    if (!parsed.success) return { error: 'Datos invalidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context
    const coachInOrg = await assertCoachInOrg(admin, org.id, coachId)
    if (!coachInOrg) return { error: 'El coach no pertenece a esta organizacion' }

    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id')
        .eq('id', clientId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no encontrado en esta empresa' }

    const { error: upsertErr } = await admin
        .from('coach_client_assignments')
        .upsert({
            org_id: org.id,
            client_id: client.id,
            coach_id: coachId,
            assigned_by: user.id,
            assigned_at: new Date().toISOString(),
            deleted_at: null,
        }, { onConflict: 'org_id,client_id' })
    if (upsertErr) return { error: upsertErr.message }

    const { error: updateError } = await admin
        .from('clients')
        .update({ coach_id: coachId })
        .eq('id', client.id)
        .eq('org_id', org.id)
    if (updateError) return { error: updateError.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.assigned',
        targetType: 'client',
        targetId: client.id,
        metadata: { coach_id: coachId, previous_coach_id: client.coach_id },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/reports`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function bulkAssignUnassignedClientsAction(orgSlug: string, clientIds: string[], coachId: string) {
    const parsed = BulkAssignClientsSchema.safeParse({ clientIds, coachId })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context
    const uniqueClientIds = [...new Set(parsed.data.clientIds)]

    const coachInOrg = await assertCoachInOrg(admin, org.id, parsed.data.coachId)
    if (!coachInOrg) return { error: 'El coach no pertenece a esta organizacion' }

    const { data: clients, error: clientsError } = await admin
        .from('clients')
        .select('id, coach_id, is_active')
        .eq('org_id', org.id)
        .in('id', uniqueClientIds)
    if (clientsError) return { error: clientsError.message }
    if ((clients ?? []).length !== uniqueClientIds.length) return { error: 'Uno o mas alumnos no pertenecen a esta empresa' }

    const invalidClients = (clients ?? []).filter((client) => client.coach_id || client.is_active === false)
    if (invalidClients.length > 0) {
        return { error: 'El lote solo puede incluir alumnos activos sin coach' }
    }

    const assignedAt = new Date().toISOString()
    const assignmentRows = uniqueClientIds.map((clientId) => ({
        org_id: org.id,
        client_id: clientId,
        coach_id: parsed.data.coachId,
        assigned_by: user.id,
        assigned_at: assignedAt,
        deleted_at: null,
    }))

    const { error: upsertErr } = await admin
        .from('coach_client_assignments')
        .upsert(assignmentRows, { onConflict: 'org_id,client_id' })
    if (upsertErr) return { error: upsertErr.message }

    const { error: updateError } = await admin
        .from('clients')
        .update({ coach_id: parsed.data.coachId })
        .eq('org_id', org.id)
        .in('id', uniqueClientIds)
    if (updateError) return { error: updateError.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.bulk_assigned',
        targetType: 'client',
        targetId: parsed.data.coachId,
        metadata: {
            coach_id: parsed.data.coachId,
            client_count: uniqueClientIds.length,
            client_ids: uniqueClientIds,
        },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/reports`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, count: uniqueClientIds.length }
}

export async function addClientToOrgAction(orgSlug: string, formData: FormData) {
    const parsed = AddClientToOrgSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        phone: formData.get('phone') || undefined,
        coach_id: formData.get('coach_id') || undefined,
        age_confirmed: formData.get('age_confirmed'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: existing } = await admin
        .from('clients')
        .select('id')
        .eq('org_id', org.id)
        .eq('email', parsed.data.email)
        .maybeSingle()
    if (existing) return { error: 'Ya existe un cliente con ese email en la organizacion' }

    const coachId = parsed.data.coach_id || null
    if (coachId) {
        const coachInOrg = await assertCoachInOrg(admin, org.id, coachId)
        if (!coachInOrg) return { error: 'El coach no pertenece a esta organizacion' }
    }

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

    if (coachId) {
        await admin.from('coach_client_assignments').insert({
            org_id: org.id,
            client_id: client.id,
            coach_id: coachId,
        })
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.created',
        targetType: 'client',
        targetId: client.id,
        metadata: { email: parsed.data.email, coach_id: coachId },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    return { success: true, clientId: client.id }
}

export async function importClientsFromCSVAction(
    orgSlug: string,
    rows: ImportClientRow[]
): Promise<{ results: ImportClientResult[] }> {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { results: [] }

    const admin = createServiceRoleClient()
    const { org, user } = context
    const results: ImportClientResult[] = []

    for (const row of rows) {
        const parsed = ImportRowSchema.safeParse(row)
        if (!parsed.success) {
            results.push({ email: row.email, success: false, error: parsed.error.issues[0]?.message ?? 'Datos invalidos' })
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

        const coachIdForInsert = parsed.data.coach_id ?? null
        if (coachIdForInsert) {
            const coachInOrg = await assertCoachInOrg(admin, org.id, coachIdForInsert)
            if (!coachInOrg) {
                results.push({ email: parsed.data.email, success: false, error: 'Coach no pertenece a la org' })
                continue
            }
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

        if (coachIdForInsert) {
            try {
                await admin.from('coach_client_assignments').insert({
                    org_id: org.id,
                    client_id: client.id,
                    coach_id: coachIdForInsert,
                })
            } catch { /* best-effort */ }
        }

        await writeOrgAuditEvent(admin, {
            orgId: org.id,
            actorId: user.id,
            action: 'client.created',
            targetType: 'client',
            targetId: client.id,
            metadata: { email: parsed.data.email, source: 'csv_import', coach_id: coachIdForInsert },
        })

        results.push({ email: parsed.data.email, success: true })
    }

    revalidatePath(`/org/${orgSlug}/clients`)
    return { results }
}
