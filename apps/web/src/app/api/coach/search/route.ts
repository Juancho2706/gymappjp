import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { clientIpFromRequest, jsonRateLimited, rateLimitCoachSearch } from '@/lib/rate-limit'
import { getCoach } from '@/lib/coach/get-coach'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
    emptyCoachSearchResults,
    MIN_QUERY_LENGTH,
    searchCoachWorkspace,
} from '@/services/search/coach-search.service'

/**
 * GET /api/coach/search?q=… — búsqueda global del topbar coach.
 *
 * Molde de `api/recipes/search/route.ts`: rate-limit por IP + Zod. La IDENTIDAD y el SCOPE se
 * derivan SIEMPRE server-side de la sesión (`getCoach` + `getPreferredWorkspaceForRender`) — nunca
 * del query string (regla CLAUDE.md: el scope sale de `auth.uid()`/JWT). Un coach jamás puede
 * inyectar `coachId/orgId/teamId` por la URL.
 *
 * Se expone como route handler (no server action) a propósito: la búsqueda incremental con
 * debounce + AbortController encaja natural con `fetch(signal)` y evita el bug de Next con
 * navegación durante una action con debounce (vercel/next.js#76936).
 */

export const dynamic = 'force-dynamic'

const querySchema = z.object({
    q: z.string().trim().min(MIN_QUERY_LENGTH).max(100),
})

export async function GET(request: NextRequest) {
    const ip = clientIpFromRequest(request)
    const rl = await rateLimitCoachSearch(ip)
    if (!rl.ok) return jsonRateLimited(rl.retryAfter)

    const coach = await getCoach()
    if (!coach) {
        return NextResponse.json(emptyCoachSearchResults(), { status: 401 })
    }

    // q ausente/corto → resultados vacíos SIN golpear DB (no es un error del cliente: el input
    // dispara con 0-1 chars mientras el usuario tipea).
    const parsed = querySchema.safeParse({ q: request.nextUrl.searchParams.get('q') ?? '' })
    if (!parsed.success) {
        return NextResponse.json(emptyCoachSearchResults())
    }

    const workspace = await getPreferredWorkspaceForRender(coach.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const supabase = await createClient()
    const results = await searchCoachWorkspace(supabase, {
        coachId: coach.id,
        scope: { orgId, activeTeamId },
        query: parsed.data.q,
    })

    return NextResponse.json(results)
}
