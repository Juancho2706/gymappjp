'use server'

import { revalidatePath } from 'next/cache'
import { UpdateOrgSchema, InviteCoachSchema, CreateEnterpriseCoachSchema } from '@eva/schemas'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitOrgCreation } from '@/lib/rate-limit'
import { assertPlatformEmailAvailable, sanitizePlatformEmail } from '@/lib/auth/platform-email'
import { generateUniqueInviteCode } from '@/services/coach/coach.service'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { generateTempPassword, generateUniqueCoachSlug, getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'
import { computeOrgHealthScore } from '@/infrastructure/db/org.repository'

const ALLOWED_LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export async function uploadOrgLogoAction(orgSlug: string, formData: FormData) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const file = formData.get('logo')
    if (!(file instanceof File)) return { error: 'Archivo requerido' }

    // Server-side MIME check — never trust client-reported type alone
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
        return { error: 'Tipo de archivo no permitido. Solo JPEG, PNG, WebP o GIF.' }
    }
    if (file.size > MAX_LOGO_BYTES) {
        return { error: 'El archivo supera 2 MB.' }
    }

    // Re-read first 12 bytes to verify magic numbers (defense-in-depth)
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const isJpeg = header[0] === 0xFF && header[1] === 0xD8
    const isPng  = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47
    const isWebp = header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
    const isGif  = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46
    if (!isJpeg && !isPng && !isWebp && !isGif) {
        return { error: 'El contenido del archivo no coincide con su extensión.' }
    }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `orgs/${org.id}/logo.${ext}`

    const { error: uploadError } = await admin.storage
        .from('org-assets')
        .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) return { error: uploadError.message }

    const { data: { publicUrl } } = admin.storage.from('org-assets').getPublicUrl(path)

    const { error: dbErr } = await admin
        .from('organizations')
        .update({ logo_url: publicUrl })
        .eq('id', org.id)
    if (dbErr) return { error: dbErr.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'brand.logo_uploaded',
        targetType: 'organization',
        targetId: org.id,
        metadata: { path, content_type: file.type, size: file.size },
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/brand`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, logoUrl: publicUrl }
}

export async function updateOrgAction(orgSlug: string, formData: FormData) {
    const parsed = UpdateOrgSchema.safeParse({
        name: formData.get('name'),
        primary_color: formData.get('primary_color') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const { org, user, supabase } = context

    const updateData: Record<string, string> = { name: parsed.data.name }
    if (parsed.data.primary_color) updateData.primary_color = parsed.data.primary_color

    const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', org.id)

    if (error) return { error: error.message }

    await writeOrgAuditEvent(supabase, {
        orgId: org.id,
        actorId: user.id,
        action: 'brand.updated',
        targetType: 'organization',
        targetId: org.id,
        metadata: updateData,
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/brand`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

/**
 * Saves brand changes as a draft (no live impact).
 * Coaches/students still see the last published values until publish is called.
 */
export async function saveBrandDraftAction(
    orgSlug: string,
    draft: { name?: string; primary_color?: string; logo_url?: string | null }
) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org } = context

    const { error } = await admin
        .from('organizations')
        .update({ brand_draft: draft })
        .eq('id', org.id)
    if (error) return { error: error.message }

    revalidatePath(`/org/${orgSlug}/brand`)
    return { success: true }
}

/**
 * Discards unpublished draft without affecting live brand.
 */
export async function discardBrandDraftAction(orgSlug: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org } = context

    await admin.from('organizations').update({ brand_draft: null }).eq('id', org.id)
    revalidatePath(`/org/${orgSlug}/brand`)
    return { success: true }
}

export async function publishEnterpriseBrandAction(orgSlug: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    // Apply draft if it exists, otherwise use current live values
    const draft = (org as Record<string, unknown>).brand_draft as Record<string, unknown> | null
    const primaryColor = (draft?.primary_color as string | null) ?? org.primary_color ?? '#10B981'
    const logoUrl = draft ? (draft.logo_url as string | null | undefined) : org.logo_url
    const orgName = (draft?.name as string | null) ?? org.name

    // Promote draft to live
    if (draft) {
        await admin.from('organizations').update({
            name: orgName,
            primary_color: primaryColor,
            logo_url: logoUrl ?? org.logo_url,
            brand_draft: null,
            brand_published_at: new Date().toISOString(),
            brand_published_by: user.id,
        }).eq('id', org.id)
    } else {
        await admin.from('organizations').update({
            brand_published_at: new Date().toISOString(),
            brand_published_by: user.id,
        }).eq('id', org.id)
    }

    const loaderText = orgName
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 10)
        .toUpperCase() || 'APP'

    const { data: coachMembers, error: membersError } = await admin
        .from('organization_members')
        .select('coach_id')
        .eq('org_id', org.id)
        .eq('role', 'coach')
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('coach_id', 'is', null)

    if (membersError) return { error: membersError.message }

    const coachIds = [...new Set((coachMembers ?? []).map(member => member.coach_id).filter(Boolean))] as string[]

    if (coachIds.length > 0) {
        const { error: coachesError } = await admin
            .from('coaches')
            .update({
                brand_name: orgName,
                primary_color: primaryColor,
                logo_url: logoUrl ?? org.logo_url,
                use_brand_colors_coach: true,
                use_custom_loader: true,
                loader_text: loaderText,
                loader_text_color: primaryColor,
                loader_icon_mode: 'coach',
            })
            .in('id', coachIds)

        if (coachesError) return { error: coachesError.message }
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'brand.published',
        targetType: 'organization',
        targetId: org.id,
        metadata: { coach_count: coachIds.length, primary_color: primaryColor, has_logo: Boolean(org.logo_url) },
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/brand`)
    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, coachCount: coachIds.length }
}

// Default: all enterprise staff roles that can perform operational mutations.
// Sensitive actions (brand publish, team modify, settings) pass explicit allowedRoles.
async function resolveOrgAdminContext(orgSlug: string, allowedRoles: string[] = ['org_owner', 'org_admin', 'ops']) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug, allowedRoles)
}

export async function createEnterpriseCoachAction(orgSlug: string, formData: FormData) {
    const parsed = CreateEnterpriseCoachSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        role: formData.get('role') ?? 'coach',
        temp_password: formData.get('temp_password') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const { count } = await admin
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'active')
        .is('deleted_at', null)
    if ((count ?? 0) >= org.seats_included) return { error: `Límite de ${org.seats_included} coaches alcanzado` }

    const email = sanitizePlatformEmail(parsed.data.email)
    const availability = await assertPlatformEmailAvailable(admin, email)
    if (!availability.ok) return { error: availability.error }

    const tempPassword = parsed.data.temp_password || generateTempPassword()
    // org_admin/org_owner get the MFA requirement flag — middleware redirects them to
    // setup-mfa until they enroll TOTP. Enterprise coaches don't access /org/* dashboard.
    // Only org_admin gets MFA enforcement (org_owner is not created via this form)
    const requiresMfa = parsed.data.role === 'org_admin'
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name, org_id: org.id, org_role: parsed.data.role },
        app_metadata: requiresMfa ? { requires_mfa_setup: true } : {},
    })
    if (authError || !authData.user) return { error: authError?.message ?? 'No se pudo crear el usuario' }

    let inviteCode: string | null = null

    if (parsed.data.role === 'coach') {
        const [slug, generatedInviteCode] = await Promise.all([
            generateUniqueCoachSlug(admin, `${org.slug}-${parsed.data.full_name}`),
            generateUniqueInviteCode(admin),
        ])
        inviteCode = generatedInviteCode

        const { error: coachError } = await admin.from('coaches').insert({
            id: authData.user.id,
            full_name: parsed.data.full_name,
            brand_name: org.name,
            slug,
            invite_code: inviteCode,
            primary_color: org.primary_color ?? '#10B981',
            logo_url: org.logo_url,
            subscription_status: 'org_managed',
            subscription_tier: 'scale',
            billing_cycle: 'monthly',
            payment_provider: 'admin',
            max_clients: 500,
            active_org_id: org.id,
            onboarding_guide: { invite_code_confirmed: false },
        })
        if (coachError) {
            await admin.auth.admin.deleteUser(authData.user.id)
            return { error: coachError.message }
        }
    }

    const { error: memberError } = await admin.from('organization_members').insert({
        org_id: org.id,
        user_id: authData.user.id,
        coach_id: parsed.data.role === 'coach' ? authData.user.id : null,
        role: parsed.data.role,
        status: 'active',
        joined_at: new Date().toISOString(),
    })
    if (memberError) {
        await admin.auth.admin.deleteUser(authData.user.id)
        return { error: memberError.message }
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: parsed.data.role === 'coach' ? 'enterprise_coach.created' : 'enterprise_staff.created',
        targetType: parsed.data.role === 'coach' ? 'coach' : 'organization_member',
        targetId: authData.user.id,
        metadata: { email, role: parsed.data.role, invite_code: inviteCode },
    })

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'invite.created',
        targetType: parsed.data.role === 'coach' ? 'coach' : 'organization_member',
        targetId: authData.user.id,
        metadata: {
            email,
            role: parsed.data.role,
            delivery: 'direct_account_created',
            invite_code: inviteCode,
        },
    })

    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    sendTransactionalEmail({
        to: email,
        subject: `Tu cuenta de coach en ${org.name}`,
        html: `
            <p>Hola ${parsed.data.full_name},</p>
            <p>${org.name} creó tu cuenta enterprise en EVA.</p>
            <p><strong>Login:</strong> ${parsed.data.role === 'coach' ? `${appUrl}/login` : `${appUrl}/org/login`}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
            ${inviteCode ? `<p><strong>Código de alumnos:</strong> ${inviteCode}</p>` : ''}
        `,
    }).catch(() => null)

    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/team`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, email, tempPassword, inviteCode, role: parsed.data.role }
}

export async function inviteCoachAction(orgSlug: string, formData: FormData) {
    const parsed = InviteCoachSchema.safeParse({
        email: formData.get('email'),
        role: formData.get('role') ?? 'coach',
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user, supabase } = context

    // Check seat limit
    const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'active')
        .is('deleted_at', null)
    if ((count ?? 0) >= org.seats_included) return { error: `Límite de ${org.seats_included} coaches alcanzado` }

    // Find target coach by email via auth admin
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const targetUser = users?.users.find(u => u.email === parsed.data.email)
    if (!targetUser) return { error: 'No existe un coach con ese email' }

    const { data: targetCoach } = await admin
        .from('coaches')
        .select('id')
        .eq('id', targetUser.id)
        .maybeSingle()
    if (!targetCoach) return { error: 'El usuario no es un coach en la plataforma' }

    // Check not already a member
    const { data: existing } = await admin
        .from('organization_members')
        .select('id, status')
        .eq('org_id', org.id)
        .eq('coach_id', targetCoach.id)
        .is('deleted_at', null)
        .maybeSingle()
    if (existing) return { error: existing.status === 'active' ? 'Ya es miembro' : 'Ya tiene invitación pendiente' }

    const { error: insertError } = await admin
        .from('organization_members')
        .insert({
            org_id: org.id,
            user_id: targetCoach.id,
            coach_id: targetCoach.id,
            role: parsed.data.role,
            status: 'active',
            joined_at: new Date().toISOString(),
        })
    if (insertError) return { error: insertError.message }

    // Audit log
    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_coach.linked',
        targetType: 'coach',
        targetId: targetCoach.id,
        metadata: { email: parsed.data.email, role: parsed.data.role },
    })

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'invite.created',
        targetType: 'coach',
        targetId: targetCoach.id,
        metadata: {
            email: parsed.data.email,
            role: parsed.data.role,
            delivery: 'existing_coach_linked',
        },
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
    return { success: true }
}

export async function inviteCoachFormAction(orgSlug: string, _prevState: unknown, formData: FormData) {
    return inviteCoachAction(orgSlug, formData)
}

export async function removeCoachAction(orgSlug: string, memberId: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: target } = await admin
        .from('organization_members')
        .select('id, coach_id, role, status, user_id')
        .eq('id', memberId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!target) return { error: 'Miembro no encontrado' }
    if (target.role === 'org_owner') return { error: 'No se puede remover al propietario' }

    const { error } = await admin
        .from('organization_members')
        .update({ deleted_at: new Date().toISOString(), status: 'revoked' })
        .eq('id', memberId)

    if (error) return { error: error.message }

    if (target.user_id) {
        await admin
            .from('workspace_preferences')
            .delete()
            .eq('user_id', target.user_id)
            .eq('last_org_id', org.id)
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: target.status === 'invited' ? 'invite.revoked' : 'membership.revoked',
        targetType: target.role === 'coach' ? 'coach' : 'organization_member',
        targetId: target.coach_id ?? target.user_id,
        metadata: {
            member_id: memberId,
            user_id: target.user_id,
            previous_role: target.role,
            previous_status: target.status,
            previous_action: 'enterprise_coach.removed',
            cleared_workspace_preference: true,
        },
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/team`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function resetEnterpriseCoachPasswordAction(orgSlug: string, coachId: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: membership } = await admin
        .from('organization_members')
        .select('id, role')
        .eq('org_id', org.id)
        .eq('coach_id', coachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Coach no pertenece a esta organización' }

    const tempPassword = generateTempPassword()
    const { error } = await admin.auth.admin.updateUserById(coachId, { password: tempPassword })
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_coach.password_reset',
        targetType: 'coach',
        targetId: coachId,
        metadata: {},
    })

    return { success: true, tempPassword }
}

export async function updateEnterpriseCoachRoleAction(orgSlug: string, memberId: string, role: 'org_admin' | 'coach') {
    const context = await resolveOrgAdminContext(orgSlug, ['org_owner'])
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: target } = await admin
        .from('organization_members')
        .select('id, coach_id, role')
        .eq('id', memberId)
        .eq('org_id', org.id)
        .is('deleted_at', null)
        .maybeSingle()
    if (!target) return { error: 'Miembro no encontrado' }
    if (target.role === 'org_owner') return { error: 'No se puede cambiar el rol del propietario' }

    const { error } = await admin
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_coach.role_updated',
        targetType: 'coach',
        targetId: target.coach_id,
        metadata: { role },
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
    return { success: true }
}

export async function createOrgAction(formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const limited = await rateLimitOrgCreation(user.id)
    if (limited) return { error: 'Demasiadas organizaciones creadas hoy. Intenta mañana.' }

    const name = String(formData.get('name') ?? '').trim()
    const slug = String(formData.get('slug') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')

    if (name.length < 2) return { error: 'Nombre muy corto' }
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) return { error: 'Slug inválido (3-50 chars, letras, números, guiones)' }

    const admin = createServiceRoleClient()

    const { data: existing } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle()
    if (existing) return { error: 'Ese slug ya está en uso' }

    const { data: org, error: orgError } = await admin
        .from('organizations')
        .insert({ name, slug, owner_user_id: user.id })
        .select('id')
        .single()
    if (orgError) return { error: orgError.message }

    // Add creator as org_owner
    await admin.from('organization_members').insert({
        org_id: org.id,
        user_id: user.id,
        coach_id: user.id,
        role: 'org_owner',
        status: 'active',
        joined_at: new Date().toISOString(),
    })

    // Set coach active_org_id
    await admin.from('coaches').update({ active_org_id: org.id }).eq('id', user.id)

    revalidatePath('/coach/settings')
    return { success: true, slug }
}

export async function bulkReassignClientsAction(
    orgSlug: string,
    fromCoachId: string,
    toCoachId: string,
    memberId: string,
) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: toMember } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', org.id)
        .eq('coach_id', toCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!toMember) return { error: 'Coach destino no pertenece a la organización' }

    const { data: count, error: rpcError } = await admin.rpc('bulk_reassign_clients_with_audit', {
        p_from_coach_id: fromCoachId,
        p_to_coach_id: toCoachId,
        p_org_id: org.id,
        p_actor_id: user.id,
        p_member_id: memberId,
    })
    if (rpcError) return { error: rpcError.message }

    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, count: count ?? 0 }
}

/**
 * Assigns a specific selection of clients to a coach (bulk, by client ID list).
 * Guards: org membership, coach belongs to org, all clients belong to org.
 * Max 50 clients per call.
 */
export async function bulkAssignSelectedClientsAction(
    orgSlug: string,
    clientIds: string[],
    toCoachId: string,
): Promise<{ success?: boolean; count?: number; error?: string }> {
    if (!clientIds.length) return { error: 'No hay alumnos seleccionados.' }
    if (clientIds.length > 50) return { error: 'Máximo 50 alumnos por operación.' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    // Verify coach belongs to org
    const { data: toMember } = await admin
        .from('organization_members')
        .select('id, coach_id')
        .eq('org_id', org.id)
        .eq('coach_id', toCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!toMember) return { error: 'Coach no pertenece a la organización.' }

    // Single transactional RPC: validates org membership, assigns, upserts assignments, writes audit.
    // Replaces the previous 3-step approach that had race-condition risk.
    const { data: count, error: rpcError } = await admin.rpc('bulk_assign_selected_clients', {
        p_org_id: org.id,
        p_client_ids: clientIds,
        p_coach_id: toCoachId,
        p_actor_id: user.id,
    })
    if (rpcError) {
        if (rpcError.message?.includes('client_not_in_org')) {
            return { error: 'Uno o más alumnos no pertenecen a esta organización.' }
        }
        return { error: rpcError.message }
    }

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, count: Number(count ?? clientIds.length) }
}

/**
 * Archives a selection of clients (sets is_active=false).
 * Guards: all clients must belong to the org.
 */
export async function bulkArchiveClientsAction(
    orgSlug: string,
    clientIds: string[],
): Promise<{ success?: boolean; count?: number; error?: string }> {
    if (!clientIds.length) return { error: 'No hay alumnos seleccionados.' }
    if (clientIds.length > 50) return { error: 'Máximo 50 alumnos por operación.' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    // Verify clients belong to org
    const { data: orgClients } = await admin
        .from('clients')
        .select('id')
        .eq('org_id', org.id)
        .in('id', clientIds)
    const validIds = new Set((orgClients ?? []).map(c => c.id))
    const invalid = clientIds.filter(id => !validIds.has(id))
    if (invalid.length) return { error: `${invalid.length} alumnos no pertenecen a la organización.` }

    const { error } = await admin
        .from('clients')
        .update({ is_active: false })
        .eq('org_id', org.id)
        .in('id', clientIds)
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.bulk_archived',
        targetType: 'client',
        targetId: org.id,
        metadata: { client_ids: clientIds, count: clientIds.length },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, count: clientIds.length }
}

/**
 * Revokes enterprise staff access (non-coach roles: org_admin, ops, analyst, etc.)
 * - Sets status='revoked', deleted_at=now()
 * - Clears workspace_preferences for that org
 * - Writes membership.revoked audit event
 * Owner cannot be revoked; only org_owner can revoke another admin.
 */
export async function revokeStaffAction(orgSlug: string, memberId: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: target } = await admin
        .from('organization_members')
        .select('id, user_id, role, status, coach_id')
        .eq('id', memberId)
        .eq('org_id', org.id)
        .is('deleted_at', null)
        .maybeSingle()

    if (!target) return { error: 'Miembro no encontrado.' }
    if (target.role === 'org_owner') return { error: 'No se puede revocar al propietario.' }
    if (target.role === 'coach') return { error: 'Usá "Remover coach" desde el panel de coaches.' }
    if (target.status === 'revoked') return { error: 'Ya está revocado.' }

    const { error } = await admin
        .from('organization_members')
        .update({ status: 'revoked', deleted_at: new Date().toISOString() })
        .eq('id', memberId)

    if (error) return { error: error.message }

    // Clear cached workspace preference so next login doesn't re-enter this org
    if (target.user_id) {
        await admin
            .from('workspace_preferences')
            .delete()
            .eq('user_id', target.user_id)
            .eq('last_org_id', org.id)
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: target.status === 'invited' ? 'invite.revoked' : 'membership.revoked',
        targetType: 'organization_member',
        targetId: target.user_id ?? memberId,
        metadata: {
            member_id: memberId,
            previous_role: target.role,
            previous_status: target.status,
            cleared_workspace_preference: !!target.user_id,
        },
    })

    revalidatePath(`/org/${orgSlug}/team`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

/**
 * Computes and persists org health score to organizations.last_health_score.
 * Fire-and-forget from dashboard on mount. Returns breakdown for immediate display.
 * Formula (CSM B2B 2026): adherence7d×0.40 + assignment×0.25 + active_rate×0.20 + program_rate×0.15
 * Tiers: green≥70, amber≥50, red<50
 */
export async function refreshOrgHealthScoreAction(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return null

    const breakdown = await computeOrgHealthScore(supabase, org.id)

    // Persist best-effort
    supabase
        .from('organizations')
        .update({ last_health_score: breakdown.score })
        .eq('id', org.id)
        .then(undefined, () => undefined)

    return breakdown
}

/**
 * Reassigns a single already-assigned client to a different coach.
 * Guards: org admin, both client and coach belong to org.
 * Writes audit event `client.reassigned`.
 */
export async function reassignClientAction(
    orgSlug: string,
    clientId: string,
    newCoachId: string,
): Promise<{ success?: boolean; error?: string }> {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    // Verify client belongs to org
    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, full_name')
        .eq('id', clientId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no pertenece a esta organización.' }

    // Verify new coach belongs to org as active coach member
    const { data: coachMember } = await admin
        .from('organization_members')
        .select('id, coach_id')
        .eq('org_id', org.id)
        .eq('coach_id', newCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!coachMember) return { error: 'Coach no pertenece a esta organización.' }

    if (client.coach_id === newCoachId) return { error: 'El alumno ya está asignado a ese coach.' }

    const previousCoachId = client.coach_id

    const { error } = await admin
        .from('clients')
        .update({ coach_id: newCoachId })
        .eq('id', clientId)
        .eq('org_id', org.id)
    if (error) return { error: error.message }

    // Update assignment record
    await admin.from('coach_client_assignments')
        .upsert({
            org_id: org.id,
            client_id: clientId,
            coach_id: newCoachId,
            assigned_at: new Date().toISOString(),
            assigned_by: user.id,
        }, { onConflict: 'org_id,client_id,coach_id' })
        .then(undefined, () => undefined)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.reassigned',
        targetType: 'client',
        targetId: clientId,
        metadata: {
            from_coach_id: previousCoachId,
            to_coach_id: newCoachId,
            client_name: client.full_name,
        },
    })

    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
