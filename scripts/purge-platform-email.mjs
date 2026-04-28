/**
 * Remove platform traces of an email (service role): clients rows by email,
 * coach subtree (clients of that coach + coach row), or standalone client auth user.
 *
 * Usage (repo root, .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/purge-platform-email.mjs --email user@x.com --yes
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

function parseArgs(argv) {
    const out = {}
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--email') out.email = argv[++i]
        else if (a === '--yes') out.yes = true
    }
    return out
}

function normalizeEmail(email) {
    return email.trim().toLowerCase()
}

/**
 * Delete rows that FK-block public.clients (nutrition + workout trees).
 * Order matches common FK chains in this project.
 */
async function purgeClientDataRows(admin, clientId) {
    const { data: dlogs } = await admin.from('daily_nutrition_logs').select('id').eq('client_id', clientId)
    const dlogIds = (dlogs || []).map((r) => r.id)
    if (dlogIds.length) {
        const { error } = await admin.from('nutrition_meal_logs').delete().in('daily_log_id', dlogIds)
        if (error) console.warn('nutrition_meal_logs', error.message)
    }
    {
        const { error } = await admin.from('daily_nutrition_logs').delete().eq('client_id', clientId)
        if (error) console.warn('daily_nutrition_logs', error.message)
    }

    const { data: nplans } = await admin.from('nutrition_plans').select('id').eq('client_id', clientId)
    const npIds = (nplans || []).map((r) => r.id)
    if (npIds.length) {
        const { error } = await admin.from('nutrition_meals').delete().in('plan_id', npIds)
        if (error) console.warn('nutrition_meals', error.message)
    }
    {
        const { error } = await admin.from('nutrition_plans').delete().eq('client_id', clientId)
        if (error) console.warn('nutrition_plans', error.message)
    }

    {
        const { error } = await admin.from('workout_logs').delete().eq('client_id', clientId)
        if (error) console.warn('workout_logs', error.message)
    }
    {
        const { error } = await admin.from('workout_sessions').delete().eq('client_id', clientId)
        if (error) console.warn('workout_sessions', error.message)
    }

    const { data: wprogs } = await admin.from('workout_programs').select('id').eq('client_id', clientId)
    const progIds = (wprogs || []).map((r) => r.id)
    const { data: wplansDirect } = await admin.from('workout_plans').select('id').eq('client_id', clientId)
    const planIds = new Set((wplansDirect || []).map((r) => r.id))
    if (progIds.length) {
        const { data: wplansProg } = await admin.from('workout_plans').select('id').in('program_id', progIds)
        for (const r of wplansProg || []) planIds.add(r.id)
    }
    const pidArr = [...planIds]
    if (pidArr.length) {
        const { error } = await admin.from('workout_blocks').delete().in('plan_id', pidArr)
        if (error) console.warn('workout_blocks', error.message)
    }
    if (pidArr.length) {
        const { error } = await admin.from('workout_plans').delete().in('id', pidArr)
        if (error) console.warn('workout_plans', error.message)
    }
    {
        const { error } = await admin.from('workout_programs').delete().eq('client_id', clientId)
        if (error) console.warn('workout_programs', error.message)
    }

    {
        const { error } = await admin.from('check_ins').delete().eq('client_id', clientId)
        if (error) console.warn('check_ins', error.message)
    }
    {
        const { error } = await admin.from('client_intake').delete().eq('client_id', clientId)
        if (error) console.warn('client_intake', error.message)
    }
    {
        const { error } = await admin.from('client_payments').delete().eq('client_id', clientId)
        if (error) console.warn('client_payments', error.message)
    }
}

async function findAuthUserIdByEmail(admin, norm) {
    let page = 1
    const perPage = 1000
    for (;;) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
        if (error) throw error
        const hit = data.users.find((u) => normalizeEmail(u.email || '') === norm)
        if (hit) return hit.id
        if (data.users.length < perPage) return null
        page += 1
    }
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
        process.exit(1)
    }

    const args = parseArgs(process.argv)
    const raw = (args.email || '').trim()
    const norm = normalizeEmail(raw)
    if (!norm || !args.yes) {
        console.error('Required: --email <addr> --yes')
        process.exit(1)
    }

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    // Orphan clients rows (no auth / stale): must purge child rows first if present.
    for (const em of [...new Set([norm, raw])]) {
        const { data: orphanClients } = await admin.from('clients').select('id').eq('email', em)
        for (const row of orphanClients || []) {
            await purgeClientDataRows(admin, row.id)
            const { error } = await admin.from('clients').delete().eq('id', row.id)
            if (error) console.warn('orphan clients delete', row.id, error.message)
        }
    }

    const uid = await findAuthUserIdByEmail(admin, norm)
    if (!uid) {
        console.log('OK: no auth.users row for', norm)
        return
    }

    const { data: coachRow } = await admin.from('coaches').select('id').eq('id', uid).maybeSingle()

    if (coachRow) {
        const { data: kids, error: kidsErr } = await admin.from('clients').select('id').eq('coach_id', uid)
        if (kidsErr) {
            console.error('list coach clients:', kidsErr.message)
            process.exit(1)
        }
        for (const row of kids || []) {
            const cid = row.id
            await purgeClientDataRows(admin, cid)
            const { error: delC } = await admin.from('clients').delete().eq('id', cid)
            if (delC) console.warn('delete client row', cid, delC.message)
            const { error: delA } = await admin.auth.admin.deleteUser(cid)
            if (delA && !String(delA.message || '').toLowerCase().includes('not found')) {
                console.warn('auth delete client', cid, delA.message)
            }
        }

        const { error: delCoach } = await admin.from('coaches').delete().eq('id', uid)
        if (delCoach) {
            console.error('delete coaches row:', delCoach.message)
            process.exit(1)
        }
    } else {
        await purgeClientDataRows(admin, uid)
        const { error: delSelf } = await admin.from('clients').delete().eq('id', uid)
        if (delSelf) {
            console.error('delete clients self row:', delSelf.message)
            process.exit(1)
        }
    }

    const { error: delAuth } = await admin.auth.admin.deleteUser(uid)
    if (delAuth && !String(delAuth.message || '').toLowerCase().includes('not found')) {
        console.error('auth delete user:', delAuth.message)
        process.exit(1)
    }

    console.log('OK purged auth + public traces for', norm)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
