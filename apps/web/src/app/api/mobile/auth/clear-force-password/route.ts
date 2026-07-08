import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

/**
 * Limpieza AUTORITATIVA del flag `clients.force_password_change` del alumno autenticado
 * (Ola 0 / E1-18). Espejo mobile de lo que la web hace server-side en `changePasswordAction`.
 *
 * El mobile cambia la contraseña con `supabase.auth.updateUser` (client-side) y luego necesita
 * bajar el flag para no quedar atrapado en el gate (`change-password` → `change-password`).
 * Hacerlo por PostgREST directo desde el cliente es best-effort: `clients` tiene column-level
 * grants / scoping service-role, así que una policy puede bloquear el UPDATE en runtime (42501)
 * y dejar al alumno en loop. Aca lo bajamos con service-role sobre la PROPIA fila del usuario
 * (`id = auth.uid()`), nunca sobre otro alumno.
 *
 * Mutacion de cuenta => auth por `getUser` (autoritativo, valida revocacion), NO `jose`
 * (mismo criterio que el resto de endpoints /api/mobile que MUTAN: bodycomp, clients, etc.).
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

    // Solo la fila propia. force_password_change es un boolean interno del gate; no expone data.
    const { error } = await admin
        .from('clients')
        .update({ force_password_change: false })
        .eq('id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
}
