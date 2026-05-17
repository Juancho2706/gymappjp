'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { rateLimitOrgCreation } from '@/lib/rate-limit'

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
        .eq('coach_id', user.id)
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

    revalidatePath(`/org/${orgSlug}`)
    return { success: true, logoUrl: publicUrl }
}

const UpdateOrgSchema = z.object({
    name: z.string().min(2).max(80),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal('')),
})

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
        .eq('coach_id', user.id)
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

    revalidatePath(`/org/${orgSlug}`)
    return { success: true }
}

const InviteCoachSchema = z.object({
    email: z.email(),
    role: z.enum(['org_admin', 'coach']),
})

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
        .eq('coach_id', user.id)
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
            coach_id: targetCoach.id,
            role: parsed.data.role,
            status: 'invited',
        })
    if (insertError) return { error: insertError.message }

    // Audit log
    await admin.from('org_audit_logs').insert({
        org_id: org.id,
        actor_id: user.id,
        action: 'invite_coach',
        target_type: 'coach',
        target_id: targetCoach.id,
        metadata: { email: parsed.data.email, role: parsed.data.role },
    })

    revalidatePath(`/org/${orgSlug}/coaches`)
    return { success: true }
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
        .eq('coach_id', user.id)
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

    await admin.from('org_audit_logs').insert({
        org_id: org.id,
        actor_id: user.id,
        action: 'remove_coach',
        target_type: 'coach',
        target_id: target.coach_id,
        metadata: {},
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
