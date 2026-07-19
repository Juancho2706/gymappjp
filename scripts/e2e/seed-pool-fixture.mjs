/**
 * Fixture E2E "pool" PROPIO — reemplaza el workspace del CEO (Jose Fit / josefit) como
 * POOL_COACH multi-contexto de los 5 specs residuales:
 *   tests/separation/switcher.spec.ts       (flip standalone <-> team)
 *   tests/separation/auth.setup.ts          (login del pool coach multi-contexto)
 *   tests/team/team-flows.spec.ts           (alumno /t + coach contextos separados)
 *   tests/team/bodycomp-flow.spec.ts        (composicion corporal del coach)
 *   tests/e2e/movement-assessment.spec.ts   (screening kine -> alumno)
 *
 * QUE SIEMBRA (todo @evatest.cl, ids v4 FIJOS y RFC-VALIDOS):
 *   - e2e-pool-owner  : coach STANDALONE (status 'active') que ADEMAS es owner de un team
 *                       => 2 workspaces (standalone + team) => el WorkspaceSwitcher se muestra
 *                       y el flip standalone<->team es real (specs switcher/team-flows).
 *   - e2e-pool-member : coach MIEMBRO del team (team_managed, can_manage=false) => single-contexto.
 *   - team "E2E Movida (test)" (slug e2e-pool-movida) con los 4 modulos ON. Nota: un team es un
 *     pool pago por diseno, asi que entitlements.service ya fuerza los 4 modulos ON en contexto
 *     team (getTeamEnabledModules UNION ALL_MODULES_ON); el enabled_modules explicito es cosmetico.
 *   - 2 alumnos de pool (clients.team_id = team, org_id NULL, coach = owner) con consent de pool
 *     y de datos de salud YA otorgado => sin consent-gate en /t, y bodycomp (needs health consent) OK.
 *       · e2e-pool-uno  (E2E Alumno Uno)  -> default de E2E_POOL_ALUMNO_* y E2E_BODYCOMP_CLIENT_ID
 *       · e2e-pool-dos  (E2E Alumno Dos)
 *
 * GOTCHA DE IDS (memoria del repo "UUIDs seed no-RFC -> z.guid()"): los ids FIJOS deben ser
 * v4 RFC-VALIDOS — nibble de version = '4' (pos 13) y de variante ∈ {8,9,a,b} (pos 17). Zod 4
 * (z.uuid) rechaza cualquier otra cosa y rompe el Today con porciones. Todos los IDS de abajo
 * cumplen ...-4000-8000-... El id se aplica al auth user via admin.createUser({ id }) (soportado
 * por auth-js: AdminUserAttributes.id), de modo que coaches.id / clients.id (FK a auth.users)
 * quedan deterministas.
 *
 * SEGURIDAD:
 *   - DRY-RUN por DEFAULT: sin flags no muta nada, solo imprime el plan.
 *   - APLICAR (up): flag --apply  +  env E2E_SEED_CONFIRM=yes
 *   - REVERTIR (down): flag --down +  env E2E_SEED_CONFIRM=yes  (borra por los MISMOS ids/emails)
 *   - Password: mismo patron que los seeds e2e existentes => env E2E_PERSONAS_PASSWORD.
 *   - IDEMPOTENTE: upserts por id determinista; reruns reusan filas y sincronizan password
 *     (cuentas @evatest.cl exclusivas de E2E).
 *
 * Uso (PowerShell):
 *   node scripts/e2e/seed-pool-fixture.mjs                          # dry-run del UP
 *   $env:E2E_SEED_CONFIRM='yes'; $env:E2E_PERSONAS_PASSWORD='<pwd>'; node scripts/e2e/seed-pool-fixture.mjs --apply
 *   $env:E2E_SEED_CONFIRM='yes'; node scripts/e2e/seed-pool-fixture.mjs --down
 * Uso (bash):
 *   node scripts/e2e/seed-pool-fixture.mjs
 *   E2E_SEED_CONFIRM=yes E2E_PERSONAS_PASSWORD='<pwd>' node scripts/e2e/seed-pool-fixture.mjs --apply
 *   E2E_SEED_CONFIRM=yes node scripts/e2e/seed-pool-fixture.mjs --down
 *
 * Shapes verificados contra scripts/seed-e2e-personas.mjs (mismo esquema, mismas tablas).
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// apps/web/.env.local primero, root .env.local como fallback (este script vive en scripts/e2e/).
config({ path: resolve(__dirname, '../../apps/web/.env.local') })
config({ path: resolve(__dirname, '../../.env.local'), override: false })

// ---------------------------------------------------------------------------
// Constantes del fixture (ids v4 FIJOS y RFC-VALIDOS: ...-4000-8000-...)
// ---------------------------------------------------------------------------

const IDS = {
    ownerCoach: 'e2e0a001-0000-4000-8000-000000000001',
    memberCoach: 'e2e0a002-0000-4000-8000-000000000002',
    team: 'e2e0a003-0000-4000-8000-000000000003',
    alumnoUno: 'e2e0a004-0000-4000-8000-000000000004',
    alumnoDos: 'e2e0a005-0000-4000-8000-000000000005',
}

const EMAILS = {
    ownerCoach: 'e2e-pool-owner@evatest.cl',
    memberCoach: 'e2e-pool-member@evatest.cl',
    alumnoUno: 'e2e-pool-uno@evatest.cl',
    alumnoDos: 'e2e-pool-dos@evatest.cl',
}

const OWNER_BRAND = { name: 'E2E Pool Owner', slug: 'e2e-pool-owner', color: '#0EA5E9' }
const TEAM = { name: 'E2E Movida (test)', slug: 'e2e-pool-movida', color: '#EC4899' }

// Cosmetico: en contexto team entitlements.service fuerza los 4 modulos ON de todas formas.
const ALL_MODULES_ON = {
    cardio: true,
    movement_assessment: true,
    body_composition: true,
    nutrition_exchanges: true,
}

const STUDENTS = [
    { id: IDS.alumnoUno, email: EMAILS.alumnoUno, fullName: 'E2E Alumno Uno' },
    { id: IDS.alumnoDos, email: EMAILS.alumnoDos, fullName: 'E2E Alumno Dos' },
]

const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }
const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const counts = {}
function track(table, action, n = 1) {
    if (!counts[table]) counts[table] = { inserted: 0, existing: 0, deleted: 0, planned: 0 }
    counts[table][action] += n
}

function must(res, label) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`)
    return res.data
}

function dateOnly(daysAgo) {
    return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

/** v4 RFC: 8-4-4-4-12 hex, version '4' en pos 13, variante 8/9/a/b en pos 17. */
function isRfcV4(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

async function findUserByEmail(admin, email) {
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
        if (found) return found
        if (data.users.length < 1000) return null
    }
    return null
}

/**
 * ensureUser con id DETERMINISTA. Si el auth user ya existe (por email) se reusa su id (que en un
 * fixture limpio ES el determinista) y se sincroniza el password. Si no existe, se crea con el id fijo.
 */
async function ensureUser(admin, { id, email, fullName, password, write }) {
    const existing = await findUserByEmail(admin, email)
    if (existing) {
        if (write && email.endsWith('@evatest.cl')) {
            const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
            if (error) throw new Error(`updateUserById(${email}): ${error.message}`)
        }
        track('auth.users', 'existing')
        return existing
    }
    if (!write) {
        track('auth.users', 'planned')
        return { id, email }
    }
    const { data, error } = await admin.auth.admin.createUser({
        id,
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, e2e_seed: 'pool-fixture' },
    })
    if (error) throw new Error(`createUser(${email}): ${error.message}`)
    track('auth.users', 'inserted')
    return data.user
}

async function pickInviteCode(admin, preferred, ownerId) {
    // El fixed code casi nunca colisiona; si otra fila (id != owner) ya lo tiene, cae a random.
    const row = must(
        await admin.from('coaches').select('id').eq('invite_code', preferred).maybeSingle(),
        'coaches invite_code check'
    )
    if (!row || row.id === ownerId) return preferred
    for (let attempt = 0; attempt < 25; attempt++) {
        let code = ''
        for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
        const clash = must(
            await admin.from('coaches').select('id').eq('invite_code', code).maybeSingle(),
            'coaches invite_code uniqueness'
        )
        if (!clash) return code
    }
    throw new Error('No se pudo generar invite_code unico')
}

async function ensureCoach(admin, { id, fullName, brandName, slug, color, status, tier, inviteCode, periodEnd, write }) {
    const existing = must(
        await admin.from('coaches').select('id, slug, invite_code').eq('id', id).maybeSingle(),
        `coaches select (${slug})`
    )
    if (existing) {
        track('coaches', 'existing')
        return existing
    }
    if (!write) {
        track('coaches', 'planned')
        return { id, slug, invite_code: inviteCode }
    }
    const invite_code = await pickInviteCode(admin, inviteCode, id)
    must(
        await admin.from('coaches').insert({
            id,
            full_name: fullName,
            brand_name: brandName,
            slug,
            invite_code,
            primary_color: color,
            subscription_status: status,
            subscription_tier: tier,
            billing_cycle: 'monthly',
            payment_provider: 'admin',
            max_clients: TIER_MAX[tier] ?? 30,
            use_brand_colors_coach: true,
            active_org_id: null,
            current_period_end: periodEnd,
            enabled_modules: {},
        }),
        `coaches insert (${slug})`
    )
    track('coaches', 'inserted')
    return { id, slug, invite_code }
}

async function ensureTeam(admin, ownerCoachId, write) {
    const existing = must(
        await admin.from('teams').select('id, slug').eq('id', IDS.team).maybeSingle(),
        'teams select'
    )
    if (existing) {
        track('teams', 'existing')
        return existing
    }
    if (!write) {
        track('teams', 'planned')
        return { id: IDS.team, slug: TEAM.slug }
    }
    const row = must(
        await admin
            .from('teams')
            .insert({
                id: IDS.team,
                name: TEAM.name,
                slug: TEAM.slug,
                owner_coach_id: ownerCoachId,
                primary_color: TEAM.color,
                seat_limit: 10,
                enabled_modules: ALL_MODULES_ON,
            })
            .select('id, slug')
            .single(),
        'teams insert'
    )
    track('teams', 'inserted')
    return row
}

async function ensureTeamMember(admin, { coachId, canManage, displayRole, write }) {
    const existing = must(
        await admin.from('team_members').select('id').eq('team_id', IDS.team).eq('coach_id', coachId).limit(1),
        `team_members select (${displayRole})`
    )
    if (existing.length > 0) {
        track('team_members', 'existing')
        return
    }
    if (!write) {
        track('team_members', 'planned')
        return
    }
    must(
        await admin.from('team_members').insert({
            team_id: IDS.team,
            coach_id: coachId,
            can_manage: canManage,
            display_role: displayRole,
            status: 'active',
        }),
        `team_members insert (${displayRole})`
    )
    track('team_members', 'inserted')
}

async function ensureClient(admin, { id, email, fullName, coachId, write }) {
    const existing = must(
        await admin.from('clients').select('id').eq('id', id).maybeSingle(),
        `clients select (${email})`
    )
    if (existing) {
        track('clients', 'existing')
        return existing
    }
    if (!write) {
        track('clients', 'planned')
        return { id }
    }
    must(
        await admin.from('clients').insert({
            id,
            email,
            full_name: fullName,
            coach_id: coachId,
            org_id: null,
            team_id: IDS.team,
            is_active: true,
            onboarding_completed: true,
            force_password_change: false,
            subscription_start_date: dateOnly(45),
            use_coach_brand_colors: true,
        }),
        `clients insert (${email})`
    )
    track('clients', 'inserted')
    return { id }
}

async function ensureClientAccount(admin, id, write) {
    const existing = must(
        await admin.from('client_accounts').select('id').eq('id', id).maybeSingle(),
        'client_accounts select'
    )
    if (existing) {
        track('client_accounts', 'existing')
        return
    }
    if (!write) {
        track('client_accounts', 'planned')
        return
    }
    must(await admin.from('client_accounts').insert({ id }), 'client_accounts insert')
    track('client_accounts', 'inserted')
}

async function ensureMembership(admin, { accountId, clientId, coachId, write }) {
    const existing = must(
        await admin
            .from('client_memberships')
            .select('id')
            .eq('account_id', accountId)
            .eq('team_id', IDS.team)
            .is('deleted_at', null)
            .limit(1),
        'client_memberships select (team)'
    )
    if (existing.length > 0) {
        track('client_memberships', 'existing')
        return
    }
    if (!write) {
        track('client_memberships', 'planned')
        return
    }
    must(
        await admin.from('client_memberships').insert({
            account_id: accountId,
            client_id: clientId,
            scope: 'team',
            coach_id: coachId,
            org_id: null,
            team_id: IDS.team,
            status: 'active',
        }),
        'client_memberships insert (team)'
    )
    track('client_memberships', 'inserted')
}

async function ensureConsent(admin, { clientId, purpose, write }) {
    const existing = must(
        await admin
            .from('client_consents')
            .select('id')
            .eq('client_id', clientId)
            .eq('purpose', purpose)
            .is('revoked_at', null)
            .limit(1),
        `client_consents select (${purpose})`
    )
    if (existing.length > 0) {
        track('client_consents', 'existing')
        return
    }
    if (!write) {
        track('client_consents', 'planned')
        return
    }
    must(
        await admin.from('client_consents').insert({
            client_id: clientId,
            account_id: clientId,
            team_id: IDS.team,
            purpose,
            consent_text_version: 'v1',
            granted_via: 'team_onboarding',
            granted_at: new Date().toISOString(),
        }),
        `client_consents insert (${purpose})`
    )
    track('client_consents', 'inserted')
}

// ---------------------------------------------------------------------------
// UP
// ---------------------------------------------------------------------------

async function up(admin, password, write) {
    const periodEnd = new Date()
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    const periodEndIso = periodEnd.toISOString()

    console.log('== Owner coach (standalone activo + owner del team) ==')
    const ownerUser = await ensureUser(admin, {
        id: IDS.ownerCoach,
        email: EMAILS.ownerCoach,
        fullName: 'E2E Pool Owner',
        password,
        write,
    })
    await ensureCoach(admin, {
        id: ownerUser.id,
        fullName: 'E2E Pool Owner',
        brandName: OWNER_BRAND.name,
        slug: OWNER_BRAND.slug,
        color: OWNER_BRAND.color,
        status: 'active', // standalone real => genera el workspace coach_standalone
        tier: 'elite',
        inviteCode: 'E2EPOOLO',
        periodEnd: periodEndIso,
        write,
    })

    const team = await ensureTeam(admin, ownerUser.id, write)
    await ensureTeamMember(admin, { coachId: ownerUser.id, canManage: true, displayRole: 'Owner', write })

    console.log('== Member coach (team_managed, single-contexto) ==')
    const memberUser = await ensureUser(admin, {
        id: IDS.memberCoach,
        email: EMAILS.memberCoach,
        fullName: 'E2E Pool Member',
        password,
        write,
    })
    await ensureCoach(admin, {
        id: memberUser.id,
        fullName: 'E2E Pool Member',
        brandName: TEAM.name,
        slug: 'e2e-pool-member',
        color: TEAM.color,
        status: 'team_managed', // sin standalone: single-contexto
        tier: 'elite',
        inviteCode: 'E2EPOOLM',
        periodEnd: null,
        write,
    })
    await ensureTeamMember(admin, { coachId: memberUser.id, canManage: false, displayRole: 'Kinesiología', write })

    console.log('== Alumnos de pool (consent pool + salud otorgado) ==')
    for (const s of STUDENTS) {
        const su = await ensureUser(admin, { id: s.id, email: s.email, fullName: s.fullName, password, write })
        await ensureClient(admin, { id: su.id, email: s.email, fullName: s.fullName, coachId: ownerUser.id, write })
        await ensureClientAccount(admin, su.id, write)
        await ensureMembership(admin, { accountId: su.id, clientId: su.id, coachId: ownerUser.id, write })
        await ensureConsent(admin, { clientId: su.id, purpose: 'pool_multidisciplinary_access', write })
        await ensureConsent(admin, { clientId: su.id, purpose: 'health_data_processing', write })
    }

    return { ownerId: ownerUser.id, memberId: memberUser.id, teamId: team.id }
}

// ---------------------------------------------------------------------------
// DOWN — borra por los MISMOS ids/emails del fixture (nunca toca nada mas)
// ---------------------------------------------------------------------------

async function delById(admin, table, col, value, write) {
    if (!write) {
        track(table, 'planned')
        return
    }
    const data = must(await admin.from(table).delete().eq(col, value).select('id'), `delete ${table}`)
    track(table, 'deleted', (data ?? []).length)
}

async function down(admin, write) {
    const studentIds = STUDENTS.map((s) => s.id)
    const coachIds = [IDS.ownerCoach, IDS.memberCoach]

    // Hijos de alumnos primero (consents, memberships, accounts, clients).
    for (const cid of studentIds) {
        await delById(admin, 'client_consents', 'client_id', cid, write)
        await delById(admin, 'client_memberships', 'client_id', cid, write)
        await delById(admin, 'clients', 'id', cid, write)
        await delById(admin, 'client_accounts', 'id', cid, write)
    }

    // team_members + team.
    for (const cid of coachIds) {
        await delById(admin, 'team_members', 'coach_id', cid, write)
    }
    await delById(admin, 'teams', 'id', IDS.team, write)

    // coaches.
    for (const cid of coachIds) {
        await delById(admin, 'coaches', 'id', cid, write)
    }

    // auth users (owner + member + alumnos) — solo por los ids/emails del fixture.
    const allEmails = [EMAILS.ownerCoach, EMAILS.memberCoach, ...STUDENTS.map((s) => s.email)]
    for (const email of allEmails) {
        const u = await findUserByEmail(admin, email)
        if (!u) continue
        if (!write) {
            track('auth.users', 'planned')
            continue
        }
        try {
            await admin.auth.admin.deleteUser(u.id)
            track('auth.users', 'deleted')
        } catch {
            /* best-effort */
        }
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const argv = process.argv.slice(2)
    const isDown = argv.includes('--down')
    const apply = argv.includes('--apply')
    const confirmed = process.env.E2E_SEED_CONFIRM === 'yes'
    const write = confirmed && (isDown || apply)

    // Sanity: todos los ids del fixture DEBEN ser v4 RFC-validos (gotcha z.guid()).
    for (const [k, v] of Object.entries(IDS)) {
        if (!isRfcV4(v)) throw new Error(`ID no-RFC-v4 en IDS.${k}: ${v}`)
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    const password = process.env.E2E_PERSONAS_PASSWORD

    if (!url || !key) {
        console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local)')
        process.exit(1)
    }
    if (!isDown && write && (!password || password.length < 8)) {
        console.error('Para --apply se requiere E2E_PERSONAS_PASSWORD (>=8 chars) en el env.')
        process.exit(1)
    }

    const mode = isDown ? 'down' : 'up'
    console.log(`Fixture E2E pool — modo: ${mode} — ${write ? 'APLICAR (escritura real)' : 'DRY-RUN (sin cambios)'}`)
    console.log(`Target Supabase: ${url}`)
    if (write) {
        console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
        await new Promise((r) => setTimeout(r, 3000))
    } else if (isDown || apply) {
        console.log('NOTA: falta E2E_SEED_CONFIRM=yes -> corriendo como DRY-RUN (nada se escribe).')
    }

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    let result = null
    if (isDown) await down(admin, write)
    else result = await up(admin, password ?? '', write)

    console.log('\n=== RESUMEN FIXTURE POOL ===')
    console.log(
        JSON.stringify(
            {
                mode,
                write,
                target: url,
                ids: IDS,
                emails: EMAILS,
                team: { ...TEAM, id: IDS.team },
                ownerBrand: OWNER_BRAND,
                result,
                counts,
            },
            null,
            2
        )
    )
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
