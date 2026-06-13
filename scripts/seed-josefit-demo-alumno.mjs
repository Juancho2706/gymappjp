/**
 * One-off: alumno demo CARGADO de datos para el coach standalone josefit (juanmvr2706).
 *
 * Objetivo: poder loguearse en /c/josefit/login con un alumno real y ver TODAS las
 * superficies del alumno con data: dashboard (rings, peso, racha), rutina + historial,
 * nutricion, check-ins, movimiento (FMS) y composicion corporal (BIA + ISAK) — los 4
 * modulos de josefit estan ON.
 *
 * APUNTA A PROD DELIBERADAMENTE (mismo target que seed-e2e-personas). Doble gate:
 *   1) flag --allow-remote
 *   2) env JOSEFIT_SEED_CONFIRM=yes
 *
 * Uso (PowerShell):
 *   $env:JOSEFIT_SEED_CONFIRM='yes'; node scripts/seed-josefit-demo-alumno.mjs --allow-remote
 * Uso (bash):
 *   JOSEFIT_SEED_CONFIRM=yes node scripts/seed-josefit-demo-alumno.mjs --allow-remote
 *
 * Password del alumno: env JOSEFIT_ALUMNO_PASSWORD o el default de abajo.
 *
 * IDEMPOTENTE: crea solo lo que falta. Cuenta @evatest.cl => permanente, excluida de purges.
 * Shapes verificados contra apps/web/src/lib/database.types.ts y los repos de bodycomp/movement.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../apps/web/.env.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

// --- Constantes del alumno demo ---------------------------------------------
const COACH_ID = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6' // josefit (juanmvr2706), standalone
const ALUMNO_EMAIL = 'josefit-alumno-demo@evatest.cl'
const ALUMNO_NAME = 'Demo Alumno Josefit'
const ALUMNO_PASSWORD = process.env.JOSEFIT_ALUMNO_PASSWORD || 'EvaDemo2026!'

const PROGRAM_NAME = 'DEMO Hipertrofia 3 dias'
const NUTRITION_PLAN_NAME = 'DEMO Plan Recomposicion'

// --- Helpers ----------------------------------------------------------------
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
        const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
        if (error) throw new Error(`updateUserById(${email}): ${error.message}`)
        track('auth.users', false)
        return existing
    }
    const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, demo_seed: 'josefit' },
    })
    if (error) throw new Error(`createUser(${email}): ${error.message}`)
    track('auth.users', true)
    return data.user
}

async function ensureClient(admin, user) {
    const existing = must(
        await admin.from('clients').select('id').eq('id', user.id).maybeSingle(),
        'clients select'
    )
    if (existing) {
        track('clients', false)
        return
    }
    must(
        await admin.from('clients').insert({
            id: user.id,
            email: user.email,
            full_name: ALUMNO_NAME,
            coach_id: COACH_ID,
            org_id: null,
            team_id: null,
            is_active: true,
            onboarding_completed: true,
            force_password_change: false,
            subscription_start_date: dateOnly(70),
            use_coach_brand_colors: true,
        }),
        'clients insert'
    )
    track('clients', true)
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

async function ensureMembership(admin, { accountId, clientId }) {
    const existing = must(
        await admin
            .from('client_memberships')
            .select('id')
            .eq('account_id', accountId)
            .eq('scope', 'standalone')
            .is('deleted_at', null)
            .limit(1),
        'client_memberships select'
    )
    if (existing.length > 0) {
        track('client_memberships', false)
        return
    }
    must(
        await admin.from('client_memberships').insert({
            account_id: accountId,
            client_id: clientId,
            scope: 'standalone',
            coach_id: COACH_ID,
            org_id: null,
            team_id: null,
            status: 'active',
        }),
        'client_memberships insert'
    )
    track('client_memberships', true)
}

async function ensureConsent(admin, clientId) {
    const existing = must(
        await admin
            .from('client_consents')
            .select('id')
            .eq('client_id', clientId)
            .eq('purpose', 'health_data_processing')
            .is('revoked_at', null)
            .limit(1),
        'client_consents select'
    )
    if (existing.length > 0) {
        track('client_consents', false)
        return
    }
    must(
        await admin.from('client_consents').insert({
            client_id: clientId,
            purpose: 'health_data_processing',
            consent_text_version: 'v1',
            granted_via: 'coach_attestation',
            granted_at: new Date().toISOString(),
        }),
        'client_consents insert'
    )
    track('client_consents', true)
}

async function seedIntake(admin, clientId) {
    const existing = must(
        await admin.from('client_intake').select('id').eq('client_id', clientId).maybeSingle(),
        'client_intake select'
    )
    if (existing) {
        track('client_intake', false)
        return
    }
    must(
        await admin.from('client_intake').insert({
            client_id: clientId,
            weight_kg: 78,
            height_cm: 178,
            goals: 'Recomposicion corporal: bajar grasa y ganar musculo. (DEMO)',
            experience_level: 'intermediate',
            availability: '3-4 dias por semana, tardes',
            injuries: 'Molestia leve hombro derecho (en seguimiento)',
            medical_conditions: null,
        }),
        'client_intake insert'
    )
    track('client_intake', true)
}

async function seedWorkout(admin, { clientId, exercises, exerciseNameById }) {
    const existing = must(
        await admin.from('workout_programs').select('id').eq('client_id', clientId).eq('name', PROGRAM_NAME).limit(1),
        'workout_programs select'
    )
    if (existing.length > 0) {
        console.log('  = workout: programa ya existe — skip')
        track('workout_programs', false)
        return
    }
    const program = must(
        await admin
            .from('workout_programs')
            .insert({
                name: PROGRAM_NAME,
                client_id: clientId,
                coach_id: COACH_ID,
                created_by_coach_id: COACH_ID,
                org_id: null,
                is_active: true,
                start_date: dateOnly(28),
            })
            .select('id')
            .single(),
        'workout_programs insert'
    )
    track('workout_programs', true)

    const planDays = [1, 3, 5]
    const plans = must(
        await admin
            .from('workout_plans')
            .insert(
                planDays.map((dow) => ({
                    coach_id: COACH_ID,
                    client_id: clientId,
                    program_id: program.id,
                    title: `${PROGRAM_NAME} — Dia ${dow}`,
                    day_of_week: dow,
                }))
            )
            .select('id, day_of_week, title'),
        'workout_plans insert'
    )
    track('workout_plans', true, plans.length)

    const blockRows = []
    plans.forEach((plan, pi) => {
        for (let b = 0; b < 5; b++) {
            const ex = exercises[(pi * 5 + b) % exercises.length]
            blockRows.push({
                plan_id: plan.id,
                exercise_id: ex.id,
                order_index: b,
                section: b === 0 ? 'warmup' : b === 4 ? 'cooldown' : 'main',
                sets: b === 0 ? 2 : 4,
                reps: b === 0 ? '15' : b === 4 ? '30' : '10',
                rest_time: b === 0 ? '45' : '90',
                target_weight_kg: b === 0 || b === 4 ? null : 30 + b * 12,
            })
        }
    })
    const blocks = must(
        await admin.from('workout_blocks').insert(blockRows).select('id, plan_id, order_index, exercise_id'),
        'workout_blocks insert'
    )
    track('workout_blocks', true, blocks.length)

    // 12 sesiones (dia por medio) en los ultimos 24 dias — buena racha + historial.
    const logRows = []
    for (let d = 24; d >= 0; d -= 2) {
        const plan = plans[((24 - d) / 2) % plans.length]
        const planBlocks = blocks
            .filter((bl) => bl.plan_id === plan.id && bl.order_index > 0 && bl.order_index < 4)
            .sort((a, b) => a.order_index - b.order_index)
        for (const bl of planBlocks) {
            for (let setN = 1; setN <= 4; setN++) {
                logRows.push({
                    block_id: bl.id,
                    client_id: clientId,
                    set_number: setN,
                    // progresion de carga a lo largo del bloque (PR creciente)
                    weight_kg: Math.round((30 + (24 - d) * 0.6 + bl.order_index * 8 + setN) * 10) / 10,
                    reps_done: setN === 4 ? 8 : 10,
                    rpe: setN >= 3 ? 8 : 7,
                    logged_at: tsAt(d, 19, 0 + setN),
                    exercise_name_at_log: exerciseNameById.get(bl.exercise_id) ?? null,
                    plan_name_at_log: plan.title,
                    target_reps_at_log: '10',
                })
            }
        }
    }
    must(await admin.from('workout_logs').insert(logRows), 'workout_logs insert')
    track('workout_logs', true, logRows.length)
}

async function seedNutrition(admin, { clientId, foods }) {
    const existing = must(
        await admin.from('nutrition_plans').select('id').eq('client_id', clientId).eq('name', NUTRITION_PLAN_NAME).limit(1),
        'nutrition_plans select'
    )
    if (existing.length > 0) {
        console.log('  = nutricion: plan ya existe — skip')
        track('nutrition_plans', false)
        return
    }
    const plan = must(
        await admin
            .from('nutrition_plans')
            .insert({
                client_id: clientId,
                coach_id: COACH_ID,
                org_id: null,
                name: NUTRITION_PLAN_NAME,
                is_active: true,
                daily_calories: 2200,
                protein_g: 180,
                carbs_g: 210,
                fats_g: 70,
                instructions: 'Plan DEMO. 4 comidas. Prioriza proteina en cada comida.',
            })
            .select('id')
            .single(),
        'nutrition_plans insert'
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
                    description: `${nm} — comida DEMO`,
                }))
            )
            .select('id, order_index'),
        'nutrition_meals insert'
    )
    track('nutrition_meals', true, meals.length)
    const orderedMeals = [...meals].sort((a, b) => a.order_index - b.order_index)

    const itemRows = []
    orderedMeals.forEach((meal, mi) => {
        for (let f = 0; f < 3; f++) {
            const food = foods[(mi * 3 + f) % foods.length]
            itemRows.push({
                meal_id: meal.id,
                food_id: food.id,
                quantity: 80 + f * 40,
                unit: food.serving_unit ?? 'g',
            })
        }
    })
    must(await admin.from('food_items').insert(itemRows), 'food_items insert')
    track('food_items', true, itemRows.length)

    // 10 dias de adherencia nutricional
    const dailyRows = []
    for (let d = 0; d < 10; d++) {
        dailyRows.push({
            client_id: clientId,
            plan_id: plan.id,
            log_date: dateOnly(d),
            plan_name_at_log: NUTRITION_PLAN_NAME,
            target_calories_at_log: 2200,
            target_protein_at_log: 180,
            target_carbs_at_log: 210,
            target_fats_at_log: 70,
        })
    }
    const dailyLogs = must(
        await admin.from('daily_nutrition_logs').insert(dailyRows).select('id, log_date'),
        'daily_nutrition_logs insert'
    )
    track('daily_nutrition_logs', true, dailyLogs.length)

    const mealLogRows = []
    dailyLogs.forEach((dl, di) => {
        const howMany = 3 + (di % 2) // 3 o 4 comidas completadas por dia
        for (let m = 0; m < howMany && m < orderedMeals.length; m++) {
            mealLogRows.push({
                daily_log_id: dl.id,
                meal_id: orderedMeals[m].id,
                is_completed: (di + m) % 3 !== 0, // mayoria completadas
            })
        }
    })
    must(await admin.from('nutrition_meal_logs').insert(mealLogRows), 'nutrition_meal_logs insert')
    track('nutrition_meal_logs', true, mealLogRows.length)
}

async function seedCheckIns(admin, clientId) {
    const existing = must(
        await admin.from('check_ins').select('id').eq('client_id', clientId).limit(1),
        'check_ins select'
    )
    if (existing.length > 0) {
        track('check_ins', false)
        return
    }
    // 8 check-ins semanales — peso descendente (recomposicion), energia variada.
    const series = [
        { daysAgo: 56, weight: 80.5, energy: 6 },
        { daysAgo: 49, weight: 79.8, energy: 7 },
        { daysAgo: 42, weight: 79.0, energy: 6 },
        { daysAgo: 35, weight: 78.2, energy: 8 },
        { daysAgo: 28, weight: 77.6, energy: 7 },
        { daysAgo: 21, weight: 76.9, energy: 8 },
        { daysAgo: 14, weight: 76.1, energy: 9 },
        { daysAgo: 7, weight: 75.4, energy: 8 },
        { daysAgo: 1, weight: 75.0, energy: 9 },
    ]
    const rows = series.map(({ daysAgo, weight, energy }, i) => ({
        client_id: clientId,
        date: dateOnly(daysAgo),
        // created_at DEBE coincidir con la fecha real: el dashboard (getCheckInHistory30Days /
        // getLastCheckIn) filtra y ordena por created_at, NO por `date`. Si se deja el default now()
        // todas las filas parecen "creadas hoy" => ventana de 30d y orden se rompen (mostraba el
        // peso mas viejo como el de hoy + tendencia invertida).
        created_at: tsAt(daysAgo, 9, 0),
        weight,
        energy_level: energy,
        notes: `Check-in DEMO ${i + 1} — sintiendome bien, progreso constante.`,
        front_photo_url: null,
        back_photo_url: null,
    }))
    must(await admin.from('check_ins').insert(rows), 'check_ins insert')
    track('check_ins', true, rows.length)
}

async function seedDailyHabits(admin, clientId) {
    const existing = must(
        await admin.from('daily_habits').select('id').eq('client_id', clientId).limit(1),
        'daily_habits select'
    )
    if (existing.length > 0) {
        track('daily_habits', false)
        return
    }
    const rows = []
    for (let d = 0; d < 14; d++) {
        rows.push({
            client_id: clientId,
            log_date: dateOnly(d),
            water_ml: 2200 + (d % 4) * 200,
            steps: 7500 + (d % 5) * 600,
            sleep_hours: 7 + (d % 3) * 0.5,
        })
    }
    must(await admin.from('daily_habits').insert(rows), 'daily_habits insert')
    track('daily_habits', true, rows.length)
}

// --- Composicion corporal: BIA (x3) + ISAK (x2) -----------------------------
function biaMetrics({ weight, bodyFat, muscle, fatMass, water, visceral, bmr, phase }) {
    const icw = Math.round(water * 0.62 * 10) / 10
    const ecw = Math.round((water - icw) * 10) / 10
    return {
        skeletalMuscleMassKg: muscle,
        fatMassKg: fatMass,
        bodyFatPercent: bodyFat,
        totalBodyWaterL: water,
        intracellularWaterL: icw,
        extracellularWaterL: ecw,
        ecwTbwRatio: Math.round((ecw / water) * 1000) / 1000,
        visceralFatLevel: visceral,
        basalMetabolicRateKcal: bmr,
        phaseAngleDeg: phase,
        segmentalLeanKg: { rightArm: 3.4, leftArm: 3.3, trunk: 24.0, rightLeg: 9.6, leftLeg: 9.5 },
        segmentalFatKg: { rightArm: 1.1, leftArm: 1.1, trunk: 8.0, rightLeg: 2.6, leftLeg: 2.6 },
    }
}

async function seedBodyComp(admin, clientId) {
    const existing = must(
        await admin.from('body_composition_measurements').select('id').eq('client_id', clientId).limit(1),
        'body_composition_measurements select'
    )
    if (existing.length > 0) {
        track('body_composition_measurements', false)
        return
    }

    const biaSeries = [
        { daysAgo: 60, weight: 78.0, bodyFat: 24.5, muscle: 33.0, fatMass: 19.1, water: 44.0, visceral: 11, bmr: 1720, phase: 5.8 },
        { daysAgo: 30, weight: 76.5, bodyFat: 22.8, muscle: 33.8, fatMass: 17.4, water: 44.8, visceral: 10, bmr: 1750, phase: 6.0 },
        { daysAgo: 2, weight: 75.0, bodyFat: 20.9, muscle: 34.6, fatMass: 15.7, water: 45.5, visceral: 9, bmr: 1785, phase: 6.3 },
    ]
    const biaRows = biaSeries.map((s) => ({
        client_id: clientId,
        coach_id: COACH_ID,
        created_by: COACH_ID,
        team_id: null,
        org_id: null,
        method: 'bia',
        source: 'manual',
        is_validated: true,
        device_brand: 'InBody',
        device_model: '570',
        measured_at: tsAt(s.daysAgo, 9, 0),
        height_cm: 178,
        weight_kg: s.weight,
        consent_confirmed_at: tsAt(s.daysAgo, 9, 0),
        metrics: biaMetrics(s),
        raw_input: {},
        measurement_conditions: { fasted: true, hydration: 'normal', time_of_day: 'morning' },
    }))

    const isakRaw = (weight) => ({
        sex: 'male',
        ageYears: 31,
        heightCm: 178,
        weightKg: weight,
        sittingHeightCm: 92,
        skinfolds: {
            tricepsMm: 11, subscapularMm: 13, supraspinaleMm: 10, abdominalMm: 18,
            frontThighMm: 14, medialCalfMm: 9, bicepsMm: 5, iliacCrestMm: 14,
        },
        girths: {
            headCm: 57, armRelaxedCm: 33, armFlexedCm: 36, forearmCm: 28,
            chestMesosternaleCm: 100, waistCm: 84, thighCm: 56, calfCm: 38,
        },
        breadths: {
            biacromialCm: 41, biiliocristalCm: 28, humerusCm: 7.0, femurCm: 9.6,
            transverseChestCm: 29, apChestDepthCm: 20,
        },
    })
    const isakMetric = ({ weight, adipose, muscle, bone, residual, skin, predicted, endo, meso, ecto, bfPct, density }) => {
        const pct = (kg) => Math.round((kg / weight) * 1000) / 10
        return {
            fractionation: {
                adipose: { kg: adipose, pct: pct(adipose) },
                muscle: { kg: muscle, pct: pct(muscle) },
                bone: { kg: bone, pct: pct(bone) },
                residual: { kg: residual, pct: pct(residual) },
                skin: { kg: skin, pct: pct(skin) },
                predictedMassKg: predicted,
                measuredWeightKg: weight,
                massDifferenceKg: Math.round((weight - predicted) * 10) / 10,
            },
            somatotype: { endomorphy: endo, mesomorphy: meso, ectomorphy: ecto },
            bodyFat: { equation: 'durnin_womersley', percent: bfPct, bodyDensity: density },
            equationUsed: 'durnin_womersley + kerr_5c',
        }
    }
    const isakSeries = [
        { daysAgo: 45, weight: 77.0, adipose: 18.0, muscle: 35.0, bone: 9.5, residual: 10.5, skin: 4.0, predicted: 77.0, endo: 4.2, meso: 4.8, ecto: 2.1, bfPct: 22.0, density: 1.048 },
        { daysAgo: 5, weight: 75.0, adipose: 15.5, muscle: 35.6, bone: 9.5, residual: 10.4, skin: 4.0, predicted: 75.0, endo: 3.6, meso: 5.1, ecto: 2.4, bfPct: 19.5, density: 1.055 },
    ]
    const isakRows = isakSeries.map((s) => ({
        client_id: clientId,
        coach_id: COACH_ID,
        created_by: COACH_ID,
        team_id: null,
        org_id: null,
        method: 'isak',
        source: 'manual',
        is_validated: true,
        device_brand: null,
        device_model: null,
        equation_used: 'durnin_womersley + kerr_5c',
        measured_at: tsAt(s.daysAgo, 10, 0),
        height_cm: 178,
        weight_kg: s.weight,
        consent_confirmed_at: tsAt(s.daysAgo, 10, 0),
        metrics: isakMetric(s),
        raw_input: isakRaw(s.weight),
        measurement_conditions: { measured_by: 'ISAK L1', site: 'studio' },
    }))

    must(await admin.from('body_composition_measurements').insert([...biaRows, ...isakRows]), 'body_composition_measurements insert')
    track('body_composition_measurements', true, biaRows.length + isakRows.length)
}

// --- Movimiento: 2 finales FMS con items ------------------------------------
async function seedMovement(admin, clientId) {
    const existing = must(
        await admin.from('movement_assessments').select('id').eq('client_id', clientId).limit(1),
        'movement_assessments select'
    )
    if (existing.length > 0) {
        track('movement_assessments', false)
        return
    }

    // Cada item: {pattern, perSide, L, R, single} -> final = perSide ? min(L,R) : single
    const buildItems = (defs) =>
        defs.map((d) => {
            const final = d.perSide ? Math.min(d.L, d.R) : d.single
            return {
                pattern: d.pattern,
                is_per_side: d.perSide,
                score_left: d.perSide ? d.L : null,
                score_right: d.perSide ? d.R : null,
                score_single: d.perSide ? null : d.single,
                final_score: final,
                pain: false,
                clearing_positive: ['shoulder_mobility', 'trunk_stability_pushup', 'rotary_stability'].includes(d.pattern) ? false : null,
                comment: null,
            }
        })

    const assessments = [
        {
            daysAgo: 45,
            risk_band: 'moderate',
            has_asymmetry: true,
            defs: [
                { pattern: 'deep_squat', perSide: false, single: 2 },
                { pattern: 'hurdle_step', perSide: true, L: 2, R: 2 },
                { pattern: 'inline_lunge', perSide: true, L: 2, R: 1 },
                { pattern: 'shoulder_mobility', perSide: true, L: 2, R: 2 },
                { pattern: 'active_straight_leg_raise', perSide: true, L: 2, R: 2 },
                { pattern: 'trunk_stability_pushup', perSide: false, single: 2 },
                { pattern: 'rotary_stability', perSide: true, L: 1, R: 2 },
            ],
        },
        {
            daysAgo: 5,
            risk_band: 'low',
            has_asymmetry: true,
            defs: [
                { pattern: 'deep_squat', perSide: false, single: 3 },
                { pattern: 'hurdle_step', perSide: true, L: 2, R: 2 },
                { pattern: 'inline_lunge', perSide: true, L: 2, R: 2 },
                { pattern: 'shoulder_mobility', perSide: true, L: 3, R: 3 },
                { pattern: 'active_straight_leg_raise', perSide: true, L: 3, R: 2 },
                { pattern: 'trunk_stability_pushup', perSide: false, single: 2 },
                { pattern: 'rotary_stability', perSide: true, L: 2, R: 2 },
            ],
        },
    ]

    for (const a of assessments) {
        const items = buildItems(a.defs)
        const composite = items.reduce((sum, it) => sum + it.final_score, 0)
        const assessment = must(
            await admin
                .from('movement_assessments')
                .insert({
                    client_id: clientId,
                    coach_id: COACH_ID,
                    team_id: null,
                    status: 'final',
                    assessed_at: tsAt(a.daysAgo, 11, 0),
                    composite_score: composite,
                    has_pain: false,
                    has_asymmetry: a.has_asymmetry,
                    risk_band: a.risk_band,
                    consent_confirmed_at: tsAt(a.daysAgo, 11, 0),
                    notes: 'Screening DEMO (FMS).',
                    last_edited_by: COACH_ID,
                })
                .select('id')
                .single(),
            'movement_assessments insert'
        )
        track('movement_assessments', true)
        must(
            await admin.from('movement_assessment_items').insert(items.map((it) => ({ ...it, assessment_id: assessment.id }))),
            'movement_assessment_items insert'
        )
        track('movement_assessment_items', true, items.length)
    }
}

// --- Main -------------------------------------------------------------------
async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
        process.exit(1)
    }
    if (!process.argv.includes('--allow-remote') || process.env.JOSEFIT_SEED_CONFIRM !== 'yes') {
        console.error(
            'Escribe en la Supabase REMOTA (prod). Requiere AMBOS gates:\n' +
            '  1) flag --allow-remote\n' +
            "  2) env JOSEFIT_SEED_CONFIRM='yes'\nAbortando."
        )
        process.exit(1)
    }

    console.log(`Target Supabase: ${url}`)
    console.log('Continuando en 3 segundos... (Ctrl+C para abortar)')
    await new Promise((r) => setTimeout(r, 3000))

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    // Verificar coach
    const coach = must(
        await admin.from('coaches').select('id, slug, enabled_modules').eq('id', COACH_ID).maybeSingle(),
        'coaches verify'
    )
    if (!coach) throw new Error(`Coach josefit ${COACH_ID} no existe en prod`)
    console.log(`Coach OK: slug=${coach.slug} modulos=${JSON.stringify(coach.enabled_modules)}`)

    // Catalogo de sistema
    const exercises = must(
        await admin.from('exercises').select('id, name').is('coach_id', null).is('org_id', null).is('deleted_at', null).limit(10),
        'exercises select'
    )
    if (exercises.length < 4) throw new Error(`Se necesitan >=4 ejercicios de sistema; hay ${exercises.length}`)
    const exerciseNameById = new Map(exercises.map((e) => [e.id, e.name]))

    const foods = must(
        await admin.from('foods').select('id, name, serving_unit').is('coach_id', null).is('org_id', null).limit(12),
        'foods select'
    )
    if (foods.length < 4) throw new Error(`Se necesitan >=4 alimentos de sistema; hay ${foods.length}`)

    // Alumno
    console.log('== Creando alumno demo ==')
    const user = await ensureUser(admin, ALUMNO_EMAIL, ALUMNO_NAME, ALUMNO_PASSWORD)
    await ensureClient(admin, user)
    await ensureClientAccount(admin, user.id)
    await ensureMembership(admin, { accountId: user.id, clientId: user.id })
    await ensureConsent(admin, user.id)

    console.log('== Contenido ==')
    await seedIntake(admin, user.id)
    await seedWorkout(admin, { clientId: user.id, exercises, exerciseNameById })
    await seedNutrition(admin, { clientId: user.id, foods })
    await seedCheckIns(admin, user.id)
    await seedDailyHabits(admin, user.id)
    await seedBodyComp(admin, user.id)
    await seedMovement(admin, user.id)

    console.log('\n=== LISTO ===')
    console.log(JSON.stringify({
        login_url: `${url.includes('localhost') ? url : 'http://localhost:3000'}/c/josefit/login`,
        email: ALUMNO_EMAIL,
        password: ALUMNO_PASSWORD,
        client_id: user.id,
        coach_slug: coach.slug,
        counts,
    }, null, 2))
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
