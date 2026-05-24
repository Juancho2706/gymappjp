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

const ALLOWED_LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export async function uploadOrgLogoAction(orgSlug: string, formData: FormData) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

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

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' }

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const parsed = UpdateOrgSchema.safeParse({
        name: formData.get('name'),
        primary_color: formData.get('primary_color') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' }

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

export async function publishEnterpriseBrandAction(orgSlug: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context
    const primaryColor = org.primary_color ?? '#10B981'
    const loaderText = org.name
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
                brand_name: org.name,
                primary_color: primaryColor,
                logo_url: org.logo_url,
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

async function resolveOrgAdminContext(orgSlug: string, allowedRoles: string[] = ['org_owner', 'org_admin']) {
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
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name, org_id: org.id, org_role: parsed.data.role },
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
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

    const parsed = InviteCoachSchema.safeParse({
        email: formData.get('email'),
        role: formData.get('role') ?? 'coach',
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const { data: org } = await supabase
        .from('organizations')
        .select('id, name, seats_included')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' }

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

    revalidatePath(`/org/${orgSlug}/coaches`)
    return { success: true }
}

export async function inviteCoachFormAction(orgSlug: string, _prevState: unknown, formData: FormData) {
    return inviteCoachAction(orgSlug, formData)
}

export async function removeCoachAction(orgSlug: string, memberId: string) {
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

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

    const { data: target } = await admin
        .from('organization_members')
        .select('id, coach_id, role')
        .eq('id', memberId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!target) return { error: 'Miembro no encontrado' }
    if (target.role === 'org_owner') return { error: 'No se puede remover al propietario' }

    const { error } = await admin
        .from('organization_members')
        .update({ deleted_at: new Date().toISOString(), status: 'suspended' })
        .eq('id', memberId)

    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_coach.removed',
        targetType: 'coach',
        targetId: target.coach_id,
        metadata: {},
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
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
    const supabase = await createClient()
    const admin = createServiceRoleClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' }

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
