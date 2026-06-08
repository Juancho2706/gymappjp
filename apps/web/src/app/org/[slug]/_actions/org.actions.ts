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
import { rolesWithOrgPermission } from '@/domain/org/permissions'
import { isThemeReadable } from '@eva/brand-kit'
import type { Json } from '@/lib/database.types'

const ALLOWED_LOGO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export async function uploadOrgLogoAction(orgSlug: string, formData: FormData) {
    const context = await resolveOrgAdminContext(orgSlug, rolesWithOrgPermission('org.brand.edit'))
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

    // 'dark' = logo variant for dark backgrounds; 'light' (default) = main logo.
    const variant = formData.get('variant') === 'dark' ? 'dark' : 'light'
    const draftKey = variant === 'dark' ? 'logo_url_dark' : 'logo_url'

    const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
    const path = `orgs/${org.id}/logo${variant === 'dark' ? '-dark' : ''}.${ext}`

    const { error: uploadError } = await admin.storage
        .from('org-assets')
        .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) return { error: uploadError.message }

    const { data: { publicUrl } } = admin.storage.from('org-assets').getPublicUrl(path)

    // Store logo in the draft (not live) so it only reaches coaches/students on publish.
    const { data: cur } = await admin.from('organizations').select('brand_draft').eq('id', org.id).single()
    const base = (cur?.brand_draft as Record<string, unknown> | null) ?? {}
    const mergedDraft = draftKey === 'logo_url_dark'
        ? { ...base, logo_url_dark: publicUrl }
        : { ...base, logo_url: publicUrl }
    const { error: dbErr } = await admin
        .from('organizations')
        .update({ brand_draft: mergedDraft })
        .eq('id', org.id)
    if (dbErr) return { error: dbErr.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'brand.logo_uploaded',
        targetType: 'organization',
        targetId: org.id,
        metadata: { path, content_type: file.type, size: file.size, variant },
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
        default_coach_capacity: formData.get('default_coach_capacity') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const { org, user, supabase } = context

    const updateData: Record<string, string | number> = { name: parsed.data.name }
    if (parsed.data.primary_color) updateData.primary_color = parsed.data.primary_color
    if (parsed.data.default_coach_capacity) updateData.default_coach_capacity = parsed.data.default_coach_capacity

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
    draft: { name?: string; primary_color?: string; logo_url?: string | null; loader_text?: string | null; use_custom_loader?: boolean; loader_icon_mode?: string; loader_text_color?: string | null; splash_bg_color?: string | null; accent_light?: string | null; accent_dark?: string | null; logo_url_dark?: string | null; neutral_tint?: boolean }
) {
    const context = await resolveOrgAdminContext(orgSlug, rolesWithOrgPermission('org.brand.edit'))
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org } = context

    // Merge into existing draft so a previously-uploaded logo isn't wiped by a
    // later name/color save (logo upload writes logo_url into the same draft).
    const { data: cur } = await admin.from('organizations').select('brand_draft').eq('id', org.id).single()
    const merged = { ...((cur?.brand_draft as Record<string, unknown> | null) ?? {}), ...draft }

    const { error } = await admin
        .from('organizations')
        .update({ brand_draft: merged })
        .eq('id', org.id)
    if (error) return { error: error.message }

    revalidatePath(`/org/${orgSlug}/brand`)
    return { success: true }
}

/**
 * Discards unpublished draft without affecting live brand.
 */
export async function discardBrandDraftAction(orgSlug: string) {
    const context = await resolveOrgAdminContext(orgSlug, rolesWithOrgPermission('org.brand.edit'))
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org } = context

    await admin.from('organizations').update({ brand_draft: null }).eq('id', org.id)
    revalidatePath(`/org/${orgSlug}/brand`)
    return { success: true }
}

export async function publishEnterpriseBrandAction(orgSlug: string) {
    const context = await resolveOrgAdminContext(orgSlug, rolesWithOrgPermission('org.brand.publish'))
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    // Fetch the full brand row (context.org only carries a subset of columns).
    const { data: full, error: fullErr } = await admin
        .from('organizations')
        .select('id, name, primary_color, logo_url, brand_draft, loader_text, use_custom_loader, loader_icon_mode, loader_text_color, splash_bg_color, accent_light, accent_dark, logo_url_dark, neutral_tint, brand_history')
        .eq('id', org.id)
        .single()
    if (fullErr || !full) return { error: fullErr?.message ?? 'Organización no encontrada' }

    // Effective values: draft overrides live, live falls back to defaults.
    const draft = (full.brand_draft ?? null) as Record<string, unknown> | null
    const pick = <T,>(key: string, live: T): T => (draft && key in draft ? (draft[key] as T) : live)
    const eff = {
        name: pick('name', full.name),
        primaryColor: pick<string | null>('primary_color', full.primary_color) ?? '#10B981',
        logoUrl: pick<string | null>('logo_url', full.logo_url),
        useCustomLoader: pick<boolean | null>('use_custom_loader', full.use_custom_loader) ?? false,
        loaderText: pick<string | null>('loader_text', full.loader_text),
        loaderIconMode: pick<string | null>('loader_icon_mode', full.loader_icon_mode) ?? 'logo',
        loaderTextColor: pick<string | null>('loader_text_color', full.loader_text_color),
        splashBgColor: pick<string | null>('splash_bg_color', full.splash_bg_color),
        accentLight: pick<string | null>('accent_light', full.accent_light),
        accentDark: pick<string | null>('accent_dark', full.accent_dark),
        logoUrlDark: pick<string | null>('logo_url_dark', full.logo_url_dark),
        neutralTint: pick<boolean | null>('neutral_tint', full.neutral_tint) ?? false,
    }

    // Readiness gate: never publish an unreadable theme (would make text invisible
    // on coach/student apps). Same engine the UI uses → consistent verdict.
    if (!isThemeReadable({ brandColor: eff.primaryColor, accentLight: eff.accentLight, accentDark: eff.accentDark, neutralTint: eff.neutralTint })) {
        return { error: 'La combinación de marca no cumple el contraste mínimo (AA). Ajusta el color o el acento antes de publicar.' }
    }

    // History snapshot for rollback (keep last 3 published versions).
    const prevHistory = Array.isArray(full.brand_history) ? (full.brand_history as Json[]) : []
    const snapshot = {
        name: eff.name, primary_color: eff.primaryColor, logo_url: eff.logoUrl ?? full.logo_url,
        accent_light: eff.accentLight, accent_dark: eff.accentDark, logo_url_dark: eff.logoUrlDark,
        neutral_tint: eff.neutralTint, loader_text: eff.loaderText, use_custom_loader: eff.useCustomLoader,
        loader_icon_mode: eff.loaderIconMode, loader_text_color: eff.loaderTextColor, splash_bg_color: eff.splashBgColor,
        published_at: new Date().toISOString(), published_by: user.id,
    }
    const brandHistory = [snapshot as unknown as Json, ...prevHistory].slice(0, 3)

    // Promote effective values to live + clear draft + stamp publish metadata.
    await admin.from('organizations').update({
        name: eff.name,
        primary_color: eff.primaryColor,
        logo_url: eff.logoUrl ?? full.logo_url,
        loader_text: eff.loaderText,
        use_custom_loader: eff.useCustomLoader,
        loader_icon_mode: eff.loaderIconMode,
        loader_text_color: eff.loaderTextColor,
        splash_bg_color: eff.splashBgColor,
        accent_light: eff.accentLight,
        accent_dark: eff.accentDark,
        logo_url_dark: eff.logoUrlDark,
        neutral_tint: eff.neutralTint,
        brand_history: brandHistory,
        brand_draft: null,
        brand_published_at: new Date().toISOString(),
        brand_published_by: user.id,
    }).eq('id', org.id)

    // Org brand is applied to the ORG context only. It must NEVER be written back to
    // coaches.* — those columns are the coach's OWN standalone white-label (login,
    // /c/[slug], standalone students) and live in a separate product domain.
    // The org brand reaches a coach's enterprise workspace + org-students at READ time:
    //   - workspace-brand.service.ts → findWorkspaceOrgBrand() (enterprise_coach/staff)
    //   - proxy.ts org-brand override block (org students on protected /c/* routes)
    // Both read organizations.* live, so no copy into coaches is needed or wanted.
    // Count active coach members purely for the audit metadata / success message.
    const { count: coachCount, error: membersError } = await admin
        .from('organization_members')
        .select('coach_id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('role', 'coach')
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('coach_id', 'is', null)

    if (membersError) return { error: membersError.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'brand.published',
        targetType: 'organization',
        targetId: org.id,
        metadata: { coach_count: coachCount ?? 0, primary_color: eff.primaryColor, has_logo: Boolean(eff.logoUrl) },
    })

    revalidatePath(`/org/${orgSlug}`)
    revalidatePath(`/org/${orgSlug}/brand`)
    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, coachCount: coachCount ?? 0 }
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

    // Seats = coach capacity. Only coach creation consumes a seat; non-coach staff
    // (ops/analyst/brand_manager/org_admin) are not capped by coach seats.
    if (parsed.data.role === 'coach') {
        const { count } = await admin
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .eq('status', 'active')
            .is('deleted_at', null)
            .not('coach_id', 'is', null)
        if ((count ?? 0) >= org.seats_included) return { error: `Límite de ${org.seats_included} coaches alcanzado` }
    }

    const email = sanitizePlatformEmail(parsed.data.email)
    const availability = await assertPlatformEmailAvailable(admin, email)
    if (!availability.ok) return { error: availability.error }

    const tempPassword = parsed.data.temp_password || generateTempPassword()
    // org_admin gets MFA enforcement flag — middleware redirects to setup-mfa.
    // All staff created with temp password get requires_password_change — middleware
    // redirects to setup-password on first login.
    const requiresMfa = parsed.data.role === 'org_admin'
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name, org_id: org.id, org_role: parsed.data.role },
        app_metadata: {
            requires_password_change: true,
            ...(requiresMfa ? { requires_mfa_setup: true } : {}),
        },
    })
    if (authError || !authData.user) return { error: authError?.message ?? 'No se pudo crear el usuario' }

    let inviteCode: string | null = null
    // B-7: enterprise alumno code (organization_members.invite_code) — distinct from the
    // coach's standalone coaches.invite_code, and unique across BOTH code spaces.
    let enterpriseCode: string | null = null

    if (parsed.data.role === 'coach') {
        const [slug, generatedInviteCode, enterpriseCodeRes] = await Promise.all([
            generateUniqueCoachSlug(admin, `${org.slug}-${parsed.data.full_name}`),
            generateUniqueInviteCode(admin),
            admin.rpc('generate_unique_invite_code'),
        ])
        inviteCode = generatedInviteCode
        enterpriseCode = enterpriseCodeRes.data ?? null

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
        invite_code: enterpriseCode,
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
            ${enterpriseCode ? `<p><strong>Código de alumnos (organización):</strong> ${enterpriseCode}</p>` : ''}
        `,
    }).catch(() => null)

    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/team`)
    revalidatePath(`/org/${orgSlug}/audit`)
    // B-7: the alumno-facing code for an enterprise coach is the org code, not the standalone one.
    return { success: true, email, tempPassword, inviteCode: enterpriseCode, role: parsed.data.role }
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

    // Check seat limit — seats = coach capacity. Non-coach staff (ops/analyst/
    // brand_manager/org_admin, coach_id NULL) don't consume coach seats.
    const { count } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', org.id)
        .eq('status', 'active')
        .is('deleted_at', null)
        .not('coach_id', 'is', null)
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

    // B-7: a coach linked to an org gets a distinct ENTERPRISE invite code (unique across
    // both code spaces). Their standalone coaches.invite_code stays untouched → two codes.
    const enterpriseCode = parsed.data.role === 'coach'
        ? (await admin.rpc('generate_unique_invite_code')).data ?? null
        : null

    const { error: insertError } = await admin
        .from('organization_members')
        .insert({
            org_id: org.id,
            user_id: targetCoach.id,
            coach_id: targetCoach.id,
            role: parsed.data.role,
            status: 'active',
            joined_at: new Date().toISOString(),
            invite_code: enterpriseCode,
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

    // F6: never orphan enterprise clients. Block removal while the coach still has org clients
    // assigned; the admin must reassign them or send them to the unassigned pool first
    // (unassignAllOrgClientsFromCoachAction). Standalone clients (org_id NULL) are never touched.
    if (target.role === 'coach' && target.coach_id) {
        const { count: assignedClients } = await admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .eq('coach_id', target.coach_id)
        if ((assignedClients ?? 0) > 0) {
            return {
                error: `Este coach tiene ${assignedClients} alumno(s) de la organización asignados. Reasignalos a otro coach o quitalos del coach (pasan al pool sin asignar) antes de removerlo.`,
                blockedByAssignedClients: assignedClients ?? 0,
            }
        }
    }

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

/**
 * F6: send all of a coach's ORG clients to the org's unassigned pool — org_id stays set
 * (they remain enterprise clients), coach_id is cleared. Standalone clients (org_id NULL)
 * are never touched. Used by the "quitar todos los alumnos" button so the coach can then
 * be removed without orphaning anyone.
 */
export async function unassignAllOrgClientsFromCoachAction(orgSlug: string, coachId: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: moved, error } = await admin
        .from('clients')
        .update({ coach_id: null })
        .eq('org_id', org.id)
        .eq('coach_id', coachId)
        .select('id')
    if (error) return { error: error.message }

    await admin
        .from('coach_client_assignments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('org_id', org.id)
        .eq('coach_id', coachId)
        .is('deleted_at', null)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'org_clients.unassigned_from_coach',
        targetType: 'coach',
        targetId: coachId,
        metadata: { coach_id: coachId, moved_count: moved?.length ?? 0, destination: 'unassigned_pool' },
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
    revalidatePath(`/org/${orgSlug}/clients`)
    return { success: true, moved: moved?.length ?? 0 }
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

/**
 * B-11: reset an ENTERPRISE alumno's password from the org panel (mirror of the coach reset).
 * Scoped to clients that belong to this org; standalone clients (org_id NULL) are not reachable.
 */
export async function resetEnterpriseClientPasswordAction(orgSlug: string, clientId: string) {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }

    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: client } = await admin
        .from('clients')
        .select('id, email, full_name, coach_id')
        .eq('id', clientId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no pertenece a esta organización' }

    const tempPassword = generateTempPassword()
    const { error } = await admin.auth.admin.updateUserById(clientId, { password: tempPassword })
    if (error) return { error: error.message }
    await admin.from('clients').update({ force_password_change: true }).eq('id', clientId)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_client.password_reset',
        targetType: 'client',
        targetId: clientId,
        metadata: {},
    })

    // B-10: email the new credentials to the alumno (instead of manual-only sharing).
    if (client.email) {
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        const coachSlug = client.coach_id
            ? (await admin.from('coaches').select('slug').eq('id', client.coach_id).maybeSingle()).data?.slug
            : null
        const loginUrl = coachSlug ? `${appUrl}/c/${coachSlug}/login` : `${appUrl}/login`
        sendTransactionalEmail({
            to: client.email,
            subject: `${org.name} — nueva contraseña de acceso`,
            html: `
                <p>Hola ${client.full_name ?? ''},</p>
                <p>${org.name} restableció tu contraseña de acceso.</p>
                <p><strong>Acceso:</strong> ${loginUrl}</p>
                <p><strong>Email:</strong> ${client.email}</p>
                <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
                <p>Te pediremos cambiarla al ingresar.</p>
            `,
        }).catch(() => null)
    }

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
 * Reactivates a selection of archived clients (sets is_active=true).
 * Guards: all clients must belong to the org.
 */
export async function bulkReactivateClientsAction(
    orgSlug: string,
    clientIds: string[],
): Promise<{ success?: boolean; count?: number; error?: string }> {
    if (!clientIds.length) return { error: 'No hay alumnos seleccionados.' }
    if (clientIds.length > 50) return { error: 'Máximo 50 alumnos por operación.' }

    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

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
        .update({ is_active: true })
        .eq('org_id', org.id)
        .in('id', clientIds)
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.bulk_reactivated',
        targetType: 'client',
        targetId: org.id,
        metadata: { client_ids: clientIds, count: clientIds.length },
    })

    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, count: clientIds.length }
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

    // Update assignment record (unique is org_id+client_id; move to new coach)
    await admin.from('coach_client_assignments')
        .upsert({
            org_id: org.id,
            client_id: clientId,
            coach_id: newCoachId,
            assigned_at: new Date().toISOString(),
            assigned_by: user.id,
            deleted_at: null,
        }, { onConflict: 'org_id,client_id' })
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

/**
 * Reverts the most recent reassignment for a client back to the previous coach.
 * Reads the last `client.reassigned` audit event (from_coach_id) and reassigns.
 * Guards: org admin, client belongs to org, previous coach still active.
 */
export async function rollbackLastReassignmentAction(
    orgSlug: string,
    clientId: string,
): Promise<{ success?: boolean; error?: string; revertedToCoachId?: string }> {
    const context = await resolveOrgAdminContext(orgSlug)
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    // Find most recent reassignment for this client
    const { data: lastEvent } = await admin
        .from('org_audit_logs')
        .select('metadata, created_at')
        .eq('org_id', org.id)
        .eq('action', 'client.reassigned')
        .eq('target_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (!lastEvent) return { error: 'No hay reasignación reciente para revertir.' }

    const meta = lastEvent.metadata as { from_coach_id?: string | null } | null
    const previousCoachId = meta?.from_coach_id ?? null
    if (!previousCoachId) return { error: 'El alumno no tenía coach previo (era cola sin asignar).' }

    // Verify client + previous coach still valid
    const { data: client } = await admin
        .from('clients')
        .select('id, coach_id, full_name')
        .eq('id', clientId)
        .eq('org_id', org.id)
        .maybeSingle()
    if (!client) return { error: 'Alumno no pertenece a esta organización.' }

    const { data: prevCoach } = await admin
        .from('organization_members')
        .select('id')
        .eq('org_id', org.id)
        .eq('coach_id', previousCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!prevCoach) return { error: 'El coach anterior ya no está activo en la organización.' }

    if (client.coach_id === previousCoachId) return { error: 'El alumno ya está con el coach anterior.' }

    const { error } = await admin
        .from('clients')
        .update({ coach_id: previousCoachId })
        .eq('id', clientId)
        .eq('org_id', org.id)
    if (error) return { error: error.message }

    await admin.from('coach_client_assignments')
        .upsert({
            org_id: org.id,
            client_id: clientId,
            coach_id: previousCoachId,
            assigned_at: new Date().toISOString(),
            assigned_by: user.id,
            deleted_at: null,
        }, { onConflict: 'org_id,client_id' })
        .then(undefined, () => undefined)

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'client.reassignment_rolled_back',
        targetType: 'client',
        targetId: clientId,
        metadata: {
            reverted_from_coach_id: client.coach_id,
            reverted_to_coach_id: previousCoachId,
            client_name: client.full_name,
        },
    })

    revalidatePath(`/org/${orgSlug}/assignments`)
    revalidatePath(`/org/${orgSlug}/clients`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, revertedToCoachId: previousCoachId }
}

/**
 * Resets password for any enterprise staff member (not coach-specific).
 * Works by membership ID. Guards: org owner or admin only.
 * Returns temp password on success so caller can display it once.
 */
export async function resetStaffPasswordAction(
    orgSlug: string,
    memberId: string,
): Promise<{ success?: boolean; tempPassword?: string; error?: string }> {
    const context = await resolveOrgAdminContext(orgSlug, ['org_owner', 'org_admin'])
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const { data: target } = await admin
        .from('organization_members')
        .select('id, user_id, role, status')
        .eq('id', memberId)
        .eq('org_id', org.id)
        .is('deleted_at', null)
        .maybeSingle()
    if (!target) return { error: 'Miembro no encontrado' }
    if (!target.user_id) return { error: 'Sin cuenta de usuario asociada' }
    if (target.role === 'org_owner') return { error: 'No se puede resetear la contraseña del propietario desde este panel' }
    if (target.status === 'revoked') return { error: 'Este miembro está revocado' }

    const tempPassword = generateTempPassword()
    const { error } = await admin.auth.admin.updateUserById(target.user_id, { password: tempPassword })
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_staff.password_reset',
        targetType: 'organization_member',
        targetId: target.user_id,
        metadata: { member_id: memberId, role: target.role },
    })

    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, tempPassword }
}

/**
 * Changes the role of a non-owner staff member.
 * Supports all changeable roles: org_admin, ops, analyst, brand_manager.
 * Guards: org owner or admin only (ops cannot escalate roles).
 * Promotes new org_admin to MFA-required state.
 */
export async function updateStaffRoleAction(
    orgSlug: string,
    memberId: string,
    role: 'org_admin' | 'ops' | 'analyst' | 'brand_manager',
): Promise<{ success?: boolean; error?: string }> {
    const context = await resolveOrgAdminContext(orgSlug, ['org_owner', 'org_admin'])
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
    if (!target) return { error: 'Miembro no encontrado' }
    if (target.role === 'org_owner') return { error: 'No se puede cambiar el rol del propietario' }
    if (target.role === 'coach' || target.coach_id) return { error: 'Para cambiar rol de coach, usar el panel de Coaches' }
    if (target.status === 'revoked') return { error: 'Este miembro está revocado' }

    const { error } = await admin
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
    if (error) return { error: error.message }

    // Flag MFA setup if escalating to org_admin
    if (role === 'org_admin' && target.user_id) {
        await admin.auth.admin.updateUserById(target.user_id, {
            app_metadata: { requires_mfa_setup: true },
        }).catch(() => null) // non-fatal — MFA can be enforced at next login
    }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'enterprise_staff.role_updated',
        targetType: 'organization_member',
        targetId: target.user_id ?? memberId,
        metadata: { member_id: memberId, previous_role: target.role, new_role: role },
    })

    revalidatePath(`/org/${orgSlug}/team`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

/**
 * Creates an org-level workout template (coach_id = null, org_id = orgId).
 * Requires P2.5-C migration: workout_programs.coach_id nullable.
 * Only owner/admin can create org templates.
 */
export async function createOrgWorkoutTemplateAction(
    orgSlug: string,
    formData: FormData,
): Promise<{ success?: boolean; templateId?: string; error?: string }> {
    const context = await resolveOrgAdminContext(orgSlug, ['org_owner', 'org_admin'])
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const name = String(formData.get('name') ?? '').trim()
    const notes = String(formData.get('notes') ?? '').trim()
    const weeksToRepeat = Math.max(1, Math.min(52, Number(formData.get('weeks_to_repeat') ?? 4)))

    if (!name || name.length < 2) return { error: 'El nombre debe tener al menos 2 caracteres' }
    if (name.length > 120) return { error: 'Nombre demasiado largo (máx 120 caracteres)' }

    const { data, error } = await admin
        .from('workout_programs')
        .insert({
            org_id: org.id,
            coach_id: null,
            name,
            program_notes: notes || null,
            weeks_to_repeat: weeksToRepeat,
            is_active: false,
            program_phases: [],
        })
        .select('id')
        .single()
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'workout_template.created',
        targetType: 'workout_program',
        targetId: data.id,
        metadata: { name, weeks_to_repeat: weeksToRepeat },
    })

    revalidatePath(`/org/${orgSlug}/programs`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, templateId: data.id }
}

/**
 * Copies an org workout template to a coach's personal library.
 * Coach can then edit it in their builder and assign to clients.
 * Guards: owner/admin only. Template must be org-owned (coach_id = null).
 */
export async function assignOrgWorkoutTemplateToCoachAction(
    orgSlug: string,
    templateId: string,
    coachId: string,
): Promise<{ success?: boolean; error?: string }> {
    const context = await resolveOrgAdminContext(orgSlug, ['org_owner', 'org_admin'])
    if ('error' in context) return { error: context.error }
    const admin = createServiceRoleClient()
    const { org, user } = context

    const [templateRes, memberRes] = await Promise.all([
        admin.from('workout_programs')
            .select('id, name, program_phases, weeks_to_repeat, program_notes')
            .eq('id', templateId)
            .eq('org_id', org.id)
            .is('coach_id', null)
            .maybeSingle(),
        admin.from('organization_members')
            .select('id, coach_id')
            .eq('org_id', org.id)
            .eq('coach_id', coachId)
            .eq('status', 'active')
            .is('deleted_at', null)
            .maybeSingle(),
    ])

    if (!templateRes.data) return { error: 'Template no encontrado o no es un template de organización' }
    if (!memberRes.data) return { error: 'Coach no pertenece a esta organización o no está activo' }

    const t = templateRes.data
    const { error } = await admin.from('workout_programs').insert({
        org_id: org.id,
        coach_id: coachId,
        name: t.name,
        program_phases: t.program_phases,
        weeks_to_repeat: t.weeks_to_repeat,
        program_notes: t.program_notes,
        is_active: false,
        source_template_id: t.id,
    })
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: org.id,
        actorId: user.id,
        action: 'workout_template.assigned_to_coach',
        targetType: 'workout_program',
        targetId: templateId,
        metadata: { template_name: t.name, coach_id: coachId },
    })

    revalidatePath(`/org/${orgSlug}/programs`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
