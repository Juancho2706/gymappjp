import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { toCheckinPath } from '@/lib/storage/checkin-photos'

/**
 * P2 (mobile): batch-sign check-in photos for a coach. Coaches have no storage SELECT policy,
 * so signing must go through the server with the service-role client AFTER verifying the coach
 * can read this client's check-ins (direct coach OR active org assignment).
 *
 * POST { clientId: string, refs: string[] }  // refs = stored paths OR legacy full URLs
 *  -> { urls: Record<originalRef, signedUrl|null> }
 *
 * Auth: web usa cookies (createClient). Mobile manda `Authorization: Bearer <jwt>` (no cookies);
 * en ese caso resolvemos el user con admin.getUser(token) y leemos clients/assignments con un
 * cliente token-scoped (RLS). Cambio ADITIVO: el camino cookie de la web queda intacto.
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    // Resolver identidad + cliente RLS segun el tipo de auth (cookie web vs bearer mobile).
    let userId: string | null = null
    let rls: SupabaseClient
    const token = bearerToken(request)
    if (token) {
        const admin = createServiceRoleClient()
        const { data: ud, error: uerr } = await admin.auth.getUser(token)
        if (uerr || !ud.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        userId = ud.user.id
        rls = createSupabaseClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } }
        )
    } else {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        userId = user.id
        rls = supabase
    }

    let body: { clientId?: string; refs?: string[] }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const clientId = body.clientId
    const refs = Array.isArray(body.refs) ? body.refs.filter((r): r is string => typeof r === 'string') : []
    if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

    // Authorize: the coach is the client's direct coach OR an active org member assigned to them.
    const { data: client } = await rls
        .from('clients')
        .select('id, coach_id, org_id')
        .eq('id', clientId)
        .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    let allowed = client.coach_id === userId
    if (!allowed && client.org_id) {
        const { data: assignment } = await rls
            .from('coach_client_assignments')
            .select('id')
            .eq('org_id', client.org_id)
            .eq('client_id', clientId)
            .eq('coach_id', userId)
            .is('deleted_at', null)
            .maybeSingle()
        allowed = !!assignment
    }
    if (!allowed) return NextResponse.json({ error: 'Sin acceso a este alumno' }, { status: 403 })

    const admin = createServiceRoleClient()
    const pathByRef = new Map<string, string | null>()
    const paths = new Set<string>()
    for (const ref of refs) {
        const p = toCheckinPath(ref)
        pathByRef.set(ref, p)
        if (p) paths.add(p)
    }
    const signedByPath = new Map<string, string>()
    if (paths.size) {
        const { data } = await admin.storage.from('checkins').createSignedUrls([...paths], 600)
        for (const item of data ?? []) if (item?.signedUrl && item.path) signedByPath.set(item.path, item.signedUrl)
    }
    const urls: Record<string, string | null> = {}
    for (const ref of refs) {
        const p = pathByRef.get(ref)
        urls[ref] = p ? signedByPath.get(p) ?? null : null
    }
    return NextResponse.json({ urls })
}
