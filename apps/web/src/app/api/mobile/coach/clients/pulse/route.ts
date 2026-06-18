import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { DashboardService } from '@/services/dashboard.service'
import { verifyMobileBearer } from '@/lib/mobile-auth'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

/** Métricas ricas por alumno (pulse) para el directorio mobile — reusa el cálculo de la web (1:1). */
export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    // GET read-only: verificación LOCAL del JWT (jose) con fallback a getUser ante JWKS caído.
    const auth = await verifyMobileBearer(token)
    if (!auth.ok) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const coachUserId = auth.userId
    const admin = createServiceRoleClient()

    const workspace = await resolvePreferredWorkspace(admin, coachUserId)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return NextResponse.json({ error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    const orgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null

    try {
        const pulse = await new DashboardService(admin).getDirectoryPulse(coachUserId, orgId)
        return NextResponse.json({ pulse })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo calcular el pulse.'
        return NextResponse.json({ error: msg, code: 'PULSE_FAILED' }, { status: 500 })
    }
}
