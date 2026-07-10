import { NextRequest, NextResponse } from 'next/server'
import { writeTeamAuditEvent } from '@/services/team/team.service'
import { resolveMobileTeamManager, friendlyTeamError } from '../_lib'

/**
 * Endpoint mobile para editar la MARCA del team — subconjunto seguro: nombre + color primario
 * (los logos/acentos/loader/splash siguen siendo web-only por ahora: la subida direct-to-Storage
 * y el editor avanzado viven en apps/web/.../coach/team/_components/TeamBrandStudio.tsx). Espejo
 * parcial de updateTeamBrandAction. Cualquier gestor (owner o co-gestor); RLS team_teams_manager_update
 * es el techo. Update via userClient (token-scoped).
 */
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null)
    const teamId = typeof body?.teamId === 'string' ? body.teamId : null
    if (!teamId) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const ctx = await resolveMobileTeamManager(request, teamId)
    if ('error' in ctx) return ctx.error
    const { userId, userClient } = ctx

    const updates: Record<string, string | null> = {}

    if (typeof body?.name === 'string') {
        const name = body.name.trim()
        if (name.length < 2 || name.length > 80) return NextResponse.json({ error: 'Nombre del equipo: 2 a 80 caracteres.' }, { status: 400 })
        updates.name = name
    }

    if (body?.primary_color !== undefined) {
        const v = typeof body.primary_color === 'string' ? body.primary_color.trim() : ''
        if (v === '') {
            updates.primary_color = null // limpiar => vuelve al default del sistema
        } else if (!HEX_RE.test(v)) {
            return NextResponse.json({ error: 'Color inválido (formato #RRGGBB).' }, { status: 400 })
        } else {
            updates.primary_color = v
        }
    }

    if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nada que actualizar.' }, { status: 400 })

    const { error } = await userClient.from('teams').update(updates).eq('id', teamId)
    if (error) return NextResponse.json({ error: friendlyTeamError(error.message) }, { status: 400 })

    await writeTeamAuditEvent(userClient, {
        teamId,
        actorCoachId: userId,
        action: 'team.brand_updated',
        targetType: 'team',
        targetId: teamId,
        metadata: { fields: Object.keys(updates), source: 'mobile' },
    }).catch(() => {})

    return NextResponse.json({ success: true })
}
