import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function scope(q: any, orgId: string | null) {
    return orgId ? q.eq('org_id', orgId) : q.is('org_id', null)
}

/** Reset de contraseña del alumno (espejo de resetClientPasswordAction) — devuelve temp de 6 dígitos. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: userData, error: userError } = await admin.auth.getUser(token)
    const coachUser = userData.user
    if (userError || !coachUser) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })

    const workspace = await resolvePreferredWorkspace(admin, coachUser.id)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return NextResponse.json({ error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    const orgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null

    const { data: client } = await scope(admin.from('clients').select('id').eq('id', clientId).eq('coach_id', coachUser.id), orgId).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })

    const tempPassword = Math.floor(100000 + Math.random() * 900000).toString()
    const { error: authError } = await admin.auth.admin.updateUserById(clientId, { password: tempPassword })
    if (authError) return NextResponse.json({ error: `Error al actualizar: ${authError.message}`, code: 'RESET_FAILED' }, { status: 500 })

    await scope(admin.from('clients').update({ force_password_change: true }).eq('id', clientId), orgId)
    return NextResponse.json({ ok: true, tempPassword })
}
