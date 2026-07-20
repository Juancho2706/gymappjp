/**
 * seed-josefit-design-qa.mjs
 * ---------------------------------------------------------------------------
 * Seeds PROD coach "josefit" (coach_id 503412d0-77cc-4c7e-b1c2-dec81fb00ce6)
 * with ~12 STANDALONE students spanning every state the coach dashboard +
 * /coach/clients directory can render:
 *   - 7 "Al día"  (On track, score < 25, adherence 70-95%, recent activity)
 *   - 2 "En riesgo" (Riesgo badge, score >= 50, recent workouts but flagged)
 *   - 3 "Atrasada" (Atención badge, score 25-49, no activity 9/19/33 days)
 *
 * Authorized by the CEO (josefit is his test account).
 *
 * REVERSIBLE: every created client id is tracked in
 *   scripts/seed-josefit-design-qa.json
 * Run `node scripts/seed-josefit-design-qa.mjs --down` to delete everything.
 *
 * IDEMPOTENT: re-running wipes each QA client's children and recreates them.
 *
 * GUARDRAIL: touches ONLY clients whose email ends with @josefit-designqa.cl
 * under coach_id 503412d0. Never touches other coaches or billing rows.
 *
 * State drivers (verified against apps/web/src/services/dashboard.service.ts):
 *   attentionScore  = calculateAttentionScore() flags:
 *       SIN_CHECKIN_1M  +25  (check_ins.created_at within 35d fetch AND >30d old)
 *       SIN_EJERCICIO_7D +25 (active program AND last workout >=7d / none)
 *       NUTRICION_RIESGO +20 (nutrition compliance < 60)
 *       PROGRAMA_VENCIDO +15 (planDaysRemaining <= 0)
 *       PROGRAMA_POR_VENCER +8 (1..3 days remaining)
 *       FUERZA_CAYENDO  +15  (Epley 1RM this-week vs prev-week < -5%)
 *   severity badge: >=50 Riesgo, >=25 Atención, else On track (DirRowCard.tsx)
 *   adherence %  = workout_logs rows in last 7d / SUM(workout_blocks.sets)
 *   nutrition %  = sum(completed meals) / sum(applicable meals) over ~8d window
 *   last activity= MAX(workout_logs.logged_at) within last 35 days
 *   week "Sem N" = floor((now-start_date)/7)+1 capped at weeks_to_repeat
 *   streak       = consecutive days (workout OR completed nutrition) to today/ayer
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, 'seed-josefit-design-qa.json')
const COACH_ID = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6'
const EMAIL_DOMAIN = 'josefit-designqa.cl'

// ── env ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const CLIENT_PASSWORD = env.E2E_PERSONAS_PASSWORD
if (!CLIENT_PASSWORD || CLIENT_PASSWORD.length < 8) {
  throw new Error('Falta E2E_PERSONAS_PASSWORD (mínimo 8 caracteres) en .env.local.')
}

// clients.id is a FK to auth.users(id) — every client needs an auth user.
async function getOrCreateAuthUser(email) {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: CLIENT_PASSWORD,
    email_confirm: true,
  })
  if (!error) return data.user.id
  // Duplicate (orphan auth user from a prior partial run): find it by paging.
  for (let page = 1; page <= 50; page++) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    const hit = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (!list || list.users.length < 200) break
  }
  throw new Error(`auth user create/find failed for ${email}: ${error.message}`)
}

async function deleteAuthUser(id) {
  try {
    await sb.auth.admin.deleteUser(id)
  } catch {
    /* best-effort */
  }
}

// Real exercise catalog ids (for workout_blocks.exercise_id FK).
const EXERCISE_IDS = [
  '906f761d-de76-46c0-b6e4-1a1f1558d19f',
  '0d69844c-d80e-4315-bf74-1eacf49a1c82',
  '2e7fd87e-0e44-47f9-a6e2-ade289915ff1',
  '62fe73c7-faa6-4100-b331-c75136d1dfef',
  'ef7c3695-6b74-423e-b2d3-710ef13300b7',
  'ccbaa7c1-fc67-4e81-a5c6-49a2e9399614',
  'c6df780b-0e6d-426e-a33c-2390477367fa',
  '505ab226-19b7-4cf9-89a6-628f8d5bda80',
]

const DAY = 86_400_000
const NOW = Date.now()
const isoAgo = (daysAgo, ms = 0) => new Date(NOW - daysAgo * DAY - ms).toISOString()
// Santiago YYYY-MM-DD for a given daysAgo (nutrition log_date).
const ymdAgo = (daysAgo) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    new Date(NOW - daysAgo * DAY)
  )
const dateOnlyAgo = (daysAgo) => ymdAgo(daysAgo) // workout_programs.start/end are DATE

// ── student definitions ──────────────────────────────────────────────────────
// week/total drive "Sem N/total"; endInDays overrides end_date (for por_vencer).
// week[]   : this-week (<7d) workout set-rows  {d:daysAgo, n:rows, w:kg, r:reps}
// older[]  : older set-rows (history / 1RM prev-week / atrasada last-workout)
// meals    : 8-length array index0=today..7=7d ago, count of 4 meals completed (null = none)
// checkins : {d:daysAgo, kg, e:energy}
const STUDENTS = [
  // ───────────── 7 AL DÍA (On track, score < 25) ─────────────
  {
    key: 'cat-rojas', name: 'Catalina Rojas', phone: '+56961112201', energy: 4,
    program: { name: 'Hipertrofia Avanzada', week: 3, total: 8 },
    week: [{ d: 0, n: 8, w: 40, r: 10 }, { d: 2, n: 8, w: 42, r: 10 }, { d: 4, n: 6, w: 45, r: 8 }],
    older: [], meals: [2, 4, 4, 4, 4, 4, 3, 3],
    checkins: [{ d: 2, kg: 72.4, e: 4 }, { d: 12, kg: 73.0, e: 4 }, { d: 26, kg: 73.6, e: 3 }],
    expect: 'Al día',
  },
  {
    key: 'martin-soto', name: 'Martín Soto', phone: '+56961112202', energy: 4,
    program: { name: 'Fuerza 5x5', week: 2, total: 6 },
    week: [{ d: 1, n: 7, w: 60, r: 5 }, { d: 3, n: 6, w: 62, r: 5 }, { d: 5, n: 6, w: 64, r: 5 }],
    older: [], meals: [3, 4, 3, 4, 3, 3, 2, 2],
    checkins: [{ d: 5, kg: 81.3, e: 4 }, { d: 15, kg: 81.0, e: 3 }, { d: 28, kg: 80.6, e: 4 }],
    expect: 'Al día',
  },
  {
    key: 'valentina-perez', name: 'Valentina Pérez', phone: '+56961112203', energy: 5,
    program: { name: 'Recomposición Corporal', week: 5, total: 12 },
    week: [{ d: 0, n: 7, w: 30, r: 12 }, { d: 2, n: 7, w: 32, r: 12 }, { d: 4, n: 6, w: 34, r: 10 }],
    older: [], meals: [4, 4, 4, 3, 3, 4, 2, 2],
    checkins: [{ d: 1, kg: 64.1, e: 5 }, { d: 13, kg: 65.3, e: 4 }, { d: 27, kg: 66.0, e: 4 }],
    expect: 'Al día',
  },
  {
    key: 'diego-munoz', name: 'Diego Muñoz', phone: '+56961112204', energy: 3,
    program: { name: 'Volumen Limpio', week: 4, total: 10 },
    week: [{ d: 2, n: 6, w: 50, r: 8 }, { d: 4, n: 6, w: 52, r: 8 }, { d: 6, n: 5, w: 54, r: 8 }],
    older: [], meals: [2, 3, 3, 3, 3, 4, 2, 2],
    checkins: [{ d: 8, kg: 88.5, e: 3 }, { d: 18, kg: 88.0, e: 3 }, { d: 29, kg: 87.6, e: 4 }],
    expect: 'Al día',
  },
  {
    key: 'francisca-diaz', name: 'Francisca Díaz', phone: '+56961112205', energy: 5,
    program: { name: 'Definición Verano', week: 6, total: 8 },
    week: [{ d: 0, n: 8, w: 35, r: 12 }, { d: 2, n: 8, w: 36, r: 12 }, { d: 4, n: 7, w: 38, r: 10 }],
    older: [], meals: [3, 4, 4, 4, 4, 4, 3, 3],
    checkins: [{ d: 1, kg: 58.9, e: 5 }, { d: 12, kg: 59.4, e: 4 }, { d: 25, kg: 60.1, e: 4 }],
    expect: 'Al día',
  },
  {
    key: 'tomas-fuentes', name: 'Tomás Fuentes', phone: '+56961112206', energy: 4,
    program: { name: 'Full Body 3x Semana', week: 1, total: 6 },
    week: [{ d: 0, n: 6, w: 70, r: 8 }, { d: 3, n: 6, w: 72, r: 8 }, { d: 5, n: 6, w: 74, r: 6 }],
    older: [], meals: [3, 3, 3, 3, 4, 3, 2, 2],
    checkins: [{ d: 12, kg: 79.2, e: 4 }, { d: 22, kg: 79.0, e: 3 }, { d: 30, kg: 78.7, e: 4 }],
    expect: 'Al día',
  },
  {
    key: 'javiera-castro', name: 'Javiera Castro', phone: '+56961112207', energy: 5,
    program: { name: 'Glúteos & Piernas', week: 7, total: 12 },
    week: [{ d: 1, n: 7, w: 45, r: 10 }, { d: 2, n: 7, w: 47, r: 10 }, { d: 4, n: 7, w: 49, r: 8 }],
    older: [], meals: [3, 4, 4, 4, 4, 3, 3, 2],
    checkins: [{ d: 4, kg: 67.2, e: 5 }, { d: 14, kg: 68.1, e: 4 }, { d: 28, kg: 68.9, e: 4 }],
    expect: 'Al día',
  },

  // ───────────── 2 EN RIESGO (Riesgo badge, score >= 50) ─────────────
  {
    // 58% adher + nutrition 50% (+20) + checkin 33d (+25) + por_vencer (+8) = 53
    key: 'constanza-vidal', name: 'Constanza Vidal', phone: '+56961112208', energy: 3,
    program: { name: 'Reto 8 Semanas', week: 8, total: 8, endInDays: 2 },
    week: [{ d: 2, n: 7, w: 55, r: 8 }, { d: 5, n: 7, w: 57, r: 8 }],
    older: [], meals: [2, 2, 2, 2, 2, 2, 2, 2],
    checkins: [{ d: 33, kg: 80.0, e: 3 }],
    expect: 'En riesgo',
  },
  {
    // 62% adher + nutrition 47% (+20) + checkin 32d (+25) + fuerza cayendo (+15) = 60
    key: 'ignacio-herrera', name: 'Ignacio Herrera', phone: '+56961112209', energy: 2,
    program: { name: 'Powerbuilding', week: 4, total: 10 },
    week: [{ d: 1, n: 8, w: 90, r: 5 }, { d: 4, n: 7, w: 92, r: 5 }],
    older: [{ d: 8, n: 6, w: 104, r: 5 }, { d: 10, n: 6, w: 106, r: 5 }], // heavier prev-week -> 1RM declining
    meals: [1, 2, 2, 2, 2, 2, 2, 2],
    checkins: [{ d: 32, kg: 88.0, e: 2 }],
    expect: 'En riesgo',
  },

  // ───────────── 3 ATRASADA (Atención badge, score 25-49, no recent activity) ─────────────
  {
    // last workout 9d ago (+25 SIN_EJERCICIO) + nutrition 0 (+20) = 45 -> Atención
    key: 'rodrigo-nunez', name: 'Rodrigo Núñez', phone: '+56961112210', energy: 3,
    program: { name: 'Hipertrofia Total', week: 2, total: 8 },
    week: [],
    older: [{ d: 9, n: 6, w: 50, r: 8 }, { d: 11, n: 6, w: 50, r: 8 }, { d: 13, n: 5, w: 48, r: 8 }],
    meals: null, checkins: [{ d: 9, kg: 75.0, e: 3 }],
    expect: 'Atrasada',
  },
  {
    // last workout 19d ago -> Atención
    key: 'camila-espinoza', name: 'Camila Espinoza', phone: '+56961112211', energy: 2,
    program: { name: 'Reto Verano', week: 3, total: 10 },
    week: [],
    older: [{ d: 19, n: 6, w: 40, r: 10 }, { d: 21, n: 5, w: 40, r: 10 }],
    meals: null, checkins: [{ d: 16, kg: 68.0, e: 3 }],
    expect: 'Atrasada',
  },
  {
    // last workout 33d ago (still <35d fetch -> "Hace 33d") -> Atención
    key: 'felipe-araya', name: 'Felipe Araya', phone: '+56961112212', energy: 2,
    program: { name: 'Iniciación Fuerza', week: 5, total: 12 },
    week: [],
    older: [{ d: 33, n: 6, w: 60, r: 5 }, { d: 34, n: 5, w: 60, r: 5 }],
    meals: null, checkins: [{ d: 25, kg: 90.0, e: 2 }],
    expect: 'Atrasada',
  },
]

const emailFor = (s) => `qa-${s.key}@${EMAIL_DOMAIN}`

// Macro targets per plan (no food_items -> consumed derived from target * completion ratio).
const NUTRI_TARGET = { cal: 2100, prot: 150, carb: 210, fat: 70 }
const MEAL_NAMES = ['Desayuno', 'Almuerzo', 'Once', 'Cena']

// ── child wipe (idempotency + reversal) ──────────────────────────────────────
async function wipeClientChildren(clientId) {
  // nutrition_meal_logs via daily logs
  const { data: dls } = await sb.from('daily_nutrition_logs').select('id').eq('client_id', clientId)
  const dlIds = (dls ?? []).map((r) => r.id)
  if (dlIds.length) await sb.from('nutrition_meal_logs').delete().in('daily_log_id', dlIds)
  await sb.from('daily_nutrition_logs').delete().eq('client_id', clientId)
  const { data: nps } = await sb.from('nutrition_plans').select('id').eq('client_id', clientId)
  const npIds = (nps ?? []).map((r) => r.id)
  if (npIds.length) await sb.from('nutrition_meals').delete().in('plan_id', npIds)
  await sb.from('nutrition_plans').delete().eq('client_id', clientId)
  // workout: logs -> blocks -> plans -> programs
  await sb.from('workout_logs').delete().eq('client_id', clientId)
  const { data: pls } = await sb.from('workout_plans').select('id').eq('client_id', clientId)
  const plIds = (pls ?? []).map((r) => r.id)
  if (plIds.length) await sb.from('workout_blocks').delete().in('plan_id', plIds)
  await sb.from('workout_plans').delete().eq('client_id', clientId)
  await sb.from('workout_programs').delete().eq('client_id', clientId)
  await sb.from('check_ins').delete().eq('client_id', clientId)
}

async function findClientByEmail(email) {
  const { data } = await sb
    .from('clients')
    .select('id')
    .eq('coach_id', COACH_ID)
    .eq('email', email)
    .maybeSingle()
  return data?.id ?? null
}

// ── DOWN ─────────────────────────────────────────────────────────────────────
async function down() {
  let clientIds = []
  if (existsSync(MANIFEST_PATH)) {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    clientIds = (m.students ?? []).map((s) => s.clientId).filter(Boolean)
  }
  // Also catch any QA clients not in manifest (defensive).
  const { data: stray } = await sb
    .from('clients')
    .select('id,email')
    .eq('coach_id', COACH_ID)
    .like('email', `%@${EMAIL_DOMAIN}`)
  for (const r of stray ?? []) if (!clientIds.includes(r.id)) clientIds.push(r.id)

  for (const cid of clientIds) {
    await wipeClientChildren(cid)
    await sb.from('clients').delete().eq('id', cid).eq('coach_id', COACH_ID)
    await deleteAuthUser(cid) // client id === auth user id
  }
  console.log(`DOWN complete — removed ${clientIds.length} QA clients + auth users + all children.`)
}

// ── UP ───────────────────────────────────────────────────────────────────────
async function up() {
  const manifest = {
    coach_id: COACH_ID,
    seededAt: new Date().toISOString(),
    emailDomain: EMAIL_DOMAIN,
    note: 'Design/QA seed for josefit. Reverse with: node scripts/seed-josefit-design-qa.mjs --down',
    students: [],
  }

  for (const s of STUDENTS) {
    const email = emailFor(s)
    let clientId = await findClientByEmail(email)
    if (clientId) {
      await wipeClientChildren(clientId)
      await sb
        .from('clients')
        .update({ full_name: s.name, phone: s.phone, is_active: true, is_archived: false })
        .eq('id', clientId)
    } else {
      const authUserId = await getOrCreateAuthUser(email)
      const { data, error } = await sb
        .from('clients')
        .insert({
          id: authUserId,
          coach_id: COACH_ID,
          full_name: s.name,
          email,
          phone: s.phone,
          org_id: null,
          team_id: null,
          is_active: true,
          is_archived: false,
          onboarding_completed: true,
          force_password_change: false,
          use_coach_brand_colors: true,
        })
        .select('id')
        .single()
      if (error) throw new Error(`client insert ${s.key}: ${error.message}`)
      clientId = data.id
    }

    // ── workout_program ──
    const startDaysAgo = (s.program.week - 1) * 7 + 3
    const startDate = dateOnlyAgo(startDaysAgo)
    const endDate =
      s.program.endInDays != null
        ? dateOnlyAgo(-s.program.endInDays) // future
        : dateOnlyAgo(startDaysAgo - s.program.total * 7)
    const { data: prog, error: pErr } = await sb
      .from('workout_programs')
      .insert({
        client_id: clientId,
        coach_id: COACH_ID,
        name: s.program.name,
        weeks_to_repeat: s.program.total,
        start_date: startDate,
        end_date: endDate,
        is_active: true,
        duration_type: 'weeks',
        program_structure_type: 'weekly',
        created_by_coach_id: COACH_ID,
        last_edited_by_coach_id: COACH_ID,
      })
      .select('id')
      .single()
    if (pErr) throw new Error(`program ${s.key}: ${pErr.message}`)

    // ── 4 plans (Lun/Mar/Jue/Vie) x 2 blocks x 3 sets = 24 planned sets ──
    const planRows = [1, 2, 4, 5].map((dow, i) => ({
      client_id: clientId,
      coach_id: COACH_ID,
      program_id: prog.id,
      title: `${s.program.name} — Día ${i + 1}`,
      group_name: 'Programa de Entrenamiento',
      day_of_week: dow,
      week_variant: 'A',
      assigned_date: startDate,
    }))
    const { data: plans, error: plErr } = await sb.from('workout_plans').insert(planRows).select('id')
    if (plErr) throw new Error(`plans ${s.key}: ${plErr.message}`)

    const blockRows = []
    plans.forEach((pl, pi) => {
      for (let b = 0; b < 2; b++) {
        blockRows.push({
          plan_id: pl.id,
          exercise_id: EXERCISE_IDS[(pi * 2 + b) % EXERCISE_IDS.length],
          order_index: b,
          sets: 3,
          reps: '8-12',
          rest_time: '90s',
          progression_type: 'weight',
          progression_value: 2.5,
          section: 'main',
        })
      }
    })
    const { data: blocks, error: bErr } = await sb.from('workout_blocks').insert(blockRows).select('id')
    if (bErr) throw new Error(`blocks ${s.key}: ${bErr.message}`)
    const blockIds = blocks.map((b) => b.id)

    // ── workout_logs (each row = one logged set) ──
    const logRows = []
    let bi = 0
    const pushSession = (d, n, w, r) => {
      for (let k = 0; k < n; k++) {
        logRows.push({
          block_id: blockIds[bi % blockIds.length],
          client_id: clientId,
          set_number: (k % 3) + 1,
          weight_kg: w,
          reps_done: r,
          rpe: 8,
          rir: 2,
          logged_at: isoAgo(d, k * 60_000), // stagger within the day
          plan_name_at_log: s.program.name,
        })
        bi++
      }
    }
    for (const ses of s.week) pushSession(ses.d, ses.n, ses.w, ses.r)
    for (const ses of s.older) pushSession(ses.d, ses.n, ses.w, ses.r)
    if (logRows.length) {
      const { error: lErr } = await sb.from('workout_logs').insert(logRows)
      if (lErr) throw new Error(`logs ${s.key}: ${lErr.message}`)
    }

    // ── nutrition: plan + 4 daily meals (day_of_week null) + daily logs + meal logs ──
    let nutritionPlanId = null
    if (s.meals) {
      const { data: np, error: npErr } = await sb
        .from('nutrition_plans')
        .insert({
          client_id: clientId,
          coach_id: COACH_ID,
          name: `Plan Nutricional — ${s.name.split(' ')[0]}`,
          daily_calories: NUTRI_TARGET.cal,
          protein_g: NUTRI_TARGET.prot,
          carbs_g: NUTRI_TARGET.carb,
          fats_g: NUTRI_TARGET.fat,
          is_active: true,
          plan_mode: 'grams',
        })
        .select('id')
        .single()
      if (npErr) throw new Error(`nutrition_plan ${s.key}: ${npErr.message}`)
      nutritionPlanId = np.id

      const mealRows = MEAL_NAMES.map((name, i) => ({
        plan_id: np.id,
        name,
        order_index: i,
        day_of_week: null, // applies every day
      }))
      const { data: meals, error: mErr } = await sb.from('nutrition_meals').insert(mealRows).select('id')
      if (mErr) throw new Error(`meals ${s.key}: ${mErr.message}`)
      const mealIds = meals.map((m) => m.id)

      for (let d = 0; d < s.meals.length; d++) {
        const completed = s.meals[d]
        if (completed <= 0) continue
        const { data: dl, error: dlErr } = await sb
          .from('daily_nutrition_logs')
          .insert({
            client_id: clientId,
            plan_id: np.id,
            log_date: ymdAgo(d),
            plan_name_at_log: `Plan Nutricional — ${s.name.split(' ')[0]}`,
            target_calories_at_log: NUTRI_TARGET.cal,
            target_protein_at_log: NUTRI_TARGET.prot,
            target_carbs_at_log: NUTRI_TARGET.carb,
            target_fats_at_log: NUTRI_TARGET.fat,
            created_at: isoAgo(d),
          })
          .select('id')
          .single()
        if (dlErr) throw new Error(`daily_log ${s.key} d${d}: ${dlErr.message}`)
        const mealLogRows = mealIds.slice(0, completed).map((mid) => ({
          daily_log_id: dl.id,
          meal_id: mid,
          is_completed: true,
          created_at: isoAgo(d),
        }))
        const { error: mlErr } = await sb.from('nutrition_meal_logs').insert(mealLogRows)
        if (mlErr) throw new Error(`meal_logs ${s.key} d${d}: ${mlErr.message}`)
      }
    }

    // ── check_ins (weight + energy) ──
    const checkRows = s.checkins.map((c) => ({
      client_id: clientId,
      date: isoAgo(c.d),
      created_at: isoAgo(c.d),
      weight: c.kg,
      energy_level: c.e,
      notes: 'QA design seed',
    }))
    if (checkRows.length) {
      const { error: cErr } = await sb.from('check_ins').insert(checkRows)
      if (cErr) throw new Error(`check_ins ${s.key}: ${cErr.message}`)
    }

    manifest.students.push({
      email,
      clientId,
      name: s.name,
      expect: s.expect,
      programId: prog.id,
      program: `${s.program.name} (Sem ${s.program.week}/${s.program.total})`,
      nutritionPlanId,
      workoutLogRows: logRows.length,
    })
    console.log(`  seeded ${s.name.padEnd(20)} [${s.expect}]  clientId=${clientId}`)
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`\nUP complete — ${manifest.students.length} students. Manifest: ${MANIFEST_PATH}`)
}

const mode = process.argv.includes('--down') ? 'down' : 'up'
;(mode === 'down' ? down() : up()).catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
