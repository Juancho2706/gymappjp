import { NextRequest, NextResponse } from 'next/server'
import { writeTeamAuditEvent } from '@/services/team/team.service'
import { resolveMobileTeamManager, friendlyTeamError } from '../_lib'

/**
 * Endpoint mobile para SACAR a un miembro del pool (soft-delete: status='revoked' + deleted_at).
 * Espejo de removeTeamMemberAction (apps/web/.../coach/team/_actions/team.actions.ts). Cualquier
 * gestor (owner o co-gestor). El owner NO se puede sacar (validado acá + trigger de gobernanza).
 * Mutación via userClient (token-scoped) para que apliquen RLS + triggers; auth por getUser.
 */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null)
    const teamId = typeof body?.teamId === 'string' ? body.teamId : null
    const memberId = typeof body?.memberId === 'string' ? body.memberId : null
    if (!teamId || !memberId) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const ctx = await resolveMobileTeamManager(request, teamId)
    if ('error' in ctx) return ctx.error
    const { userId, admin, userClient, team } = ctx

    const { data: member } = await admin
        .from('team_members')
        .select('id, coach_id, status')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Miembro no encontrado.' }, { status: 404 })
    if (member.coach_id === team.owner_coach_id) {
        return NextResponse.json({ error: 'No se puede sacar al owner. Transfiere la propiedad primero.' }, { status: 409 })
    }

    const { error } = await userClient
        .from('team_members')
        .update({ status: 'revoked', deleted_at: new Date().toISOString() })
        .eq('id', memberId)
    if (error) return NextResponse.json({ error: friendlyTeamError(error.message) }, { status: 400 })

    await writeTeamAuditEvent(userClient, {
        teamId,
        actorCoachId: userId,
        action: 'team_member.revoked',
        targetType: 'coach',
        targetId: member.coach_id,
        metadata: { member_id: memberId, previous_status: member.status },
    }).catch(() => {})

    return NextResponse.json({ success: true })
}
