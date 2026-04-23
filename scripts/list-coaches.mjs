/**
 * Lista coaches (public.coaches) con email desde Auth, heurística "probable prueba"
 * y conteo de alumnos (`clients` por `coach_id`).
 *
 *   node scripts/list-coaches.mjs
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

/** @param {{ subscription_status: string, subscription_mp_id: string | null }} c */
function classify(c) {
    if (c.subscription_status === 'pending_payment') return 'Flujo registro sin pago confirmado'
    if ((c.subscription_status === 'active' || c.subscription_status === 'trialing') && !c.subscription_mp_id) {
        return 'Probable cuenta de prueba / activación manual (activo o trial sin subscription_mp_id)'
    }
    if (c.subscription_mp_id) return 'Suscripción asociada a Mercado Pago (subscription_mp_id presente)'
    if (c.subscription_status === 'canceled') return 'Cancelado (revisar current_period_end para grace)'
    return `Estado: ${c.subscription_status}`
}

const { data: coaches, error } = await admin
    .from('coaches')
    .select(
        'id, slug, full_name, brand_name, subscription_status, subscription_tier, subscription_mp_id, billing_cycle, current_period_end, created_at'
    )
    .order('created_at', { ascending: true })

if (error) {
    console.error(error.message)
    process.exit(1)
}

const rows = []
for (const c of coaches || []) {
    const coachDisplayName = [c.full_name, c.brand_name].filter(Boolean).join(' · ') || c.slug

    const { count: clientCount, error: cntErr } = await admin
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', c.id)

    if (cntErr) {
        console.error('count clients', c.slug, cntErr.message)
    }

    const { data, error: uerr } = await admin.auth.admin.getUserById(c.id)
    if (uerr) {
        rows.push({
            coach_name: coachDisplayName,
            email: '(error auth)',
            slug: c.slug,
            alumnos: clientCount ?? 0,
            tier: c.subscription_tier,
            status: c.subscription_status,
            mp_id: Boolean(c.subscription_mp_id),
            period_end: c.current_period_end,
            nota: classify(c),
            auth_error: uerr.message,
        })
        continue
    }
    rows.push({
        coach_name: coachDisplayName,
        email: data.user?.email ?? '(sin email)',
        slug: c.slug,
        alumnos: clientCount ?? 0,
        tier: c.subscription_tier,
        status: c.subscription_status,
        mp_id: Boolean(c.subscription_mp_id),
        period_end: c.current_period_end,
        nota: classify(c),
    })
}

rows.sort(
    (a, b) =>
        (b.alumnos ?? 0) - (a.alumnos ?? 0) || String(a.coach_name).localeCompare(String(b.coach_name))
)

console.log(JSON.stringify({ total: rows.length, coaches: rows }, null, 2))
