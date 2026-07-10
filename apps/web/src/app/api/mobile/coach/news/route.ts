import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { findNewsReadsByCoach, findPublishedNewsItems } from '@/infrastructure/db'
import { verifyMobileBearer } from '@/lib/mobile-auth'

/**
 * Endpoint mobile del feed de Novedades del coach (espejo de la NewsBell web:
 * apps/web/src/components/coach/NewsBellButton.tsx + lib/news/queries.ts + _actions/news-actions.ts).
 *
 * Fuente de datos IDENTICA a la web: tablas `news_items` (status=published, published_at<=now)
 * y `news_reads` (lecturas por coach). El coach no tiene RLS para leer estas tablas globales, por
 * eso la lectura/escritura se hace server-side con service role (mismo criterio que /coach/dashboard).
 *
 * - GET  -> { items, unreadCount }  (verificacion LOCAL del JWT, read-only)
 * - POST -> marca todas como leidas -> { ok, unreadCount: 0 }  (mutacion: getUser directo,
 *   revocation-sensitive, igual que las otras mutaciones del bridge movil).
 */

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function GET(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    const auth = await verifyMobileBearer(token)
    if (!auth.ok) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    const coachId = auth.userId
    const admin = createServiceRoleClient()

    const nowIso = new Date().toISOString()
    let items
    let reads
    try {
        items = await findPublishedNewsItems(admin, nowIso)
        reads = await findNewsReadsByCoach(admin, coachId)
    } catch (error) {
        console.error('[mobile-news] load error:', error)
        return NextResponse.json({ error: 'No se pudieron cargar las novedades.', code: 'NEWS_LOAD_FAILED' }, { status: 500 })
    }

    const readIds = new Set(reads.map((r) => r.news_item_id))
    const unreadCount = items.filter((it) => !readIds.has(it.id)).length

    return NextResponse.json({ items, unreadCount })
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) {
        return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })
    }

    // Mutacion (inserta lecturas): getUser directo -> respeta revocacion del token.
    const admin = createServiceRoleClient()
    const { data: ud, error: uerr } = await admin.auth.getUser(token)
    if (uerr || !ud.user) {
        return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    }
    const coachId = ud.user.id

    const nowIso = new Date().toISOString()
    let items
    let reads
    try {
        items = await findPublishedNewsItems(admin, nowIso)
        reads = await findNewsReadsByCoach(admin, coachId)
    } catch (error) {
        console.error('[mobile-news] mark-read load error:', error)
        return NextResponse.json({ error: 'No se pudieron cargar las novedades.', code: 'NEWS_LOAD_FAILED' }, { status: 500 })
    }

    const readIds = new Set(reads.map((r) => r.news_item_id))
    const unreadIds = items.filter((it) => !readIds.has(it.id)).map((it) => it.id)

    if (unreadIds.length === 0) {
        return NextResponse.json({ ok: true, unreadCount: 0 })
    }

    const rows = unreadIds.map((id) => ({ coach_id: coachId, news_item_id: id }))
    const { error: insertError } = await admin
        .from('news_reads')
        .upsert(rows, { onConflict: 'coach_id,news_item_id', ignoreDuplicates: true })

    if (insertError) {
        console.error('[mobile-news] insert reads error:', insertError)
        return NextResponse.json({ error: 'No se pudo marcar como leido.', code: 'NEWS_MARK_FAILED' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, unreadCount: 0 })
}
