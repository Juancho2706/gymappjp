import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'

// M-F3: cambio de slug (URL de la app del alumno) desde RN mobile.
// Misma lógica que la server action web: formato + uniqueness + lock 30 días + previous_slugs.

const SLUG_RE = /^[a-z0-9-]{3,50}$/
const RESERVED = new Set(['admin', 'api', 'app', 'coach', 'login', 'org', 'enterprise', 'c', 'www'])

function bearerToken(request: NextRequest): string | null {
    const auth = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice('Bearer '.length).trim() || null
}

export async function POST(request: NextRequest) {
    const token = bearerToken(request)
    if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

    const admin = createServiceRoleClient()
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData.user) return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
    const userId = userData.user.id

    const workspace = await resolvePreferredWorkspace(admin, userId)
    if (!workspace || (workspace.type !== 'coach_standalone' && workspace.type !== 'enterprise_coach')) {
        return NextResponse.json({ error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' }, { status: 403 })
    }

    let body: { slug?: string }
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Body inválido.' }, { status: 400 }) }
    const slug = String(body.slug ?? '').trim().toLowerCase()

    if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'La URL debe tener 3–50 caracteres (a-z, 0-9, guiones).' }, { status: 400 })
    if (RESERVED.has(slug)) return NextResponse.json({ error: 'Esa URL está reservada, elegí otra.' }, { status: 400 })

    const { data: current } = await admin
        .from('coaches')
        .select('slug, slug_changed_at, previous_slugs')
        .eq('id', userId)
        .single()

    if (current?.slug === slug) return NextResponse.json({ ok: true, slug })

    const { data: existing } = await admin
        .from('coaches')
        .select('id')
        .eq('slug', slug)
        .neq('id', userId)
        .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Esta URL ya está en uso por otro coach.' }, { status: 409 })

    const lastChange = current?.slug_changed_at ? new Date(current.slug_changed_at) : null
    if (lastChange) {
        const days = Math.floor((Date.now() - lastChange.getTime()) / 86400000)
        if (days < 30) {
            const remaining = 30 - days
            return NextResponse.json({ error: `Solo podés cambiar tu URL cada 30 días. Faltan ${remaining} día${remaining !== 1 ? 's' : ''}.` }, { status: 429 })
        }
    }

    const previousSlugs: string[] = Array.isArray(current?.previous_slugs) ? [...current!.previous_slugs] : []
    if (current?.slug && !previousSlugs.includes(current.slug)) {
        previousSlugs.push(current.slug)
        if (previousSlugs.length > 10) previousSlugs.shift()
    }

    const { error: updErr } = await admin
        .from('coaches')
        .update({ slug, slug_changed_at: new Date().toISOString(), previous_slugs: previousSlugs, updated_at: new Date().toISOString() })
        .eq('id', userId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, slug })
}
