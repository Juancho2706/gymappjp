import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { assertModule } from '@/services/entitlements.service'

/**
 * Helper compartido de los endpoints mobile del modulo movement_assessment.
 *
 * Por que existe: el lib mobile (apps/mobile/lib/movement.ts) gateaba el modulo SOLO en la UI
 * (hasModule client-side) y escribia por PostgREST directo. Eso permitia evadir el cobro: un coach
 * SIN el modulo podia insertar movement_assessments/items por API directa. La web ya bloquea con
 * assertModule SERVER-SIDE (services/assessment/movement-assessment.service.ts). Estos endpoints
 * son el espejo: corren assertMovementModule ANTES de cada escritura.
 *
 * Mutacion => auth por admin.auth.getUser(token) (autoritativo, revocation-sensitive), NO jose.
 * Las escrituras usan el client TOKEN-SCOPED (userClient) para preservar RLS como 2da capa
 * (movement_assessments.coach_id = auth.uid(); las columnas tienen GRANT a authenticated).
 * assertModule solo lee enabled_modules => corre con el client token-scoped.
 *
 * Standalone coach v1 (sin team/pool): teamId siempre null, gate por { coachId: userId }.
 */

const MODULE_KEY = 'movement_assessment' as const

export function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export type MovementAuth = {
    userId: string
    userClient: SupabaseClient<Database>
}

/**
 * Resuelve la auth + el gate del modulo. Devuelve `NextResponse` (error listo para retornar)
 * o el contexto autenticado con el client token-scoped. Orden: token -> getUser -> assertModule.
 */
export async function authorizeMovement(
    request: NextRequest
): Promise<NextResponse | MovementAuth> {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = ud.user.id

    const userClient = createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        }
    )

    // Gate del modulo SERVER-SIDE (standalone v1: teamId null). Si esta OFF => 403 MODULE_OFF.
    try {
        await assertModule(userClient, MODULE_KEY, { coachId: userId, teamId: null })
    } catch {
        return NextResponse.json(
            { error: 'Modulo no habilitado: movement_assessment', code: 'MODULE_OFF' },
            { status: 403 }
        )
    }

    return { userId, userClient }
}
