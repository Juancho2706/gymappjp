import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer } from '@/lib/mobile-auth'
import type { Database } from '@/lib/database.types'

/**
 * Auth del bridge móvil del inbox «Solicitudes». Propia y NO `_mutation-auth` de `clients` a
 * propósito: aquel helper resuelve además el WORKSPACE (standalone/team/enterprise) y devolvería
 * 403 por un workspace que a los leads no les aplica — `coach_leads` no tiene scope de equipo ni
 * de organización (SPEC: solo el `/join` standalone los genera y pertenecen al coach como persona).
 *
 * Dos regímenes de verificación, la misma regla que el resto de `/api/mobile` (ver el docblock de
 * `lib/mobile-auth.ts`):
 *  - LECTURA: verificación LOCAL del JWT (`jose`) con degradación a `getUser` — barata y sin red.
 *  - MUTACIÓN: `admin.auth.getUser(token)` SIEMPRE. `jose` valida la firma pero no consulta
 *    revocación en GoTrue: un coach dado de baja con un token vivo (~1 h) no puede mover leads.
 *
 * `userDb` es un cliente request-scoped con el Bearer del coach: las LECTURAS de `coach_leads`
 * pasan por su única policy (`coach_id = auth.uid()`), que es el techo real. `admin` solo se usa
 * para escribir (la tabla no tiene grants de update a propósito).
 */

export type MobileLeadsContext = {
    userId: string
    userDb: SupabaseClient<Database>
    admin: SupabaseClient<Database>
}

type Resolution = { error: NextResponse } | MobileLeadsContext

export function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

function unauthorized(code: 'MISSING_TOKEN' | 'INVALID_TOKEN'): NextResponse {
    return NextResponse.json({ error: 'Unauthorized', code }, { status: 401 })
}

function bearerScopedClient(token: string): SupabaseClient<Database> {
    return createSupabaseClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
        },
    )
}

export async function resolveMobileLeadsContext(
    request: NextRequest,
    mode: 'read' | 'mutation',
): Promise<Resolution> {
    const token = bearerToken(request)
    if (!token) return { error: unauthorized('MISSING_TOKEN') }

    const admin = createServiceRoleClient()

    let userId: string
    if (mode === 'mutation') {
        const { data, error } = await admin.auth.getUser(token)
        if (error || !data.user) return { error: unauthorized('INVALID_TOKEN') }
        userId = data.user.id
    } else {
        const auth = await verifyMobileBearer(token)
        if (!auth.ok) return { error: unauthorized('INVALID_TOKEN') }
        userId = auth.userId
    }

    return { userId, userDb: bearerScopedClient(token), admin }
}
