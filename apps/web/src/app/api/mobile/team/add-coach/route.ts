import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sanitizePlatformEmail } from '@/lib/auth/platform-email'
import { writeTeamAuditEvent } from '@/services/team/team.service'

/**
 * Endpoint mobile para vincular un coach EXISTENTE (por email) a un equipo. Espejo de
 * addExistingCoachAction (apps/web/.../coach/team/_actions/team.actions.ts). El mobile NO puede
 * hacer esto por PostgREST directo: el lookup por email es un RPC SECURITY DEFINER y el aislamiento
 * team<->enterprise lee organization_members (RLS no se lo deja al coach). Acá:
 *  - admin (service-role): get_coach_id_by_email + organization_members + lookup de membresía previa.
 *  - userClient (token-scoped, RLS): seat pre-check + is_team_manager + el INSERT/UPDATE de
 *    team_members (para que disparen los triggers seat_guard + team_members_guard, que service-role
 *    bypassearia). Mutación => auth por getUser (autoritativo, revocation-sensitive), no jose.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function friendlyTeamError(msg: string): string {
    if (msg.includes('seat_limit')) return 'Límite de cupos alcanzado. Pide al administrador ampliar el equipo.'
    if (msg.toLowerCase().includes('row-level security') || msg.includes('permission')) return 'No tienes permiso para esta acción.'
    return msg
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = ud.user.id

    const body = await request.json().catch(() => null)
    const teamId = typeof body?.teamId === 'string' ? body.teamId : null
    const emailRaw = typeof body?.email === 'string' ? body.email : null
    const displayRole = typeof body?.display_role === 'string' && body.display_role.trim() ? body.display_role.trim() : null
    if (!teamId || !emailRaw) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    // Client token-scoped: RLS + triggers como el web user-scoped.
    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Manager context (espejo resolveTeamManagerContext): owner o is_team_manager.
    const { data: team } = await admin
        .from('teams')
        .select('id, seat_limit, owner_coach_id')
        .eq('id', teamId)
        .is('deleted_at', null)
        .maybeSingle()
    if (!team) return NextResponse.json({ error: 'Equipo no encontrado.' }, { status: 404 })
    const isOwner = team.owner_coach_id === userId
    if (!isOwner) {
        const { data: isMgr } = await userClient.rpc('is_team_manager', { p_team_id: teamId })
        if (isMgr !== true) return NextResponse.json({ error: 'No tienes permisos de gestión en este equipo.' }, { status: 403 })
    }

    // Seat pre-check (UX; el trigger seat_guard es el guard duro).
    const { count: activeCount } = await userClient
        .from('team_members')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active')
        .is('deleted_at', null)
    if ((activeCount ?? 0) >= team.seat_limit) {
        return NextResponse.json({ error: `Límite de ${team.seat_limit} cupos alcanzado.` }, { status: 409 })
    }

    const email = sanitizePlatformEmail(emailRaw)
    const { data: targetCoachId } = await (admin.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: string | null }>)(
        'get_coach_id_by_email', { p_email: email },
    )
    if (!targetCoachId) return NextResponse.json({ error: 'No existe un coach con ese email.' }, { status: 404 })

    // Aislamiento team<->enterprise.
    const { data: orgMember } = await admin
        .from('organization_members')
        .select('id')
        .eq('user_id', targetCoachId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (orgMember) return NextResponse.json({ error: 'Ese coach pertenece a una organización; no se puede sumar a un equipo.' }, { status: 409 })

    const { data: existing } = await admin
        .from('team_members')
        .select('id, status, deleted_at')
        .eq('team_id', teamId)
        .eq('coach_id', targetCoachId)
        .maybeSingle()

    if (existing && existing.status === 'active' && !existing.deleted_at) {
        return NextResponse.json({ error: 'Ese coach ya es miembro del equipo.' }, { status: 409 })
    }

    if (existing) {
        const { error: reErr } = await userClient
            .from('team_members')
            .update({ status: 'active', deleted_at: null, display_role: displayRole })
            .eq('id', existing.id)
        if (reErr) return NextResponse.json({ error: friendlyTeamError(reErr.message) }, { status: 400 })
    } else {
        const { error: insErr } = await userClient.from('team_members').insert({
            team_id: teamId,
            coach_id: targetCoachId,
            display_role: displayRole,
            can_manage: false,
            status: 'active',
        })
        if (insErr) return NextResponse.json({ error: friendlyTeamError(insErr.message) }, { status: 400 })
    }

    await writeTeamAuditEvent(userClient, {
        teamId,
        actorCoachId: userId,
        action: 'team_member.linked',
        targetType: 'coach',
        targetId: targetCoachId,
        metadata: { email, reactivated: !!existing },
    }).catch(() => {})

    return NextResponse.json({ success: true })
}
