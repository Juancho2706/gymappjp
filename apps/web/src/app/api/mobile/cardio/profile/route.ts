import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { CardioProfileUpdateSchema } from '@eva/schemas'
import { assertModule } from '@/services/entitlements.service'
import { saveCardioProfile } from '@/services/cardio-zones.service'

/**
 * Endpoint mobile para guardar el perfil cardio de un alumno (clients.birth_date /
 * resting_hr / max_hr_override / ref_5k_time_sec — M4). Espejo de updateCardioProfileAction
 * (apps/web/.../coach/cardio/_actions/cardio.actions.ts).
 *
 * Razón de existir: el lib mobile escribía clients.* por PostgREST directo, gateado SOLO
 * en la UI (hasModule client-side). La RLS de clients NO chequea enabled_modules, así que
 * un coach sin el módulo `cardio` podía escribir por API directa (evasión de cobro). Acá el
 * gate vive SERVER-SIDE: assertModule('cardio') antes de tocar la fila. Standalone v1 →
 * teamId null (el coach mobile aún no opera workspaces de pool).
 *
 *  - admin (service-role): solo para resolver el userId del token (getUser autoritativo).
 *  - userClient (token-scoped, RLS): el UPDATE de clients (RLS clients.coach_id = auth.uid()
 *    es la 2da capa; los GRANT de columna para `authenticated` ya existen, sin migración).
 *    El scope (alumno del coach) lo valida saveCardioProfile via getCardioClientForCoach.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = ud.user.id

    // Client token-scoped: RLS + GRANT de columna como el web user-scoped.
    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Gate de dinero SERVER-SIDE (standalone v1: teamId null → el coach decide).
    try {
        await assertModule(userClient, 'cardio', { coachId: userId, teamId: null })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Modulo no habilitado: cardio', code: 'MODULE_OFF' },
            { status: 403 }
        )
    }

    const body = await request.json().catch(() => null)
    const parsed = CardioProfileUpdateSchema.safeParse({
        clientId: body?.clientId,
        birth_date: body?.birth_date ?? null,
        resting_hr: body?.resting_hr,
        max_hr_override: body?.max_hr_override,
        ref_5k_time_sec: body?.ref_5k_time_sec,
    })
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
    }

    const { clientId, ...values } = parsed.data
    // saveCardioProfile valida el scope (alumno del coach, no-pool) antes de escribir.
    const { error } = await saveCardioProfile(
        userClient,
        clientId,
        { coachId: userId, activeTeamId: null },
        values
    )
    if (error) return NextResponse.json({ error }, { status: 400 })

    return NextResponse.json({ ok: true })
}
