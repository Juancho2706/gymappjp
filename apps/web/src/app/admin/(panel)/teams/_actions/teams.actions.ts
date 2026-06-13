'use server'

import { revalidatePath } from 'next/cache'
import { CreateTeamAdminSchema, UpdateTeamAdminSchema } from '@eva/schemas'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'
import { assertPlatformEmailAvailable, sanitizePlatformEmail } from '@/lib/auth/platform-email'
import { generateUniqueCoachSlug } from '@/services/org/org.service'
import { generateUniqueInviteCode } from '@/services/coach/coach.service'
import { getTierMaxClients } from '@/lib/constants'
import { readModules } from '../../_actions/module-form'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type CreateTeamResult =
    | { success: true; teamId: string; slug: string; ownerEmail?: string; tempPassword?: string }
    | { error: string }

const slugify = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46)

async function uniqueTeamSlug(admin: DB, base: string): Promise<string | null> {
    const clean = slugify(base)
    if (!clean) return null
    for (let i = 0; i < 8; i++) {
        const slug = i === 0 ? clean : `${clean}-${Math.random().toString(36).slice(2, 6)}`
        const { data } = await admin.from('teams').select('id').eq('slug', slug).is('deleted_at', null).maybeSingle()
        if (!data) return slug
    }
    return null
}

/** CEO crea un team + su owner (coach existente por email, o cuenta nueva). Aditivo. */
export async function createTeamAction(_prev: CreateTeamResult | null, formData: FormData): Promise<CreateTeamResult> {
    const { user, adminClient } = await assertAdmin()

    const parsed = CreateTeamAdminSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues.map(i => i.message).join(', ') }
    const { name, slug: slugInput, seat_limit, owner_mode, owner_email, owner_full_name, owner_temp_password } = parsed.data

    const slug = await uniqueTeamSlug(adminClient, slugInput || name)
    if (!slug) return { error: 'No se pudo generar un slug único. Probá otro nombre.' }

    const enabledModules = readModules(formData)
    const email = sanitizePlatformEmail(owner_email)

    // ── Resolver owner ──
    let ownerCoachId: string
    let createdNewOwner = false
    let tempPassword: string | undefined

    if (owner_mode === 'existing') {
        const { data: coachId } = await (adminClient.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: string | null }>)(
            'get_coach_id_by_email', { p_email: email },
        )
        if (!coachId) return { error: 'No existe un coach con ese email. Usá "Crear cuenta nueva" o revisá el email.' }
        // Aislamiento team<->enterprise: un coach de una organización no puede ser owner de un team.
        const { data: orgMember } = await adminClient
            .from('organization_members').select('id').eq('user_id', coachId).eq('status', 'active').is('deleted_at', null).maybeSingle()
        if (orgMember) return { error: 'Ese coach pertenece a una organización enterprise; no puede ser owner de un team.' }
        ownerCoachId = coachId
    } else {
        if (!owner_full_name || owner_full_name.trim().length < 2) return { error: 'Para una cuenta nueva, ingresá el nombre del owner.' }
        const availability = await assertPlatformEmailAvailable(adminClient, email)
        if (!availability.ok) return { error: availability.error }

        tempPassword = owner_temp_password || `Eva${Math.random().toString(36).slice(2, 8)}${Math.floor(1000 + Math.random() * 9000)}!`
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
            email, password: tempPassword, email_confirm: true,
            user_metadata: { full_name: owner_full_name },
            app_metadata: { requires_password_change: true },
        })
        if (authError || !authData.user) return { error: authError?.message ?? 'No se pudo crear el usuario owner' }
        ownerCoachId = authData.user.id
        createdNewOwner = true

        const [coachSlug, inviteCode] = await Promise.all([
            generateUniqueCoachSlug(adminClient, owner_full_name),
            generateUniqueInviteCode(adminClient),
        ])
        const now = new Date().toISOString()
        const { error: coachError } = await adminClient.from('coaches').insert({
            id: ownerCoachId, full_name: owner_full_name, brand_name: name, slug: coachSlug, invite_code: inviteCode,
            primary_color: '#10B981', subscription_status: 'team_managed', subscription_tier: 'scale',
            billing_cycle: 'monthly', payment_provider: 'admin', max_clients: getTierMaxClients('scale'),
            // El owner se crea con invite_code conocido — saltea el modal de migración one-shot
            // (PublicCodeRequiredModal), pensado solo para coaches legacy sin código.
            onboarding_guide: { invite_code_confirmed: true, invite_code_confirmed_at: now } as Json,
        })
        if (coachError) {
            await adminClient.auth.admin.deleteUser(ownerCoachId)
            return { error: coachError.message }
        }
    }

    // ── Crear team + fila de owner en team_members (service-role) ──
    // A.bis2: invite_code SIEMPRE explícito (lección coaches: el default '' rompe la unicidad).
    const teamInviteCode = await generateUniqueInviteCode(adminClient)
    const { data: team, error: teamError } = await adminClient
        .from('teams')
        .insert({ name, slug, owner_coach_id: ownerCoachId, seat_limit, enabled_modules: enabledModules as Json, invite_code: teamInviteCode })
        .select('id')
        .single()
    if (teamError || !team) {
        if (createdNewOwner) { await adminClient.from('coaches').delete().eq('id', ownerCoachId); await adminClient.auth.admin.deleteUser(ownerCoachId) }
        const friendly = teamError?.code === '23505' ? 'Ese identificador (slug) ya está en uso. Probá otro.' : (teamError?.message ?? 'No se pudo crear el equipo')
        return { error: friendly }
    }

    const { error: memberError } = await adminClient.from('team_members').insert({
        team_id: team.id, coach_id: ownerCoachId, can_manage: true, status: 'active', display_role: 'Owner',
    })
    if (memberError) {
        await adminClient.from('teams').delete().eq('id', team.id)
        if (createdNewOwner) { await adminClient.from('coaches').delete().eq('id', ownerCoachId); await adminClient.auth.admin.deleteUser(ownerCoachId) }
        return { error: memberError.message }
    }

    await logAdminAction(adminClient, 'team.create', 'teams', team.id, {
        slug, seat_limit, owner_mode, owner_email: email, modules: enabledModules,
    }, user.email)
    revalidatePath('/admin/teams')

    return createdNewOwner
        ? { success: true, teamId: team.id, slug, ownerEmail: email, tempPassword }
        : { success: true, teamId: team.id, slug }
}

export type UpdateTeamResult = { success: true } | { error: string }

/** CEO edita nombre, seat_limit y módulos de un team. No baja el cupo por debajo de los activos. */
export async function updateTeamAction(teamId: string, formData: FormData): Promise<UpdateTeamResult> {
    const { user, adminClient } = await assertAdmin()

    const parsed = UpdateTeamAdminSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) return { error: parsed.error.issues.map(i => i.message).join(', ') }
    const { name, seat_limit } = parsed.data
    const enabledModules = readModules(formData)

    const { count } = await adminClient
        .from('team_members').select('id', { count: 'exact', head: true })
        .eq('team_id', teamId).eq('status', 'active').is('deleted_at', null)
    if ((count ?? 0) > seat_limit) {
        return { error: `El equipo ya tiene ${count} miembros activos; el cupo no puede ser menor.` }
    }

    const { error } = await adminClient
        .from('teams')
        .update({ name, seat_limit, enabled_modules: enabledModules as Json })
        .eq('id', teamId)
        .is('deleted_at', null)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, 'team.update', 'teams', teamId, { name, seat_limit, modules: enabledModules }, user.email)
    revalidatePath('/admin/teams')
    return { success: true }
}

/**
 * Kill-switch de plataforma: suspende/reactiva un team COMPLETO (flag de operador).
 * Suspendido ⇒ el RPC del alumno no resuelve el team (shell /t cae en holding) y los
 * coaches pierden el workspace team (workspace.repository lo excluye). Reversible.
 */
export async function setTeamSuspendedAction(teamId: string, suspend: boolean): Promise<UpdateTeamResult> {
    const { user, adminClient } = await assertAdmin()

    const { error } = await adminClient
        .from('teams')
        .update({ suspended_at: suspend ? new Date().toISOString() : null })
        .eq('id', teamId)
        .is('deleted_at', null)
    if (error) return { error: error.message }

    await logAdminAction(adminClient, suspend ? 'team.suspend' : 'team.unsuspend', 'teams', teamId, {}, user.email)
    revalidatePath('/admin/teams')
    return { success: true }
}
