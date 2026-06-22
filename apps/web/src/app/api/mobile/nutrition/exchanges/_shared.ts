import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { assertModule, type ModuleKey } from '@/services/entitlements.service'

/**
 * Helpers compartidos de los endpoints mobile del modulo `nutrition_exchanges`
 * (Nutricion Pro / intercambios). Cierran el agujero de gating: el mobile gateaba
 * SOLO en UI (hasModule client-side) y escribia por PostgREST directo, asi que un
 * coach sin el modulo podia escribir por API (evasion de cobro). Aca el server corre
 * `assertModule` ANTES de cualquier escritura — espejo del builder web
 * (apps/web/.../coach/nutrition-plans/_actions/exchange.actions.ts → nutrition-exchanges.service).
 *
 * Patron (igual que api/mobile/team/add-coach):
 *  - service-role admin: SOLO para `auth.getUser(token)` (resolver el coach autoritativo).
 *  - userClient token-scoped (anon + Bearer): TODAS las escrituras, para que la RLS
 *    (`met_coach_all` / `npdv_coach_all` / `nutrition_meals` coach-scoped) y los triggers
 *    sigan siendo la 2da capa. Las columnas ya tienen GRANT a `authenticated` (verificado).
 *
 * standalone v1: el gating es por el coach (teamId null), igual que el resto de libs
 * coach del mobile (sin workspace team activo).
 */

export const NUTRITION_EXCHANGES_KEY: ModuleKey = 'nutrition_exchanges'

export function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export type GateOk = {
    ok: true
    coachId: string
    admin: SupabaseClient<Database>
    userClient: SupabaseClient<Database>
}
export type GateErr = { ok: false; response: NextResponse }

/**
 * 401 si falta/invalido el token; 403 `MODULE_OFF` si el modulo no esta habilitado
 * para el coach (standalone v1, teamId null). Devuelve los dos clientes listos.
 */
export async function gateExchanges(request: NextRequest): Promise<GateOk | GateErr> {
    const token = bearerToken(request)
    if (!token) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }) }
    }

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) {
        return { ok: false, response: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }) }
    }
    const coachId = ud.user.id

    const userClient = createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    try {
        // standalone v1: teamId null => decide coaches.enabled_modules del coach.
        await assertModule(admin, NUTRITION_EXCHANGES_KEY, { coachId, teamId: null })
    } catch {
        return {
            ok: false,
            response: NextResponse.json(
                { error: 'Modulo no habilitado: nutrition_exchanges', code: 'MODULE_OFF' },
                { status: 403 }
            ),
        }
    }

    return { ok: true, coachId, admin, userClient }
}
