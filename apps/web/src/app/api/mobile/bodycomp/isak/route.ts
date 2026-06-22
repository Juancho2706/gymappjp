import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { saveBodyComposition } from '@/services/bodycomp/body-composition.service'

/**
 * Endpoint mobile para GUARDAR una medicion ISAK de composicion corporal. Espejo de
 * saveBodyCompositionAction (web). CLAVE: el cliente envia SOLO los crudos (`rawInput`) + la
 * ecuacion; los `metrics` derivados (Kerr 5C + Heath-Carter + %grasa) los calcula el SERVER
 * (`computeIsak` dentro del service) — NO se confia en ningun calculo del client.
 * Mismo gate que la web: kill-switch + Zod (IsakRawInputSchema) + write-access +
 * assertModule('body_composition') + (consentimiento si team) + insert (RLS = techo).
 * Mutacion => auth por getUser, no jose.
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

    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    try {
        // Forzamos method='isak'. El service valida `rawInput` con IsakRawInputSchema, calcula los
        // metrics server-side (computeIsak) y persiste raw_input + metrics derivados.
        const input = { ...(body as Record<string, unknown>), method: 'isak' as const }
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
