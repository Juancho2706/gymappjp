import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

type CoachAuth = { error: NextResponse } | { admin: ReturnType<typeof createServiceRoleClient>; coachId: string; orgId: string | null }

async function authCoach(request: NextRequest): Promise<CoachAuth> {
    const token = bearerToken(request)
    if (!token) return { error: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }) }
    const admin = createServiceRoleClient()
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return { error: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
    const workspace = await resolvePreferredWorkspace(admin, data.user.id)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return { error: NextResponse.json({ error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 }) }
    }
    const orgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null
    return { admin, coachId: data.user.id, orgId }
}

function scope(q: any, orgId: string | null) {
    return orgId ? q.eq('org_id', orgId) : q.is('org_id', null)
}

async function ownsClient(admin: any, coachId: string, orgId: string | null, clientId: string): Promise<boolean> {
    const { data } = await scope(admin.from('clients').select('id').eq('id', clientId).eq('coach_id', coachId), orgId).maybeSingle()
    return !!data
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const a = await authCoach(request)
    if ('error' in a) return a.error
    if (!(await ownsClient(a.admin, a.coachId, a.orgId, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }
    const { error } = await scope(a.admin.from('clients').delete().eq('id', clientId).eq('coach_id', a.coachId), a.orgId)
    if (error) return NextResponse.json({ error: error.message, code: 'DELETE_FAILED' }, { status: 500 })
    await a.admin.auth.admin.deleteUser(clientId).catch(() => null)
    return NextResponse.json({ ok: true })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    const a = await authCoach(request)
    if ('error' in a) return a.error
    if (!(await ownsClient(a.admin, a.coachId, a.orgId, clientId))) {
        return NextResponse.json({ error: 'Alumno no encontrado.', code: 'NOT_FOUND' }, { status: 404 })
    }
    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const patch: { is_active?: boolean; is_archived?: boolean } = {}
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active
    if (typeof body.is_archived === 'boolean') patch.is_archived = body.is_archived
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar.', code: 'NO_FIELDS' }, { status: 400 })
    const { error } = await scope(a.admin.from('clients').update(patch).eq('id', clientId).eq('coach_id', a.coachId), a.orgId)
    if (error) return NextResponse.json({ error: error.message, code: 'UPDATE_FAILED' }, { status: 500 })
    return NextResponse.json({ ok: true })
}
