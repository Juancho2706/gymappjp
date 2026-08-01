import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { DashboardService } from '@/services/dashboard.service'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolveMobileCoachDataScope } from '@/app/api/mobile/coach/clients/_mutation-auth'

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

    const dataScope = await resolveMobileCoachDataScope(admin, coachUserId, request.nextUrl.searchParams)
    if (!dataScope) {
        return NextResponse.json({ error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }
    const scope = {
        orgId: dataScope.type === 'enterprise' ? dataScope.orgId : null,
        teamId: dataScope.type === 'team' ? dataScope.teamId : null,
    }

    try {
        const pulse = await new DashboardService(admin).getDirectoryPulse(coachUserId, scope)
        return NextResponse.json({ pulse })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo calcular el pulse.'
        return NextResponse.json({ error: msg, code: 'PULSE_FAILED' }, { status: 500 })
    }
}
