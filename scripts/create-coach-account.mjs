/**
 * One-off: create Auth user + public.coaches row (service role).
 *
 * Usage (from repo root, requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/create-coach-account.mjs --email you@x.com --password 'secret123' --full-name "Nombre" --brand "Marca" --tier pro
 *
 * Options:
 *   --tier starter|pro|elite|scale   (default: pro)
 *   --slug my-brand-slug           (optional; auto from --brand if omitted)
 *   --status active                  (default: active, with current_period_end +1y so /coach works without MP)
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

config({ path: resolve(__dirname, '../.env.local') })

const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }

function parseArgs(argv) {
    const out = {}
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--email') out.email = argv[++i]
        else if (a === '--password') out.password = argv[++i]
        else if (a === '--full-name') out.fullName = argv[++i]
        else if (a === '--brand') out.brand = argv[++i]
        else if (a === '--tier') out.tier = argv[++i]
        else if (a === '--slug') out.slug = argv[++i]
        else if (a === '--status') out.status = argv[++i]
    }
    return out
}

function slugifyBrand(brand) {
    return brand
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'coach'
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
        process.exit(1)
    }

    const args = parseArgs(process.argv)
    const email = (args.email || '').trim().toLowerCase()
    const password = args.password || ''
    const fullName = args.fullName || ''
    const brandName = args.brand || ''
    const tier = args.tier || 'pro'
    const subscriptionStatus = args.status || 'active'

    if (!email || !password || !fullName || !brandName) {
        console.error(
            'Required: --email --password --full-name --brand\nOptional: --tier pro --slug custom-slug --status active'
        )
        process.exit(1)
    }

    if (!['starter', 'pro', 'elite', 'scale'].includes(tier)) {
        console.error('Invalid --tier')
        process.exit(1)
    }

    if (password.length < 8) {
        console.error('Password must be at least 8 characters')
        process.exit(1)
    }

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: taken, error: rpcErr } = await admin.rpc('check_platform_email_availability', {
        p_email: email,
    })
    if (rpcErr) {
        console.error('RPC check_platform_email_availability:', rpcErr.message)
        process.exit(1)
    }
    if (taken?.exists_in_auth || taken?.orphan_client_email) {
        console.error('Email already in use on this project:', email)
        process.exit(1)
    }

    let baseSlug = args.slug ? slugifyBrand(args.slug) : slugifyBrand(brandName)
    let slug = baseSlug
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data: row } = await admin.from('coaches').select('id').eq('slug', slug).maybeSingle()
        if (!row) break
        if (attempt === 7) {
            console.error('Could not allocate unique slug')
            process.exit(1)
        }
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 8)}`
    }

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    })
    if (authError || !authData?.user) {
        console.error('createUser:', authError?.message || 'no user')
        process.exit(1)
    }

    const userId = authData.user.id
    const maxClients = TIER_MAX[tier] ?? 30
    const periodEnd = new Date()
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)

    const { error: insErr } = await admin.from('coaches').insert({
        id: userId,
        full_name: fullName,
        brand_name: brandName,
        slug,
        primary_color: '#10B981',
        subscription_status: subscriptionStatus,
        subscription_tier: tier,
        billing_cycle: 'monthly',
        payment_provider: process.env.PAYMENT_PROVIDER ?? 'mercadopago',
        max_clients: maxClients,
        current_period_end: subscriptionStatus === 'active' ? periodEnd.toISOString() : null,
    })

    if (insErr) {
        console.error('coaches insert:', insErr.message)
        await admin.auth.admin.deleteUser(userId)
        process.exit(1)
    }

    console.log('OK coach created')
    console.log({ email, slug, tier: tier, subscription_status: subscriptionStatus, userId })
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
