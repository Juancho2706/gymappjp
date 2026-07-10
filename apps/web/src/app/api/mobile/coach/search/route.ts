import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { clientIpFromRequest, jsonRateLimited, rateLimitCoachSearch } from '@/lib/rate-limit'
import {
    emptyCoachSearchResults,
    MIN_QUERY_LENGTH,
    searchCoachWorkspace,
} from '@/services/search/coach-search.service'

/**
 * GET /api/mobile/coach/search?q=… — puente Bearer de la búsqueda global del coach para la app RN.
 *
 * Espejo de `api/coach/search` (topbar web) pero con auth Bearer (`verifyMobileBearer`) en vez de
 * cookie. REUTILIZA el mismo `searchCoachWorkspace` (services/search) — no duplica política de
 * visibilidad. La IDENTIDAD y el SCOPE se derivan SIEMPRE server-side del JWT + el workspace
 * preferido; jamás del query string (regla CLAUDE.md: scope = auth.uid(), no la URL).
 *
 * El service aplica filtros de scope EXPLÍCITOS (coach_id / org_id / team_id) además de RLS, así que
 * es seguro correrlo con el service-role client (mismo patrón que `/api/mobile/coach/dashboard`).
 */

export const dynamic = 'force-dynamic'

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

const querySchema = z.object({
    q: z.string().trim().min(MIN_QUERY_LENGTH).max(100),
})

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    // GET read-only: verificación LOCAL del JWT (jose) con fallback a getUser.
    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }

    const ip = clientIpFromRequest(request)
    const rl = await rateLimitCoachSearch(ip)
    if (!rl.ok) return jsonRateLimited(rl.retryAfter)

    const admin = createServiceRoleClient()

    // Gate de identidad: solo un coach real puede buscar (espejo de `getCoach()` en la ruta web).
    const { data: coachRow, error: coachError } = await admin
        .from('coaches')
        .select('id')
        .eq('id', auth.userId)
        .maybeSingle()
    if (coachError) {
        return NextResponse.json(
            { error: 'No se pudo cargar el coach.', code: 'COACH_LOAD_FAILED' },
            { status: 500 },
        )
    }
    if (!coachRow) {
        return NextResponse.json({ error: 'Unauthorized', code: 'NOT_A_COACH' }, { status: 401 })
    }

    // q ausente/corto → resultados vacíos SIN golpear DB (no es error del cliente: el input dispara
    // con 0-1 chars mientras el usuario tipea). Espejo exacto de la ruta web.
    const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get('q') ?? '' })
    if (!parsed.success) {
        return NextResponse.json(emptyCoachSearchResults())
    }

    // Scope 3-vías desde el workspace preferido (enterprise / team-pool / standalone). Si no hay
    // preferencia resuelta (multi-workspace sin elegir) → standalone, igual que el fallback web.
    const workspace = await resolvePreferredWorkspace(admin, auth.userId)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const results = await searchCoachWorkspace(admin, {
        coachId: coachRow.id,
        scope: { orgId, activeTeamId },
        query: parsed.data.q,
    })

    return NextResponse.json(results)
}
