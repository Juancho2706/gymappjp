import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { saveBodyComposition } from '@/services/bodycomp/body-composition.service'

/**
 * Endpoint mobile para GUARDAR una medicion BIA de composicion corporal. Espejo de
 * saveBodyCompositionAction (apps/web/.../coach/clients/[clientId]/bodycomp/_actions). El mobile NO
 * debe escribir por PostgREST directo: el gate del modulo (`body_composition`) hoy solo vive en la
 * UI mobile (hasModule client-side), asi que un coach SIN el modulo podria insertar por API directa
 * (evasion de cobro). Aca corre el MISMO gate server-side que la web:
 *   - admin (service-role): resolver el userId del bearer.
 *   - userClient (token-scoped, RLS): el service ejecuta kill-switch + Zod + write-access +
 *     assertModule('body_composition') + (consentimiento si team) + insert (RLS = techo).
 * Mutacion => auth por getUser (autoritativo), no jose.
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

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    // Client token-scoped: RLS + triggers como el web user-scoped. El service valida con
    // BodyCompositionCreateSchema (defensa en profundidad) y corre assertModule antes de persistir.
    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    try {
        // Forzamos method='bia' (el endpoint /isak es el unico que acepta ISAK) — el resto del shape
        // (clientId, metrics, deviceBrand/Model, weightKg/heightCm, notes) lo valida el schema.
        const input = { ...(body as Record<string, unknown>), method: 'bia' as const }
        const { row } = await saveBodyComposition(userClient, userId, input)
        return NextResponse.json({ ok: true, measurementId: row.id })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo guardar la medición.'
        if (msg.startsWith('Modulo no habilitado')) {
            return NextResponse.json({ error: msg, code: 'MODULE_OFF' }, { status: 403 })
        }
        return NextResponse.json({ error: msg }, { status: 400 })
    }
}
