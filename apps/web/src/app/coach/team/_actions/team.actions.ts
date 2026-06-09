'use server'

import { revalidatePath } from 'next/cache'
import { CreateTeamCoachSchema, AddExistingCoachSchema, UpdateTeamMemberRoleSchema } from '@eva/schemas'
import { assertPlatformEmailAvailable, sanitizePlatformEmail } from '@/lib/auth/platform-email'
import { generateTempPassword, generateUniqueCoachSlug } from '@/services/org/org.service'
import { resolveTeamManagerContext, writeTeamAuditEvent } from '@/services/team/team.service'
import { getTierMaxClients } from '@/lib/constants'

/** Cupos activos usados ahora (user-scoped: RLS techo). Pre-check de UX; el trigger seat_guard es el guard duro. */
async function countActiveMembers(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>, teamId: string): Promise<number> {
    const { count } = await supabase
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active')
        .is('deleted_at', null)
    return count ?? 0
}

/**
 * Crea un coach NUEVO (cuenta auth + fila coaches) y lo suma al pool.
 * - Cuentas auth/coaches via service-role (admin).
 * - team_members via cliente USER-scoped: dispara seat_guard + anti-escalacion (service_role los bypasearia).
 * - can_manage=true solo si el llamante es owner (re-validado por trigger team_members_guard).
 */
export async function createTeamCoachAction(teamId: string, formData: FormData) {
    const parsed = CreateTeamCoachSchema.safeParse({
        full_name: formData.get('full_name'),
        email: formData.get('email'),
        display_role: formData.get('display_role') ?? '',
        can_manage: formData.get('can_manage') === 'on' || formData.get('can_manage') === 'true',
        temp_password: formData.get('temp_password') || undefined,
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const ctx = await resolveTeamManagerContext(teamId)
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, admin, user, team, isOwner } = ctx

    const wantsManage = parsed.data.can_manage === true
    if (wantsManage && !isOwner) return { error: 'Solo el owner puede crear co-gestores.' }

    if ((await countActiveMembers(supabase, teamId)) >= team.seat_limit) {
        return { error: `Límite de ${team.seat_limit} cupos alcanzado. Pide al admin ampliar el equipo.` }
    }

    const email = sanitizePlatformEmail(parsed.data.email)
    const availability = await assertPlatformEmailAvailable(admin, email)
    if (!availability.ok) return { error: availability.error }

    const tempPassword = parsed.data.temp_password || generateTempPassword()
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: parsed.data.full_name },
        app_metadata: { requires_password_change: true },
    })
    if (authError || !authData.user) return { error: authError?.message ?? 'No se pudo crear el usuario' }
    const newCoachId = authData.user.id

    const slug = await generateUniqueCoachSlug(admin, parsed.data.full_name)
    const { error: coachError } = await admin.from('coaches').insert({
        id: newCoachId,
        full_name: parsed.data.full_name,
        brand_name: team.name,
        slug,
        primary_color: team.primary_color ?? '#10B981',
        logo_url: team.logo_url,
        subscription_status: 'active',
        subscription_tier: 'free',
        billing_cycle: 'monthly',
        payment_provider: 'admin',
        max_clients: getTierMaxClients('free'),
    })
    if (coachError) {
        await admin.auth.admin.deleteUser(newCoachId)
        return { error: coachError.message }
    }

    const { error: memberError } = await supabase.from('team_members').insert({
        team_id: teamId,
        coach_id: newCoachId,
        display_role: parsed.data.display_role || null,
        can_manage: isOwner ? wantsManage : false,
        status: 'active',
    })
    if (memberError) {
        await admin.from('coaches').delete().eq('id', newCoachId)
        await admin.auth.admin.deleteUser(newCoachId)
        return { error: memberError.message }
    }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team_member.created',
        targetType: 'coach',
        targetId: newCoachId,
        metadata: { email, display_role: parsed.data.display_role || null, can_manage: isOwner ? wantsManage : false },
    })

    revalidatePath('/coach/team')
    return { success: true, email, tempPassword }
}

/**
 * Vincula un coach EXISTENTE (por email) al pool. Si tiene una membresia previa revocada,
 * la reactiva (UPDATE); si no, inserta. Ambas via user-scoped (RLS manager + seat pre-check).
 */
export async function addExistingCoachAction(teamId: string, formData: FormData) {
    const parsed = AddExistingCoachSchema.safeParse({
        email: formData.get('email'),
        display_role: formData.get('display_role') ?? '',
    })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const ctx = await resolveTeamManagerContext(teamId)
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, admin, user, team } = ctx

    if ((await countActiveMembers(supabase, teamId)) >= team.seat_limit) {
        return { error: `Límite de ${team.seat_limit} cupos alcanzado.` }
    }

    const email = sanitizePlatformEmail(parsed.data.email)
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const targetUser = users?.users.find(u => u.email === email)
    if (!targetUser) return { error: 'No existe un coach con ese email.' }

    const { data: targetCoach } = await admin.from('coaches').select('id').eq('id', targetUser.id).maybeSingle()
    if (!targetCoach) return { error: 'Ese usuario no es un coach en la plataforma.' }

    const { data: existing } = await admin
        .from('team_members')
        .select('id, status, deleted_at')
        .eq('team_id', teamId)
        .eq('coach_id', targetCoach.id)
        .maybeSingle()

    if (existing && existing.status === 'active' && !existing.deleted_at) {
        return { error: 'Ese coach ya es miembro del equipo.' }
    }

    if (existing) {
        const { error: reErr } = await supabase
            .from('team_members')
            .update({ status: 'active', deleted_at: null, display_role: parsed.data.display_role || null })
            .eq('id', existing.id)
        if (reErr) return { error: reErr.message }
    } else {
        const { error: insErr } = await supabase.from('team_members').insert({
            team_id: teamId,
            coach_id: targetCoach.id,
            display_role: parsed.data.display_role || null,
            can_manage: false,
            status: 'active',
        })
        if (insErr) return { error: insErr.message }
    }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team_member.linked',
        targetType: 'coach',
        targetId: targetCoach.id,
        metadata: { email, reactivated: !!existing },
    })

    revalidatePath('/coach/team')
    return { success: true }
}

/** Saca a un miembro del pool (soft-delete: status='revoked' + deleted_at). El owner no puede sacarse (trigger). */
export async function removeTeamMemberAction(teamId: string, memberId: string) {
    const ctx = await resolveTeamManagerContext(teamId)
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, admin, user, team } = ctx

    const { data: member } = await admin
        .from('team_members')
        .select('id, coach_id, status')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle()
    if (!member) return { error: 'Miembro no encontrado.' }
    if (member.coach_id === team.owner_coach_id) return { error: 'No se puede sacar al owner. Transfiere la propiedad primero.' }

    const { error } = await supabase
        .from('team_members')
        .update({ status: 'revoked', deleted_at: new Date().toISOString() })
        .eq('id', memberId)
    if (error) return { error: error.message }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team_member.revoked',
        targetType: 'coach',
        targetId: member.coach_id,
        metadata: { member_id: memberId, previous_status: member.status },
    })

    revalidatePath('/coach/team')
    return { success: true }
}

/** Promueve/degrada co-gestor (can_manage). Solo owner (trigger team_members_guard lo exige). */
export async function setTeamMemberManageAction(teamId: string, memberId: string, canManage: boolean) {
    const ctx = await resolveTeamManagerContext(teamId, { requireOwner: true })
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, admin, user, team } = ctx

    const { data: member } = await admin
        .from('team_members')
        .select('id, coach_id')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle()
    if (!member) return { error: 'Miembro no encontrado.' }
    if (member.coach_id === team.owner_coach_id) return { error: 'El owner ya gestiona el equipo.' }

    const { error } = await supabase.from('team_members').update({ can_manage: canManage }).eq('id', memberId)
    if (error) return { error: error.message }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: canManage ? 'team_member.promoted' : 'team_member.demoted',
        targetType: 'coach',
        targetId: member.coach_id,
        metadata: { member_id: memberId },
    })

    revalidatePath('/coach/team')
    return { success: true }
}

/** Transfiere la propiedad del team a otro miembro activo. Solo owner. */
export async function transferTeamOwnershipAction(teamId: string, newOwnerCoachId: string) {
    const ctx = await resolveTeamManagerContext(teamId, { requireOwner: true })
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, admin, user, team } = ctx

    if (newOwnerCoachId === team.owner_coach_id) return { error: 'Ese coach ya es el owner.' }

    const { data: target } = await admin
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('coach_id', newOwnerCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!target) return { error: 'El nuevo owner debe ser un miembro activo del equipo.' }

    // Mientras el llamante AUN es owner: deja al nuevo owner y al saliente como co-gestores
    // (can_manage requiere owner; tras el swap ya no podria setearse desde el saliente).
    await supabase.from('team_members').update({ can_manage: true }).eq('team_id', teamId).eq('coach_id', newOwnerCoachId)
    await supabase.from('team_members').update({ can_manage: true }).eq('team_id', teamId).eq('coach_id', team.owner_coach_id)

    const { error } = await supabase.from('teams').update({ owner_coach_id: newOwnerCoachId }).eq('id', teamId)
    if (error) return { error: error.message }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team.ownership_transferred',
        targetType: 'coach',
        targetId: newOwnerCoachId,
        metadata: { previous_owner: team.owner_coach_id },
    })

    revalidatePath('/coach/team')
    return { success: true }
}

/** Edita la etiqueta de especialidad (display only). Cualquier manager. */
export async function updateTeamMemberRoleAction(teamId: string, memberId: string, displayRole: string) {
    const parsed = UpdateTeamMemberRoleSchema.safeParse({ display_role: displayRole })
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Etiqueta inválida' }

    const ctx = await resolveTeamManagerContext(teamId)
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user } = ctx

    const { error } = await supabase
        .from('team_members')
        .update({ display_role: parsed.data.display_role || null })
        .eq('id', memberId)
        .eq('team_id', teamId)
    if (error) return { error: error.message }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team_member.role_updated',
        targetType: 'team_member',
        targetId: memberId,
        metadata: { display_role: parsed.data.display_role || null },
    })

    revalidatePath('/coach/team')
    return { success: true }
}
