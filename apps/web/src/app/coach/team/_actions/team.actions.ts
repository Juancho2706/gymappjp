'use server'

import { revalidatePath } from 'next/cache'
import { CreateTeamCoachSchema, AddExistingCoachSchema, UpdateTeamMemberRoleSchema } from '@eva/schemas'
import { assertPlatformEmailAvailable, sanitizePlatformEmail } from '@/lib/auth/platform-email'
import { generateTempPassword, generateUniqueCoachSlug } from '@/services/org/org.service'
import { generateUniqueInviteCode } from '@/services/coach/coach.service'
import { resolveTeamManagerContext, writeTeamAuditEvent } from '@/services/team/team.service'
import { getTierMaxClients } from '@/lib/constants'

/** Mapea mensajes crudos de triggers/constraints de DB a copy amigable en español. */
function friendlyTeamError(msg: string | undefined): string {
    if (!msg) return 'No se pudo completar la acción. Intenta de nuevo.'
    if (msg.includes('seat_limit')) return 'Límite de cupos alcanzado. Pide al administrador ampliar el equipo.'
    if (msg.includes('owner')) return 'Esta acción solo la puede hacer el owner del equipo.'
    if (msg.includes('can_manage')) return 'Solo el owner puede cambiar los permisos de gestión.'
    if (msg.includes('duplicate key') || msg.includes('unique')) return 'Ese coach ya está en el equipo.'
    return 'No se pudo completar la acción. Intenta de nuevo.'
}

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

    // invite_code: coaches.invite_code tiene DEFAULT '' y el trigger generador solo dispara con
    // NULL -> si se omite, la fila queda con '' y el 2do coach colisiona en el unique. Lo generamos
    // explicito (mismo patron que el flujo enterprise).
    const [slug, inviteCode] = await Promise.all([
        generateUniqueCoachSlug(admin, parsed.data.full_name),
        generateUniqueInviteCode(admin),
    ])
    const { error: coachError } = await admin.from('coaches').insert({
        id: newCoachId,
        full_name: parsed.data.full_name,
        brand_name: team.name,
        slug,
        invite_code: inviteCode,
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
        return { error: friendlyTeamError(coachError.message) }
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
        return { error: friendlyTeamError(memberError.message) }
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
    // Lookup directo por email (RPC SECURITY DEFINER) -> no falla con >1000 usuarios como listUsers paginado.
    const { data: targetCoachId } = await (admin.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: string | null }>)(
        'get_coach_id_by_email', { p_email: email },
    )
    if (!targetCoachId) return { error: 'No existe un coach con ese email.' }

    // Aislamiento team<->enterprise: no absorber a un coach que ya pertenece a una organización.
    const { data: orgMember } = await admin
        .from('organization_members')
        .select('id')
        .eq('user_id', targetCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (orgMember) return { error: 'Ese coach pertenece a una organización; no se puede sumar a un equipo.' }

    const { data: existing } = await admin
        .from('team_members')
        .select('id, status, deleted_at')
        .eq('team_id', teamId)
        .eq('coach_id', targetCoachId)
        .maybeSingle()

    if (existing && existing.status === 'active' && !existing.deleted_at) {
        return { error: 'Ese coach ya es miembro del equipo.' }
    }

    if (existing) {
        const { error: reErr } = await supabase
            .from('team_members')
            .update({ status: 'active', deleted_at: null, display_role: parsed.data.display_role || null })
            .eq('id', existing.id)
        if (reErr) return { error: friendlyTeamError(reErr.message) }
    } else {
        const { error: insErr } = await supabase.from('team_members').insert({
            team_id: teamId,
            coach_id: targetCoachId,
            display_role: parsed.data.display_role || null,
            can_manage: false,
            status: 'active',
        })
        if (insErr) return { error: friendlyTeamError(insErr.message) }
    }

    await writeTeamAuditEvent(supabase, {
        teamId,
        actorCoachId: user.id,
        action: 'team_member.linked',
        targetType: 'coach',
        targetId: targetCoachId,
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
    if (error) return { error: friendlyTeamError(error.message) }

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
        .select('id, coach_id, can_manage')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle()
    if (!member) return { error: 'Miembro no encontrado.' }
    if (member.coach_id === team.owner_coach_id) return { error: 'El owner ya gestiona el equipo.' }
    // No-op idempotente: ya está en el estado pedido -> evita bitácora duplicada (doble click/tabs).
    if (member.can_manage === canManage) return { success: true }

    const { error } = await supabase.from('team_members').update({ can_manage: canManage }).eq('id', memberId)
    if (error) return { error: friendlyTeamError(error.message) }

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

/** Transfiere la propiedad del team a otro miembro activo. Solo owner. Atómico vía RPC. */
export async function transferTeamOwnershipAction(teamId: string, newOwnerCoachId: string) {
    const ctx = await resolveTeamManagerContext(teamId, { requireOwner: true })
    if ('error' in ctx) return { error: ctx.error }
    const { supabase, user, team } = ctx

    if (newOwnerCoachId === team.owner_coach_id) return { error: 'Ese coach ya es el owner.' }

    // RPC atómico (una tx): auto-verifica owner=auth.uid() + nuevo owner activo, setea can_manage de
    // ambos y hace el swap. Antes eran 3 writes sueltos sin tx -> fallo parcial dejaba estado inconsistente.
    const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ error: { message: string } | null }>)(
        'transfer_team_ownership', { p_team_id: teamId, p_new_owner: newOwnerCoachId },
    )
    if (error) return { error: friendlyTeamError(error.message) }

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
