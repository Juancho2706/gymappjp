/**
 * Seed de personas E2E (Wave 2) — separacion total de 3 flujos:
 *   coach_standalone / enterprise_coach / coach_team
 *
 * APUNTA A PROD DELIBERADAMENTE. Doble gate de seguridad:
 *   1) flag CLI --allow-remote
 *   2) env E2E_SEED_CONFIRM=yes
 * Imprime la URL objetivo y espera 3 segundos antes de tocar nada.
 *
 * Uso (PowerShell):
 *   $env:E2E_SEED_CONFIRM='yes'; $env:E2E_PERSONAS_PASSWORD='<password>'; node scripts/seed-e2e-personas.mjs --allow-remote
 * Uso (bash):
 *   E2E_SEED_CONFIRM=yes E2E_PERSONAS_PASSWORD='<password>' node scripts/seed-e2e-personas.mjs --allow-remote
 *
 * Garantias:
 * - IDEMPOTENTE: crea solo lo que falta (ensureUser + checks deterministas por
 *   nombre/slug/id). NUNCA borra ni sobreescribe data existente.
 * - Si el auth user ya existe, solo sincroniza el password al valor del env
 *   (cuentas @evatest.cl exclusivas de E2E).
 * - Inventario completo: docs/e2e-personas.md
 *
 * Shapes de columnas verificados contra apps/web/src/lib/database.types.ts (Insert)
 * y migrations 20260608210000_client_identity_split.sql / 20260609050855_team_foundation.sql.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// apps/web/.env.local primero, root .env.local como fallback
config({ path: resolve(__dirname, '../apps/web/.env.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

// ---------------------------------------------------------------------------
// Constantes de personas (Wave 2)
// ---------------------------------------------------------------------------

const EMAILS = {
    soloCoach: 'e2e-solo-coach@evatest.cl',
    soloAlumno: 'e2e-solo-alumno@evatest.cl',
    orgOwner: 'e2e-org-owner@evatest.cl',
    orgCoach: 'e2e-org-coach@evatest.cl',
    orgAlumno: 'e2e-org-alumno@evatest.cl',
    teamOwner: 'e2e-team-owner@evatest.cl',
    teamCoach: 'e2e-team-coach@evatest.cl',
    poolAlumno: 'e2e-pool-alumno@evatest.cl',
}

const SOLO_BRAND = { name: 'Aurora Strength', slug: 'e2e-aurora-strength', color: '#F59E0B' }
const ORG = { name: 'E2E Performance Lab', slug: 'e2e-performance-lab', color: '#8B5CF6' }
const TEAM = { name: 'E2E Pool Vortex', slug: 'e2e-pool-vortex', color: '#EC4899' }

const PROGRAM_BASE_NAME = 'E2E-SEED Programa Base'
const PROGRAM_MEMBER_NAME = 'E2E-SEED Programa Member'
const NUTRITION_PLAN_NAME = 'E2E-SEED Plan Nutricional'

const TIER_MAX = { starter: 10, pro: 30, elite: 60, scale: 500 }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const counts = {}
function track(table, inserted, n = 1) {
    if (!counts[table]) counts[table] = { inserted: 0, existing: 0 }
    counts[table][inserted ? 'inserted' : 'existing'] += n
}

function must(res, label) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`)
    return res.data
}

function dateOnly(daysAgo) {
    return new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10)
}

function tsAt(daysAgo, hour = 18, minute = 30) {
    const d = new Date(Date.now() - daysAgo * 86400000)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
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

async function ensureUser(admin, email, fullName, password) {
    const existing = await findUserByEmail(admin, email)
    if (existing) {
        // Sync de password para reruns confiables (cuentas @evatest.cl exclusivas de E2E)
        if (email.endsWith('@evatest.cl')) {
            const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
            if (error) throw new Error(`updateUserById(${email}): ${error.message}`)
        }
        track('auth.users', false)
        return existing
    }
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, e2e_seed: 'wave2' },
    })
    if (error) throw new Error(`createUser(${email}): ${error.message}`)
    track('auth.users', true)
    return data.user
}

// invite_code: coaches.invite_code tiene DEFAULT '' (bug conocido) — SIEMPRE explicito.
const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'
async function generateInviteCode(admin) {
    for (let attempt = 0; attempt < 25; attempt++) {
        let code = ''
        for (let i = 0; i < 8; i++) code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)]
        const row = must(
            await admin.from('coaches').select('id').eq('invite_code', code).maybeSingle(),
            'coaches invite_code uniqueness check'
        )
        if (!row) return code
    }
    throw new Error('No se pudo generar un invite_code unico tras 25 intentos')
}

async function ensureCoach(admin, user, opts) {
    const existing = must(
        await admin.from('coaches').select('id, slug, invite_code').eq('id', user.id).maybeSingle(),
        `coaches select (${opts.slug})`
    )
    if (existing) {
        track('coaches', false)
        return existing
    }
    const invite_code = await generateInviteCode(admin)
    must(
        await admin.from('coaches').insert({
            id: user.id,
            full_name: opts.fullName,
            brand_name: opts.brandName,
            slug: opts.slug,
            invite_code,
            primary_color: opts.primaryColor,
            subscription_status: opts.status,
            subscription_tier: opts.tier,
            billing_cycle: 'monthly',
            payment_provider: 'admin',
            max_clients: TIER_MAX[opts.tier] ?? 30,
            use_brand_colors_coach: true,
            active_org_id: opts.activeOrgId ?? null,
            current_period_end: opts.currentPeriodEnd ?? null,
        }),
        `coaches insert (${opts.slug})`
    )
    track('coaches', true)
    return { id: user.id, slug: opts.slug, invite_code }
}

async function ensureClient(admin, user, opts) {
    const existing = must(
        await admin.from('clients').select('id, coach_id, org_id, team_id').eq('id', user.id).maybeSingle(),
        `clients select (${user.email})`
    )
    if (existing) {
        track('clients', false)
        return existing
    }
    must(
        await admin.from('clients').insert({
            id: user.id,
            email: user.email,
            full_name: opts.fullName,
            coach_id: opts.coachId,
            org_id: opts.orgId ?? null,
            team_id: opts.teamId ?? null,
            is_active: true,
            onboarding_completed: true,
            force_password_change: false,
            subscription_start_date: dateOnly(45),
            use_coach_brand_colors: true,
        }),
        `clients insert (${user.email})`
    )
    track('clients', true)
    return { id: user.id, coach_id: opts.coachId, org_id: opts.orgId ?? null, team_id: opts.teamId ?? null }
}

async function ensureClientAccount(admin, accountId) {
    const existing = must(
        await admin.from('client_accounts').select('id').eq('id', accountId).maybeSingle(),
        'client_accounts select'
    )
    if (existing) {
        track('client_accounts', false)
        return
    }
    must(await admin.from('client_accounts').insert({ id: accountId }), 'client_accounts insert')
    track('client_accounts', true)
}

/**
 * client_memberships — composite CHECK (migration team_foundation):
 *   standalone => org_id NULL  AND team_id NULL
 *   enterprise => org_id SET   AND team_id NULL
 *   team       => team_id SET  AND org_id NULL
 */
async function ensureMembership(admin, { accountId, clientId, scope, coachId, orgId, teamId }) {
    let q = admin
        .from('client_memberships')
        .select('id')
        .eq('account_id', accountId)
        .is('deleted_at', null)
    if (scope === 'standalone') q = q.eq('scope', 'standalone')
    else if (scope === 'enterprise') q = q.eq('org_id', orgId)
    else q = q.eq('team_id', teamId)
    const existing = must(await q.limit(1), `client_memberships select (${scope})`)
    if (existing.length > 0) {
        track('client_memberships', false)
        return
    }
    must(
        await admin.from('client_memberships').insert({
            account_id: accountId,
            client_id: clientId,
            scope,
            coach_id: coachId ?? null,
            org_id: scope === 'enterprise' ? orgId : null,
            team_id: scope === 'team' ? teamId : null,
            status: 'active',
        }),
        `client_memberships insert (${scope})`
    )
    track('client_memberships', true)
}

async function ensureConsent(admin, { clientId, accountId, teamId, purpose }) {
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
        track('client_consents', false)
        return
    }
    must(
        await admin.from('client_consents').insert({
            client_id: clientId,
            account_id: accountId,
            team_id: teamId,
            purpose,
            consent_text_version: 'v1',
            granted_via: 'team_onboarding',
            granted_at: new Date().toISOString(),
        }),
        `client_consents insert (${purpose})`
    )
    track('client_consents', true)
}

// ---------------------------------------------------------------------------
// Contenido por alumno
// ---------------------------------------------------------------------------

async function seedIntake(admin, clientId, label) {
    const existing = must(
        await admin.from('client_intake').select('id').eq('client_id', clientId).maybeSingle(),
        `client_intake select (${label})`
    )
    if (existing) {
        track('client_intake', false)
        return
    }
    must(
        await admin.from('client_intake').insert({
            client_id: clientId,
            weight_kg: 70,
            height_cm: 172,
            goals: 'Recomposicion corporal y fuerza general (seed E2E)',
            experience_level: 'intermediate',
            availability: '4 dias por semana',
            injuries: null,
            medical_conditions: null,
        }),
        `client_intake insert (${label})`
    )
    track('client_intake', true)
}

/**
 * Programa -> plans -> blocks (-> logs opcionales).
 * Idempotencia a nivel programa: si ya existe un workout_programs con ese nombre
 * para ese client_id, se asume seed previo completo y se salta todo el arbol.
 * workout_blocks.section CHECK: warmup | main | cooldown.
 */
async function seedWorkoutProgram(admin, { clientId, coachId, orgId, name, planDays, withLogs, exercises, exerciseNameById, label }) {
    const existing = must(
        await admin.from('workout_programs').select('id').eq('client_id', clientId).eq('name', name).limit(1),
        `workout_programs select (${label})`
    )
    if (existing.length > 0) {
        console.log(`  = ${label}: programa "${name}" ya existe — skip arbol completo`)
        track('workout_programs', false)
        return
    }

    const program = must(
        await admin
            .from('workout_programs')
            .insert({
                name,
                client_id: clientId,
                coach_id: coachId,
                created_by_coach_id: coachId,
                org_id: orgId ?? null,
                is_active: true,
                start_date: dateOnly(14),
            })
            .select('id')
            .single(),
        `workout_programs insert (${label})`
    )
    track('workout_programs', true)

    const planRows = planDays.map((dow) => ({
        coach_id: coachId,
        client_id: clientId,
        program_id: program.id,
        title: `${name} — Dia ${dow}`,
        day_of_week: dow,
    }))
    const plans = must(
        await admin.from('workout_plans').insert(planRows).select('id, day_of_week, title'),
        `workout_plans insert (${label})`
    )
    track('workout_plans', true, plans.length)

    const blockRows = []
    plans.forEach((plan, pi) => {
        for (let b = 0; b < 4; b++) {
            const ex = exercises[(pi * 4 + b) % exercises.length]
            blockRows.push({
                plan_id: plan.id,
                exercise_id: ex.id,
                order_index: b,
                section: b === 0 ? 'warmup' : 'main',
                sets: 3,
                reps: b === 0 ? '12' : '10',
                rest_time: b === 0 ? '60' : '90',
                target_weight_kg: b === 0 ? null : 40 + b * 10,
            })
        }
    })
    const blocks = must(
        await admin.from('workout_blocks').insert(blockRows).select('id, plan_id, order_index, exercise_id'),
        `workout_blocks insert (${label})`
    )
    track('workout_blocks', true, blocks.length)

    if (!withLogs) return

    // 7 sesiones (dia por medio) en los ultimos 14 dias, 2 ejercicios x 3 sets
    const logRows = []
    for (let d = 0; d <= 12; d += 2) {
        const plan = plans[(d / 2) % plans.length]
        const planBlocks = blocks
            .filter((bl) => bl.plan_id === plan.id && bl.order_index > 0)
            .sort((a, b) => a.order_index - b.order_index)
            .slice(0, 2)
        for (const bl of planBlocks) {
            for (let setN = 1; setN <= 3; setN++) {
                logRows.push({
                    block_id: bl.id,
                    client_id: clientId,
                    set_number: setN,
                    weight_kg: Math.round((40 + (12 - d) * 0.5 + setN) * 10) / 10,
                    reps_done: 10,
                    rpe: setN === 3 ? 8 : 7,
                    logged_at: tsAt(d, 18, 30 + setN),
                    exercise_name_at_log: exerciseNameById.get(bl.exercise_id) ?? null,
                    plan_name_at_log: plan.title,
                    target_reps_at_log: '10',
                })
            }
        }
    }
    must(await admin.from('workout_logs').insert(logRows), `workout_logs insert (${label})`)
    track('workout_logs', true, logRows.length)
}

async function seedNutrition(admin, { clientId, coachId, orgId, foods, label }) {
    const existing = must(
        await admin
            .from('nutrition_plans')
            .select('id')
            .eq('client_id', clientId)
            .eq('name', NUTRITION_PLAN_NAME)
            .limit(1),
        `nutrition_plans select (${label})`
    )
    if (existing.length > 0) {
        console.log(`  = ${label}: plan nutricional ya existe — skip arbol completo`)
        track('nutrition_plans', false)
        return
    }

    const plan = must(
        await admin
            .from('nutrition_plans')
            .insert({
                client_id: clientId,
                coach_id: coachId,
                org_id: orgId ?? null,
                name: NUTRITION_PLAN_NAME,
                is_active: true,
                daily_calories: 2200,
                protein_g: 180,
                carbs_g: 220,
                fats_g: 70,
                instructions: 'Plan generado por seed E2E. No borrar.',
            })
            .select('id')
            .single(),
        `nutrition_plans insert (${label})`
    )
    track('nutrition_plans', true)

    const mealNames = ['Desayuno', 'Almuerzo', 'Snack', 'Cena']
    const meals = must(
        await admin
            .from('nutrition_meals')
            .insert(
                mealNames.map((nm, i) => ({
                    plan_id: plan.id,
                    name: nm,
                    order_index: i + 1,
                    description: `Comida E2E ${i + 1}`,
                }))
            )
            .select('id, order_index'),
        `nutrition_meals insert (${label})`
    )
    track('nutrition_meals', true, meals.length)
    const orderedMeals = [...meals].sort((a, b) => a.order_index - b.order_index)

    const itemRows = []
    orderedMeals.forEach((meal, mi) => {
        for (let f = 0; f < 2; f++) {
            const food = foods[(mi * 2 + f) % foods.length]
            itemRows.push({
                meal_id: meal.id,
                food_id: food.id,
                quantity: 100 + f * 50,
                unit: food.serving_unit ?? 'g',
            })
        }
    })
    must(await admin.from('food_items').insert(itemRows), `food_items insert (${label})`)
    track('food_items', true, itemRows.length)

    const dailyRows = []
    for (let d = 0; d < 7; d++) {
        dailyRows.push({
            client_id: clientId,
            plan_id: plan.id,
            log_date: dateOnly(d),
            plan_name_at_log: NUTRITION_PLAN_NAME,
            target_calories_at_log: 2200,
            target_protein_at_log: 180,
            target_carbs_at_log: 220,
            target_fats_at_log: 70,
        })
    }
    const dailyLogs = must(
        await admin.from('daily_nutrition_logs').insert(dailyRows).select('id, log_date'),
        `daily_nutrition_logs insert (${label})`
    )
    track('daily_nutrition_logs', true, dailyLogs.length)

    const mealLogRows = []
    dailyLogs.forEach((dl, di) => {
        const howMany = 2 + (di % 2) // alterna 2 y 3 meal logs por dia
        for (let m = 0; m < howMany; m++) {
            mealLogRows.push({
                daily_log_id: dl.id,
                meal_id: orderedMeals[m].id,
                is_completed: (di + m) % 2 === 0,
            })
        }
    })
    must(await admin.from('nutrition_meal_logs').insert(mealLogRows), `nutrition_meal_logs insert (${label})`)
    track('nutrition_meal_logs', true, mealLogRows.length)
}

async function seedCheckIns(admin, clientId, label) {
    const existing = must(
        await admin.from('check_ins').select('id').eq('client_id', clientId).limit(1),
        `check_ins select (${label})`
    )
    if (existing.length > 0) {
        track('check_ins', false)
        return
    }
    const rows = [
        { daysAgo: 14, weight: 70 },
        { daysAgo: 7, weight: 69.5 },
        { daysAgo: 0, weight: 69 },
    ].map(({ daysAgo, weight }, i) => ({
        client_id: clientId,
        date: dateOnly(daysAgo),
        weight,
        energy_level: 7,
        notes: `E2E-SEED check-in ${i + 1}`,
        front_photo_url: null,
        back_photo_url: null,
    }))
    must(await admin.from('check_ins').insert(rows), `check_ins insert (${label})`)
    track('check_ins', true, rows.length)
}

async function seedDailyHabits(admin, clientId, label) {
    const existing = must(
        await admin.from('daily_habits').select('id').eq('client_id', clientId).limit(1),
        `daily_habits select (${label})`
    )
    if (existing.length > 0) {
        track('daily_habits', false)
        return
    }
    const rows = []
    for (let d = 0; d < 7; d++) {
        rows.push({
            client_id: clientId,
            log_date: dateOnly(d),
            water_ml: 2000 + d * 100,
            steps: 8000 + d * 250,
            sleep_hours: 7.5,
        })
    }
    must(await admin.from('daily_habits').insert(rows), `daily_habits insert (${label})`)
    track('daily_habits', true, rows.length)
}

async function seedFullAlumnoContent(admin, ctx) {
    const { clientId, coachId, orgId, exercises, exerciseNameById, foods, label } = ctx
    console.log(`-- Contenido alumno: ${label}`)
    await seedIntake(admin, clientId, label)
    await seedWorkoutProgram(admin, {
        clientId,
        coachId,
        orgId,
        name: PROGRAM_BASE_NAME,
        planDays: [1, 3, 5],
        withLogs: true,
        exercises,
        exerciseNameById,
        label,
    })
    await seedNutrition(admin, { clientId, coachId, orgId, foods, label })
    await seedCheckIns(admin, clientId, label)
    await seedDailyHabits(admin, clientId, label)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    const password = process.env.E2E_PERSONAS_PASSWORD

    if (!url || !key) {
        console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (apps/web/.env.local o .env.local)')
        process.exit(1)
    }
    if (!password) {
        console.error('Falta E2E_PERSONAS_PASSWORD en el env. Abortando.')
        process.exit(1)
    }
    if (password.length < 8) {
        console.error('E2E_PERSONAS_PASSWORD debe tener al menos 8 caracteres.')
        process.exit(1)
    }
    if (!process.argv.includes('--allow-remote') || process.env.E2E_SEED_CONFIRM !== 'yes') {
        console.error(
            'Este script escribe en la Supabase REMOTA (prod) deliberadamente.\n' +
            'Requiere AMBOS gates:\n' +
            '  1) flag --allow-remote\n' +
            "  2) env E2E_SEED_CONFIRM='yes'\n" +
            'Abortando.'
        )
        process.exit(1)
    }

    console.log(`Target Supabase: ${url}`)
    console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
    await new Promise((r) => setTimeout(r, 3000))

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    // Catalogo real del sistema (ejercicios/alimentos sin coach ni org)
    const exercises = must(
        await admin
            .from('exercises')
            .select('id, name')
            .is('coach_id', null)
            .is('org_id', null)
            .is('deleted_at', null)
            .limit(8),
        'exercises select'
    )
    if (exercises.length < 4) throw new Error(`Se necesitan >=4 ejercicios de sistema; hay ${exercises.length}`)
    const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]))

    const foods = must(
        await admin
            .from('foods')
            .select('id, name, serving_unit')
            .is('coach_id', null)
            .is('org_id', null)
            .limit(8),
        'foods select'
    )
    if (foods.length < 4) throw new Error(`Se necesitan >=4 alimentos de sistema; hay ${foods.length}`)

    const contentBase = { exercises, exerciseNameById, foods }
    const periodEnd = new Date()
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)

    // ----- Flujo 1: coach standalone + su alumno --------------------------------
    console.log('== Flujo coach_standalone ==')
    const soloCoachUser = await ensureUser(admin, EMAILS.soloCoach, 'E2E Solo Coach', password)
    const soloCoach = await ensureCoach(admin, soloCoachUser, {
        fullName: 'E2E Solo Coach',
        brandName: SOLO_BRAND.name,
        slug: SOLO_BRAND.slug,
        primaryColor: SOLO_BRAND.color,
        tier: 'elite',
        status: 'active',
        currentPeriodEnd: periodEnd.toISOString(),
    })

    const soloAlumnoUser = await ensureUser(admin, EMAILS.soloAlumno, 'E2E Solo Alumno', password)
    await ensureClient(admin, soloAlumnoUser, { fullName: 'E2E Solo Alumno', coachId: soloCoachUser.id })
    await ensureClientAccount(admin, soloAlumnoUser.id)
    await ensureMembership(admin, {
        accountId: soloAlumnoUser.id,
        clientId: soloAlumnoUser.id,
        scope: 'standalone',
        coachId: soloCoachUser.id,
    })
    await seedFullAlumnoContent(admin, {
        ...contentBase,
        clientId: soloAlumnoUser.id,
        coachId: soloCoachUser.id,
        orgId: null,
        label: 'solo-alumno',
    })

    // ----- Flujo 2: enterprise (org owner + org coach + org alumno) -------------
    console.log('== Flujo enterprise ==')
    const orgOwnerUser = await ensureUser(admin, EMAILS.orgOwner, 'E2E Org Owner', password)

    let org = must(
        await admin.from('organizations').select('id, slug').eq('slug', ORG.slug).is('deleted_at', null).maybeSingle(),
        'organizations select'
    )
    if (!org) {
        org = must(
            await admin
                .from('organizations')
                .insert({
                    slug: ORG.slug,
                    name: ORG.name,
                    owner_user_id: orgOwnerUser.id,
                    primary_color: ORG.color,
                    plan: 'enterprise',
                    status: 'active',
                    seats_included: 10,
                    client_limit: 100,
                    billing_cycle: 'monthly',
                    currency: 'CLP',
                    onboarding_step: 4,
                })
                .select('id, slug')
                .single(),
            'organizations insert'
        )
        track('organizations', true)
    } else {
        track('organizations', false)
    }

    async function ensureOrgMember(userId, role, coachId) {
        const existing = must(
            await admin
                .from('organization_members')
                .select('id')
                .eq('org_id', org.id)
                .eq('user_id', userId)
                .is('deleted_at', null)
                .limit(1),
            `organization_members select (${role})`
        )
        if (existing.length > 0) {
            track('organization_members', false)
            return
        }
        must(
            await admin.from('organization_members').insert({
                org_id: org.id,
                user_id: userId,
                coach_id: coachId,
                role,
                status: 'active',
                joined_at: new Date().toISOString(),
            }),
            `organization_members insert (${role})`
        )
        track('organization_members', true)
    }

    // Owner: solo membresia org (NO coaches row)
    await ensureOrgMember(orgOwnerUser.id, 'org_owner', null)

    const orgCoachUser = await ensureUser(admin, EMAILS.orgCoach, 'E2E Org Coach', password)
    await ensureCoach(admin, orgCoachUser, {
        fullName: 'E2E Org Coach',
        brandName: ORG.name,
        slug: 'e2e-org-coach',
        primaryColor: ORG.color,
        tier: 'scale',
        status: 'org_managed',
        activeOrgId: org.id,
    })
    await ensureOrgMember(orgCoachUser.id, 'coach', orgCoachUser.id)

    const orgAlumnoUser = await ensureUser(admin, EMAILS.orgAlumno, 'E2E Org Alumno', password)
    await ensureClient(admin, orgAlumnoUser, {
        fullName: 'E2E Org Alumno',
        coachId: orgCoachUser.id,
        orgId: org.id,
    })
    await ensureClientAccount(admin, orgAlumnoUser.id)
    await ensureMembership(admin, {
        accountId: orgAlumnoUser.id,
        clientId: orgAlumnoUser.id,
        scope: 'enterprise',
        coachId: orgCoachUser.id,
        orgId: org.id,
    })

    // Asignacion enterprise coach<->alumno (consistente con seed enterprise demo)
    const existingAssignment = must(
        await admin
            .from('coach_client_assignments')
            .select('id')
            .eq('org_id', org.id)
            .eq('client_id', orgAlumnoUser.id)
            .is('deleted_at', null)
            .limit(1),
        'coach_client_assignments select'
    )
    if (existingAssignment.length === 0) {
        must(
            await admin.from('coach_client_assignments').insert({
                org_id: org.id,
                client_id: orgAlumnoUser.id,
                coach_id: orgCoachUser.id,
                assigned_by: orgOwnerUser.id,
            }),
            'coach_client_assignments insert'
        )
        track('coach_client_assignments', true)
    } else {
        track('coach_client_assignments', false)
    }

    await seedFullAlumnoContent(admin, {
        ...contentBase,
        clientId: orgAlumnoUser.id,
        coachId: orgCoachUser.id,
        orgId: org.id, // stamp org_id en workout_programs + nutrition_plans
        label: 'org-alumno',
    })

    // ----- Flujo 3: team pool (owner + coach miembro + alumno pool) -------------
    console.log('== Flujo coach_team ==')
    const teamOwnerUser = await ensureUser(admin, EMAILS.teamOwner, 'E2E Team Owner', password)
    await ensureCoach(admin, teamOwnerUser, {
        fullName: 'E2E Team Owner',
        brandName: TEAM.name,
        slug: 'e2e-team-owner',
        primaryColor: TEAM.color,
        tier: 'elite',
        status: 'team_managed',
    })

    let team = must(
        await admin.from('teams').select('id, slug').eq('slug', TEAM.slug).is('deleted_at', null).limit(1),
        'teams select'
    )
    team = team[0] ?? null
    if (!team) {
        team = must(
            await admin
                .from('teams')
                .insert({
                    name: TEAM.name,
                    slug: TEAM.slug,
                    owner_coach_id: teamOwnerUser.id,
                    primary_color: TEAM.color,
                    seat_limit: 10,
                    enabled_modules: {},
                })
                .select('id, slug')
                .single(),
            'teams insert'
        )
        track('teams', true)
    } else {
        track('teams', false)
    }

    async function ensureTeamMember(coachId, canManage, displayRole) {
        const existing = must(
            await admin
                .from('team_members')
                .select('id')
                .eq('team_id', team.id)
                .eq('coach_id', coachId)
                .limit(1),
            `team_members select (${displayRole})`
        )
        if (existing.length > 0) {
            track('team_members', false)
            return
        }
        must(
            await admin.from('team_members').insert({
                team_id: team.id,
                coach_id: coachId,
                can_manage: canManage,
                display_role: displayRole,
                status: 'active',
            }),
            `team_members insert (${displayRole})`
        )
        track('team_members', true)
    }

    await ensureTeamMember(teamOwnerUser.id, true, 'Owner')

    const teamCoachUser = await ensureUser(admin, EMAILS.teamCoach, 'E2E Team Coach', password)
    await ensureCoach(admin, teamCoachUser, {
        fullName: 'E2E Team Coach',
        brandName: TEAM.name,
        slug: 'e2e-team-coach',
        primaryColor: TEAM.color,
        tier: 'elite',
        status: 'team_managed',
    })
    await ensureTeamMember(teamCoachUser.id, false, 'Nutrición')

    const poolAlumnoUser = await ensureUser(admin, EMAILS.poolAlumno, 'E2E Pool Alumno', password)
    await ensureClient(admin, poolAlumnoUser, {
        fullName: 'E2E Pool Alumno',
        coachId: teamOwnerUser.id,
        teamId: team.id,
    })
    await ensureClientAccount(admin, poolAlumnoUser.id)
    await ensureMembership(admin, {
        accountId: poolAlumnoUser.id,
        clientId: poolAlumnoUser.id,
        scope: 'team',
        coachId: teamOwnerUser.id,
        teamId: team.id,
    })
    // Consentimientos Ley 21.719 — ya otorgados por seed => sin consent gate en E2E
    await ensureConsent(admin, {
        clientId: poolAlumnoUser.id,
        accountId: poolAlumnoUser.id,
        teamId: team.id,
        purpose: 'pool_multidisciplinary_access',
    })
    await ensureConsent(admin, {
        clientId: poolAlumnoUser.id,
        accountId: poolAlumnoUser.id,
        teamId: team.id,
        purpose: 'health_data_processing',
    })

    await seedFullAlumnoContent(admin, {
        ...contentBase,
        clientId: poolAlumnoUser.id,
        coachId: teamOwnerUser.id,
        orgId: null, // pool: org_id SIEMPRE null
        label: 'pool-alumno',
    })
    // Segundo programa del pool, autor = coach miembro (persona 7)
    await seedWorkoutProgram(admin, {
        clientId: poolAlumnoUser.id,
        coachId: teamCoachUser.id,
        orgId: null,
        name: PROGRAM_MEMBER_NAME,
        planDays: [2],
        withLogs: false,
        exercises,
        exerciseNameById,
        label: 'pool-alumno (member)',
    })

    // ----- Inventario ------------------------------------------------------------
    const inventory = {
        target: url,
        personas: [
            { email: EMAILS.soloCoach, id: soloCoachUser.id, role: 'coach_standalone', slug: SOLO_BRAND.slug, invite_code: soloCoach.invite_code ?? null },
            { email: EMAILS.soloAlumno, id: soloAlumnoUser.id, role: 'alumno_standalone' },
            { email: EMAILS.orgOwner, id: orgOwnerUser.id, role: 'org_owner' },
            { email: EMAILS.orgCoach, id: orgCoachUser.id, role: 'enterprise_coach', slug: 'e2e-org-coach' },
            { email: EMAILS.orgAlumno, id: orgAlumnoUser.id, role: 'alumno_enterprise' },
            { email: EMAILS.teamOwner, id: teamOwnerUser.id, role: 'coach_team_owner', slug: 'e2e-team-owner' },
            { email: EMAILS.teamCoach, id: teamCoachUser.id, role: 'coach_team_member', slug: 'e2e-team-coach' },
            { email: EMAILS.poolAlumno, id: poolAlumnoUser.id, role: 'alumno_pool' },
        ],
        orgs: [{ slug: ORG.slug, id: org.id, name: ORG.name }],
        teams: [{ slug: TEAM.slug, id: team.id, name: TEAM.name }],
        counts,
    }
    console.log('\n=== INVENTARIO E2E PERSONAS ===')
    console.log(JSON.stringify(inventory, null, 2))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
