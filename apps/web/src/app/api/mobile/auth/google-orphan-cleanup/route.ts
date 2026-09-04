import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { deleteGoogleOrphanAuthUser } from '@/lib/auth/google-orphan-cleanup'

/**
 * Puerta MÓVIL de la limpieza del huérfano de Google (`lib/auth/google-orphan-cleanup.ts`).
 *
 * El binario RN canjea el idToken él mismo (`signInWithIdToken`) y nunca pasa por la web, así que
 * la puerta por cookie no lo cubre: misma regla, otra autenticación. Molde de
 * `api/mobile/auth/google-link`: Bearer + `admin.auth.getUser(token)` (autoritativo, valida
 * revocación), el userId sale del token y la respuesta no cuenta si hubo borrado.
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

    await deleteGoogleOrphanAuthUser({
        admin,
        userId: ud.user.id,
        context: 'mobile_post_google_auth',
    })

    return NextResponse.json({ ok: true })
}
