import { NextRequest, NextResponse } from 'next/server'
import { writeTeamAuditEvent } from '@/services/team/team.service'
import { resolveMobileTeamManager, friendlyTeamError } from '../_lib'

/**
 * Endpoint mobile para PROMOVER/DEGRADAR co-gestor (can_manage). Espejo de
 * setTeamMemberManageAction (apps/web/.../coach/team/_actions/team.actions.ts). SOLO owner
 * (requireOwner) — el trigger team_members_guard lo exige a nivel DB. El owner ya gestiona:
 * no se puede tocar a sí mismo. No-op idempotente si ya está en el estado pedido.
 */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null)
    const teamId = typeof body?.teamId === 'string' ? body.teamId : null
    const memberId = typeof body?.memberId === 'string' ? body.memberId : null
    const canManage = body?.canManage === true
    if (!teamId || !memberId) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const ctx = await resolveMobileTeamManager(request, teamId, { requireOwner: true })
    if ('error' in ctx) return ctx.error
    const { userId, admin, userClient, team } = ctx

    const { data: member } = await admin
        .from('team_members')
        .select('id, coach_id, can_manage')
        .eq('id', memberId)
        .eq('team_id', teamId)
        .maybeSingle()
    if (!member) return NextResponse.json({ error: 'Miembro no encontrado.' }, { status: 404 })
    if (member.coach_id === team.owner_coach_id) return NextResponse.json({ error: 'El owner ya gestiona el equipo.' }, { status: 409 })
    // No-op idempotente: ya está en el estado pedido -> evita bitácora duplicada (doble tap).
    if (member.can_manage === canManage) return NextResponse.json({ success: true })

    const { error } = await userClient.from('team_members').update({ can_manage: canManage }).eq('id', memberId)
    if (error) return NextResponse.json({ error: friendlyTeamError(error.message) }, { status: 400 })

    await writeTeamAuditEvent(userClient, {
        teamId,
        actorCoachId: userId,
        action: canManage ? 'team_member.promoted' : 'team_member.demoted',
        targetType: 'coach',
        targetId: member.coach_id,
        metadata: { member_id: memberId },
    }).catch(() => {})

    return NextResponse.json({ success: true })
}
