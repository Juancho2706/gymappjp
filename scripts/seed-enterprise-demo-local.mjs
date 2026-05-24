/**
 * Seed local Supabase with a realistic EVA Enterprise demo workspace.
 *
 * Usage:
 *   npm run seed:enterprise-demo:local
 *
 * Safety:
 * - Opt-in only. Never runs in app startup, CI, or migrations.
 * - Intended for local Supabase. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * - Idempotent by deterministic emails/slugs and org email uniqueness.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

config({ path: resolve(__dirname, '../.env.development.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

const DEMO_PASSWORD = 'EvaDemo2026!'
const ORG_SLUG = 'eva-demo-performance-club'
const ORG_NAME = 'Performance Club Demo'
const ORG_COLOR = '#F43F5E'

const people = {
    owner: { email: 'owner.enterprise.demo@eva.local', name: 'Camila Rojas' },
    admin: { email: 'ops.enterprise.demo@eva.local', name: 'Diego Fuentes' },
    coaches: [
        { email: 'coach.fuerza.demo@eva.local', name: 'Valentina Soto', slug: 'demo-valentina-fuerza', inviteCode: 'EVAF2' },
        { email: 'coach.hipertrofia.demo@eva.local', name: 'Matias Araya', slug: 'demo-matias-hipertrofia', inviteCode: 'EVAH3' },
        { email: 'coach.rehab.demo@eva.local', name: 'Francisca Torres', slug: 'demo-francisca-rehab', inviteCode: 'EVAR4' },
    ],
}

const clients = [
    ['Antonia Perez', 'antonia.demo@eva.local', '+56911111111', 0],
    ['Benjamin Silva', 'benjamin.demo@eva.local', '+56922222222', 0],
    ['Catalina Munoz', 'catalina.demo@eva.local', '+56933333333', 1],
    ['Domingo Herrera', 'domingo.demo@eva.local', '+56944444444', 1],
    ['Emilia Castillo', 'emilia.demo@eva.local', '+56955555555', 1],
    ['Felipe Navarro', 'felipe.demo@eva.local', '+56966666666', 2],
    ['Josefa Morales', 'josefa.demo@eva.local', '+56977777777', 2],
    ['Lucas Vega', 'lucas.demo@eva.local', '+56988888888', null],
]

function isLocalSupabaseUrl(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)
}

async function findUserByEmail(admin, email) {
    for (let page = 1; page <= 10; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
        if (found) return found
        if (data.users.length < 1000) return null
    }
    return null
}

async function ensureUser(admin, person) {
    const existing = await findUserByEmail(admin, person.email)
    if (existing) return existing

    const { data, error } = await admin.auth.admin.createUser({
        email: person.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: person.name, demo_seed: ORG_SLUG },
    })
    if (error) throw error
    return data.user
}

async function upsertCoach(admin, user, coach, orgId) {
    const { error } = await admin.from('coaches').upsert({
        id: user.id,
        full_name: coach.name,
        brand_name: ORG_NAME,
        slug: coach.slug,
        invite_code: coach.inviteCode,
        primary_color: ORG_COLOR,
        active_org_id: orgId,
        subscription_status: 'org_managed',
        subscription_tier: 'scale',
        billing_cycle: 'monthly',
        payment_provider: 'enterprise',
        max_clients: 500,
        use_brand_colors_coach: true,
        use_custom_loader: true,
        loader_text: 'EVA Demo',
        loader_text_color: ORG_COLOR,
        loader_icon_mode: 'coach',
        welcome_message: 'Bienvenido a tu entrenamiento personalizado.',
        onboarding_guide: { demo_seed: ORG_SLUG },
    }, { onConflict: 'id' })
    if (error) throw error
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local/.env.development.local')
    }
    if (!isLocalSupabaseUrl(url)) {
        throw new Error('Refusing to seed non-local Supabase URL. Use .env.development.local with localhost/127.0.0.1.')
    }

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    const owner = await ensureUser(admin, people.owner)
    const orgPayload = {
        slug: ORG_SLUG,
        name: ORG_NAME,
        owner_user_id: owner.id,
        primary_color: ORG_COLOR,
        plan: 'enterprise',
        status: 'active',
        seats_included: 12,
        client_limit: 250,
        billing_cycle: 'monthly',
        currency: 'CLP',
        onboarding_step: 4,
        last_health_score: 84,
    }

    const { data: org, error: orgError } = await admin
        .from('organizations')
        .upsert(orgPayload, { onConflict: 'slug' })
        .select('id, slug')
        .single()
    if (orgError) throw orgError

    const adminUser = await ensureUser(admin, people.admin)
    const coachUsers = []
    for (const coach of people.coaches) {
        const user = await ensureUser(admin, coach)
        await upsertCoach(admin, user, coach, org.id)
        coachUsers.push({ ...coach, user })
    }

    const memberRows = [
        { user_id: owner.id, coach_id: null, role: 'org_owner' },
        { user_id: adminUser.id, coach_id: null, role: 'org_admin' },
        ...coachUsers.map(({ user }) => ({ user_id: user.id, coach_id: user.id, role: 'coach' })),
    ].map((member) => ({
        org_id: org.id,
        ...member,
        status: 'active',
        joined_at: new Date().toISOString(),
    }))

    for (const member of memberRows) {
        const { data: existingMember, error: findMemberError } = await admin
            .from('organization_members')
            .select('id')
            .eq('org_id', org.id)
            .eq('user_id', member.user_id)
            .is('deleted_at', null)
            .maybeSingle()
        if (findMemberError) throw findMemberError

        if (existingMember) {
            const { error } = await admin
                .from('organization_members')
                .update(member)
                .eq('id', existingMember.id)
            if (error) throw error
        } else {
            const { error } = await admin.from('organization_members').insert(member)
            if (error) throw error
        }
    }

    const clientRows = []
    for (const [fullName, email, phone, coachIndex] of clients) {
        const user = await ensureUser(admin, { email, name: fullName })
        const coach = typeof coachIndex === 'number' ? coachUsers[coachIndex] : coachUsers[0]
        clientRows.push({
            id: user.id,
            full_name: fullName,
            email,
            phone,
            coach_id: coach.user.id,
            org_id: org.id,
            is_active: coachIndex !== null,
            onboarding_completed: coachIndex !== null,
            force_password_change: true,
            subscription_start_date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
            use_coach_brand_colors: true,
        })
    }

    const { data: upsertedClients, error: clientError } = await admin
        .from('clients')
        .upsert(clientRows, { onConflict: 'org_id,email', ignoreDuplicates: false })
        .select('id, email, coach_id')
    if (clientError) throw clientError

    const assignments = upsertedClients
        .filter((client) => client.email !== 'lucas.demo@eva.local')
        .map((client) => ({
            org_id: org.id,
            client_id: client.id,
            coach_id: client.coach_id,
            assigned_by: owner.id,
        }))
    const { error: assignmentError } = await admin
        .from('coach_client_assignments')
        .upsert(assignments, { onConflict: 'org_id,client_id' })
    if (assignmentError) throw assignmentError

    const invoicePeriods = [
        ['2026-05-01', '2026-05-31', 'pending', null, 'Pendiente transferencia mayo'],
        ['2026-04-01', '2026-04-30', 'paid', new Date('2026-04-05T14:30:00Z').toISOString(), 'Pagado por transferencia'],
        ['2026-03-01', '2026-03-31', 'overdue', null, 'Demo: pago atrasado para tablero'],
    ]

    const { data: existingInvoices } = await admin
        .from('org_invoices')
        .select('period_start')
        .eq('org_id', org.id)
    const existingPeriods = new Set((existingInvoices ?? []).map((invoice) => invoice.period_start))
    const invoicesToInsert = invoicePeriods
        .filter(([periodStart]) => !existingPeriods.has(periodStart))
        .map(([period_start, period_end, status, paid_at, notes]) => ({
            org_id: org.id,
            amount_clp: 189000,
            expected_amount_clp: 189000,
            period_start,
            period_end,
            status,
            paid_at,
            payment_ref: status === 'paid' ? 'DEMO-TRANSFER-0426' : null,
            notes,
        }))
    if (invoicesToInsert.length > 0) {
        const { error: invoiceError } = await admin.from('org_invoices').insert(invoicesToInsert)
        if (invoiceError) throw invoiceError
    }

    const { data: existingSeedAudit } = await admin
        .from('org_audit_logs')
        .select('id')
        .eq('org_id', org.id)
        .eq('action', 'demo.seeded')
        .maybeSingle()
    if (!existingSeedAudit) {
        const { error: auditError } = await admin.from('org_audit_logs').insert([
            {
                org_id: org.id,
                actor_id: owner.id,
                action: 'demo.seeded',
                target_type: 'organization',
                target_id: org.id,
                metadata: { source: 'scripts/seed-enterprise-demo-local.mjs' },
            },
            {
                org_id: org.id,
                actor_id: owner.id,
                action: 'brand.published',
                target_type: 'organization',
                target_id: org.id,
                metadata: { primary_color: ORG_COLOR, brand_name: ORG_NAME },
            },
            {
                org_id: org.id,
                actor_id: adminUser.id,
                action: 'client.bulk_assigned',
                target_type: 'clients',
                target_id: org.id,
                metadata: { assigned_count: assignments.length },
            },
        ])
        if (auditError) throw auditError
    }

    console.log('Enterprise demo workspace ready')
    console.log({
        org: `/org/${org.slug}`,
        owner: people.owner.email,
        admin: people.admin.email,
        coaches: people.coaches.map((coach) => coach.email),
        password: DEMO_PASSWORD,
    })
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})
