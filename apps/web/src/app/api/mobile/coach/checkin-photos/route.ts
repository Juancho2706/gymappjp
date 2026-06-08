import { NextResponse, type NextRequest } from 'next/server'
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
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    let body: { clientId?: string; refs?: string[] }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
    const clientId = body.clientId
    const refs = Array.isArray(body.refs) ? body.refs.filter((r): r is string => typeof r === 'string') : []
    if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

    // Authorize: the coach is the client's direct coach OR an active org member assigned to them.
    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id, org_id')
        .eq('id', clientId)
        .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Alumno no encontrado' }, { status: 404 })

    let allowed = client.coach_id === user.id
    if (!allowed && client.org_id) {
        const { data: assignment } = await supabase
            .from('coach_client_assignments')
            .select('id')
            .eq('org_id', client.org_id)
            .eq('client_id', clientId)
            .eq('coach_id', user.id)
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
