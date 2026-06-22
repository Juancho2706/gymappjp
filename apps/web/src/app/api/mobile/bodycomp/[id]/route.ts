import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteBodyComposition } from '@/services/bodycomp/body-composition.service'

/**
 * Endpoint mobile para SOFT-DELETE de una medicion de composicion corporal. Espejo de
 * deleteBodyCompositionAction (web). Mismo gate que el guardado: kill-switch + write-access +
 * assertModule('body_composition') antes del soft-delete (RLS = techo). El service resuelve el
 * client_id desde la fila para chequear write-access. Mutacion => auth por getUser, no jose.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = ud.user.id

    const userClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    )

    try {
        await deleteBodyComposition(userClient, userId, id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo eliminar la medición.'
        if (msg.startsWith('Modulo no habilitado')) {
            return NextResponse.json({ error: msg, code: 'MODULE_OFF' }, { status: 403 })
        }
        return NextResponse.json({ error: msg }, { status: 400 })
    }
}
