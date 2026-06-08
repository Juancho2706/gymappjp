'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { generateTempPassword, getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'
import { sendTransactionalEmail } from '@/lib/email/send-email'

const AssignClientSchema = z.object({
    clientId: z.guid(),
    coachId: z.guid(),
})

const BulkAssignClientsSchema = z.object({
    clientIds: z.array(z.guid()).min(1).max(50),
    coachId: z.guid(),
})

const AddClientToOrgSchema = z.object({
    full_name: z.string().min(1).max(120),
    email: z.email(),
    phone: z.string().max(30).optional().or(z.literal('')),
    coach_id: z.guid().optional().or(z.literal('')),
    age_confirmed: z.literal('on'),
})

const ImportRowSchema = z.object({
    full_name: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
    coach_id: z.guid().optional(),
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
    /** Temp password for manual delivery (students are not emailed). Present on success. */
    tempPassword?: string
    /** Branded login URL when a coach is assigned. */
    loginUrl?: string
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

/**
 * Resolve the branded login URL for an org client assigned to a coach.
 * NOTE: by product decision we DO NOT email students. Credentials (login URL +
 * temp password) are returned to the org admin to deliver manually (WhatsApp,
 * in person, etc.). Pool clients (no coach yet) have no branded path until
 * assigned. Returns null when there is no usable login target.
 */
async function resolveOrgClientLoginUrl(
    admin: ReturnType<typeof createServiceRoleClient>,
    coachId: string | null
): Promise<string | null> {
    if (!coachId) return null
    const { data: coach } = await admin
        .from('coaches')
        .select('slug')
        .eq('id', coachId)
        .maybeSingle()
    if (!coach?.slug) return null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    return `${appUrl}/c/${coach.slug}/login`
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
        .select('id, coach_id, email, full_name, force_password_change')
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

    // B-10: assigning a coach to a pool client is the moment the alumno gets their usable
    // access. Generate the (single) temp password HERE and EMAIL it to the alumno (plus
    // return it for manual fallback) — instead of relying on a confusing creation-time password.
    const isFirstAssignmentOfPoolClient = !client.coach_id && client.force_password_change && client.email
    let credentials: { email: string; tempPassword: string; loginUrl: string | null } | undefined
    if (isFirstAssignmentOfPoolClient) {
        const tempPassword = generateTempPassword()
        const { error: pwErr } = await admin.auth.admin.updateUserById(client.id, { password: tempPassword })
        if (!pwErr) {
            const loginUrl = await resolveOrgClientLoginUrl(admin, coachId)
            credentials = { email: client.email!, tempPassword, loginUrl }
            sendTransactionalEmail({
                to: client.email!,
                subject: `${org.name} — tu acceso`,
                html: `
                    <p>Hola ${client.full_name ?? ''},</p>
                    <p>Ya tienes coach asignado en ${org.name}. Estos son tus accesos:</p>
                    <p><strong>Acceso:</strong> ${loginUrl ?? ''}</p>
                    <p><strong>Email:</strong> ${client.email}</p>
                    <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
                    <p>Te pediremos cambiarla al ingresar.</p>
                `,
            }).catch(() => null)
        }
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.assigned',
        targetType: 'client',
        targetId: client.id,
        metadata: { coach_id: coachId, previous_coach_id: client.coach_id, credentials_reset: Boolean(credentials) },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/reports`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, credentials }
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

    const tempPassword = generateTempPassword()
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

    const loginUrl = await resolveOrgClientLoginUrl(admin, coachId)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.created',
        targetType: 'client',
        targetId: client.id,
        metadata: { email: parsed.data.email, coach_id: coachId },
    })

    // B-10: when the alumno is created already assigned to a coach, email their access
    // (single temp password) instead of manual-only delivery. Pool clients (no coach yet)
    // are emailed later when assigned. Credentials are also returned for manual fallback.
    if (coachId && parsed.data.email) {
        sendTransactionalEmail({
            to: parsed.data.email,
            subject: `${org.name} — tu acceso`,
            html: `
                <p>Hola ${parsed.data.full_name},</p>
                <p>${org.name} creó tu cuenta de alumno en EVA.</p>
                <p><strong>Acceso:</strong> ${loginUrl}</p>
                <p><strong>Email:</strong> ${parsed.data.email}</p>
                <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
                <p>Te pediremos cambiarla al ingresar.</p>
            `,
        }).catch(() => null)
    }

    revalidatePath(`/org/${orgSlug}/clients`)
    // B-10: only surface a usable temp password when the alumno already has a coach (and was
    // emailed). For pool clients (no coach yet) the real credentials are issued + emailed at
    // assignment (assignClientToCoach), so we don't show a confusing throwaway password here.
    return {
        success: true,
        clientId: client.id,
        email: parsed.data.email,
        tempPassword: coachId ? tempPassword : undefined,
        loginUrl,
        emailed: !!coachId,
        pendingAssignment: !coachId,
    }
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

        const tempPassword = generateTempPassword()
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

        const loginUrl = await resolveOrgClientLoginUrl(admin, coachIdForInsert)

        await writeOrgAuditEvent(admin, {
            orgId: org.id,
            actorId: user.id,
            action: 'client.created',
            targetType: 'client',
            targetId: client.id,
            metadata: { email: parsed.data.email, source: 'csv_import', coach_id: coachIdForInsert },
        })

        // Credentials returned for manual delivery — students are NOT emailed.
        results.push({ email: parsed.data.email, success: true, tempPassword, loginUrl: loginUrl ?? undefined })
    }

    revalidatePath(`/org/${orgSlug}/clients`)
    return { results }
}
