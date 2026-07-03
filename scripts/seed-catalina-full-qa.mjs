/**
 * seed-catalina-full-qa.mjs
 * ---------------------------------------------------------------------------
 * "Showcase" QA² seed for josefit's student Catalina Rojas (PROD, service-role).
 * Authorized by the CEO (same pattern as scripts/seed-josefit-design-qa.mjs).
 *
 * GOAL: exercise EVERY component of the student (alumno) view + a RICH workout
 * that stresses the recently-shipped "Fase M" (typed blocks: superseries,
 * cardio zones, isometric holds, per-exercise progression, warmup rest, per-set
 * notes, program phases).
 *
 * WHAT IT SEEDS (INSERT-only, plus ONE documented is_active flip):
 *   1. New ACTIVE program "QA² Power Building" (weekly, 6 wks, started 25d ago =>
 *      currentWeek 4 => Intensificación phase). Deactivates her current active
 *      program and records its id to restore on --down.
 *   2. 4 training days (Lun/Mié/Vie/Sáb). Vie (day_of_week=5) == TODAY and is the
 *      richest day (2 superseries + core) so the CEO can train it today.
 *   3. ~3 weeks of workout_logs on the strength/cardio/hold blocks with weekly
 *      progression, a clear press-banca PR yesterday, RPE/RIR, one per-set note
 *      ("molestia leve en el hombro izquierdo"), last session = YESTERDAY, none today.
 *   4. Nutrition: POPULATES her 4 existing (previously-empty) meals with real catalog
 *      foods — 4 items each, ~2047 kcal/day (P150·C211·F68), matching her 2100/150/210/70
 *      target — so the alumno view stops showing "sin alimentos". Plus yesterday partial
 *      meal logs (2/4, one at 50% portion + satisfaction), a today breakfast log, and 7 days
 *      of daily_habits (agua/pasos/sueño...).
 *   5. 2 new photo-less check-ins (72.9 -> 72.4). Existing check-ins untouched.
 *
 * REVERSIBLE: every created id is tracked in scripts/seed-catalina-full-qa.json.
 *   node scripts/seed-catalina-full-qa.mjs          # up (idempotent: cleans its
 *                                                   #     own prior QA² run first)
 *   node scripts/seed-catalina-full-qa.mjs --down   # remove everything + restore
 *                                                   #     the previously-active program
 *
 * GUARDRAILS:
 *   - Marker: program name is prefixed "QA² ".
 *   - Touches ONLY Catalina (client ba265b0b…) under coach josefit (503412d0…).
 *   - Reuses her EXISTING active nutrition plan + meals (never deletes/creates them); only
 *     ADDS food_items to the (empty) meals — reversible by id on --down.
 *   - Never deletes data it did not create (prior josefit-designqa seed is left intact).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = join(__dirname, 'seed-catalina-full-qa.json')
const COACH_ID = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6'
const CLIENT_ID = 'ba265b0b-7ee2-4de1-a1c8-2a22418061e9' // Catalina Rojas
const PROGRAM_NAME = 'QA² Power Building'
const PROGRAM_MARKER = 'QA² ' // any program name starting with this is ours

// ── env / client (service-role, bypasses RLS — this is a seed) ───────────────
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

// ── time helpers (Santiago is the operational tz) ────────────────────────────
const DAY = 86_400_000
const NOW = Date.now()
const isoAgo = (daysAgo, ms = 0) => new Date(NOW - daysAgo * DAY - ms).toISOString()
const ymdAgo = (daysAgo) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(NOW - daysAgo * DAY))
const dateOnlyAgo = (daysAgo) => ymdAgo(daysAgo) // DATE columns (start/end/assigned)

// ── real catalog ids (verified against PROD; system + josefit) ───────────────
const EX = {
  press: { id: 'bca4d6e6-eceb-40cf-82a3-a30f78e11636', name: 'Press de banca con barra' },
  remo: { id: '7cef0d4f-987d-49ca-8dad-df763143236a', name: 'Remo inclinado con barra en banco' },
  squat: { id: '8bbfb499-78b4-42bd-91eb-145c72b12900', name: 'Sentadilla de barra alta' },
  catcamel: { id: '00000000-0000-0000-0f80-000000000009', name: 'Cat/Camel' },
  cinta: { id: '00000000-0000-0000-0ca0-000000000001', name: 'Carrera / trote en cinta de correr' },
  rotTorac: { id: '00000000-0000-0000-0f80-000000000007', name: 'Rotación torácica en cuadrupedia' },
  rollerIsq: { id: '00000000-0000-0000-0f80-000000000003', name: 'Foam roller – Isquiotibiales' },
  elevLat: { id: '68c175da-f8fe-4884-9e1c-d8eb9598fc56', name: 'Elevación lateral sentado con mancuernas' },
  remoT: { id: '2d2e4781-c5af-404a-a080-dbbf991b70a4', name: 'Remo en T en máquina' },
  vuelos: { id: '2f099f6a-76ab-405c-ac0a-4d0aedb19930', name: 'Vuelos inversos acostado en polea' },
  curl: { id: '2e7fd87e-0e44-47f9-a6e2-ade289915ff1', name: 'Curl de bíceps inclinado con mancuernas' },
  triceps: { id: '118a6070-25a9-457c-8e1a-feb6192a9821', name: 'Extensión de tríceps sobre la cabeza en polea alta con cuerda' },
  coreVup: { id: '567910f8-a85d-44ca-944c-774320b5aeae', name: 'Sit-up navaja / v-up' },
  bulgaria: { id: '59ad47a6-7b03-49d7-9195-19404964ac0e', name: 'Sentadilla búlgara con mancuernas' },
  plancha: { id: '62e38fb9-65b7-4343-8b4b-2b50745f8a4a', name: 'Plancha frontal con peso' },
  cuerda: { id: '00000000-0000-0000-0ca0-000000000007', name: 'Saltar la cuerda' },
}

// section_template_id (áreas). section string is the legacy CHECK: warmup|main|cooldown only.
const TMPL = {
  MOBILITY: '0000a5ec-0000-0000-0000-000000000005', // Movilidad
  CORE: '0000a5ec-0000-0000-0000-000000000006', // Activacion pilar central
  MAIN: '0000a5ec-0000-0000-0000-000000000010', // Principal
  CONDITIONING: '0000a5ec-0000-0000-0000-000000000030', // Acondicionamiento
  HYROX: '7f50ba89-9ccb-4014-a43f-3804c9e66ecd', // josefit CUSTOM área
}

// ── program timing ───────────────────────────────────────────────────────────
const START_DAYS_AGO = 25 // ceil(25/7)=4 => currentWeek 4 (Intensificación)
const TOTAL_WEEKS = 6

// ── block definitions per day (order matters: superset = same group + contiguous order_index) ──
// dow: 1=Lun 3=Mié 5=Vie(HOY) 6=Sáb. Día 3 (Vie) is today's richest workout.
const DAYS = [
  {
    key: 'd1', title: `${PROGRAM_NAME} — Día 1 · Empuje/Tracción`, dow: 1,
    blocks: [
      { key: 'd1_press', ex: EX.press, oi: 0, ss: 'A', section: 'main', tmpl: TMPL.MAIN, sets: 4, reps: '8-10', rest: '90s' },
      { key: 'd1_remo', ex: EX.remo, oi: 1, ss: 'A', section: 'main', tmpl: TMPL.MAIN, sets: 4, reps: '8-10', rest: '90s' },
      { key: 'd1_squat', ex: EX.squat, oi: 2, section: 'main', tmpl: TMPL.MAIN, sets: 5, reps: '5', rest: '150s', warmupRest: '45s', tempo: '3-1-2', rir: '2', prog: { mode: 'weekly_linear', type: 'weight', value: 2.5, target: 60 } },
      { key: 'd1_mob', ex: EX.catcamel, oi: 3, section: 'cooldown', tmpl: TMPL.MOBILITY, sets: 1, reps: '60s', override: 'mobility', duration_sec: 60 },
    ],
  },
  {
    key: 'd2', title: `${PROGRAM_NAME} — Día 2 · Cardio + Movilidad`, dow: 3,
    blocks: [
      { key: 'd2_cardio', ex: EX.cinta, oi: 0, section: 'main', tmpl: TMPL.CONDITIONING, sets: 1, reps: '25min Z2', rest: '0s', override: 'cardio', hr_zone: 2, duration_sec: 1500, distance_value: 4.5, distance_unit: 'km', target_pace_sec_per_km: 333 },
      { key: 'd2_mob', ex: EX.rotTorac, oi: 1, section: 'cooldown', tmpl: TMPL.MOBILITY, sets: 2, reps: '45s/lado', override: 'mobility', duration_sec: 45, side_mode: 'per_side' },
      { key: 'd2_roller', ex: EX.rollerIsq, oi: 2, section: 'cooldown', tmpl: TMPL.MOBILITY, sets: 1, reps: '60s', override: 'roller', duration_sec: 60 },
    ],
  },
  {
    key: 'd3', title: `${PROGRAM_NAME} — Día 3 · Hombro/Brazo (HOY)`, dow: 5,
    blocks: [
      // SUPERSERIE A (3 ej) en el ÁREA CUSTOM del coach: "Hyrox"
      { key: 'd3_a1', ex: EX.elevLat, oi: 0, ss: 'A', section: 'main', tmpl: TMPL.HYROX, sets: 3, reps: '12', rest: '60s' },
      { key: 'd3_a2', ex: EX.remoT, oi: 1, ss: 'A', section: 'main', tmpl: TMPL.HYROX, sets: 3, reps: '12', rest: '60s' },
      { key: 'd3_a3', ex: EX.vuelos, oi: 2, ss: 'A', section: 'main', tmpl: TMPL.HYROX, sets: 3, reps: '15', rest: '60s' },
      // SUPERSERIE B (2 ej) en Principal
      { key: 'd3_b1', ex: EX.curl, oi: 3, ss: 'B', section: 'main', tmpl: TMPL.MAIN, sets: 3, reps: '12-15', rest: '75s' },
      { key: 'd3_b2', ex: EX.triceps, oi: 4, ss: 'B', section: 'main', tmpl: TMPL.MAIN, sets: 3, reps: '12-15', rest: '75s' },
      // Core suelto (Activacion pilar central)
      { key: 'd3_core', ex: EX.coreVup, oi: 5, section: 'main', tmpl: TMPL.CORE, sets: 3, reps: '15', rest: '45s' },
    ],
  },
  {
    key: 'd4', title: `${PROGRAM_NAME} — Día 4 · Mixto`, dow: 6,
    blocks: [
      { key: 'd4_bulgaria', ex: EX.bulgaria, oi: 0, section: 'main', tmpl: TMPL.MAIN, sets: 3, reps: '10', rest: '90s' },
      // hold / isometría => exercise_type_override='mobility' + duration_sec (loguea actual_hold_sec)
      { key: 'd4_hold', ex: EX.plancha, oi: 1, section: 'main', tmpl: TMPL.CORE, sets: 3, reps: '45s', rest: '60s', override: 'mobility', duration_sec: 45 },
      { key: 'd4_cardio', ex: EX.cuerda, oi: 2, section: 'main', tmpl: TMPL.CONDITIONING, sets: 1, reps: '5min Z4', override: 'cardio', hr_zone: 4, duration_sec: 300 },
    ],
  },
]

// ── log history plan ─────────────────────────────────────────────────────────
// Each session: { d: daysAgo, sets: [ {key, kind, rows:[...] } ] }
// strength row: {w, r, rpe, rir?, note?}  cardio row: {durSec, distM?, hr?, pace?, rpe}  hold row: {holdSec, rpe}
const NOTE_SHOULDER = 'Sentí una molestia leve en el hombro izquierdo'
const SESSIONS = [
  // ---- week 1 (program start ~25d ago) ----
  { d: 24, sets: [
    { key: 'd1_press', kind: 's', rows: [{ w: 40, r: 10, rpe: 7 }, { w: 40, r: 10, rpe: 7 }, { w: 40, r: 9, rpe: 8 }, { w: 40, r: 8, rpe: 8 }] },
    { key: 'd1_remo', kind: 's', rows: [{ w: 45, r: 10, rpe: 7 }, { w: 45, r: 10, rpe: 7 }, { w: 45, r: 10, rpe: 8 }, { w: 45, r: 9, rpe: 8 }] },
    { key: 'd1_squat', kind: 's', rows: [{ w: 60, r: 5, rpe: 7, rir: 3 }, { w: 60, r: 5, rpe: 7, rir: 3 }, { w: 60, r: 5, rpe: 8, rir: 2 }, { w: 60, r: 5, rpe: 8, rir: 2 }, { w: 60, r: 5, rpe: 8, rir: 2 }] },
  ] },
  { d: 22, sets: [
    { key: 'd2_cardio', kind: 'c', rows: [{ durSec: 1500, distM: 4300, hr: 148, rpe: 6 }] },
  ] },
  { d: 20, sets: [
    { key: 'd3_a1', kind: 's', rows: [{ w: 10, r: 12, rpe: 7 }, { w: 10, r: 12, rpe: 7 }, { w: 10, r: 11, rpe: 8 }] },
    { key: 'd3_a2', kind: 's', rows: [{ w: 25, r: 10, rpe: 7 }, { w: 25, r: 10, rpe: 8 }, { w: 25, r: 10, rpe: 8 }] },
    { key: 'd3_a3', kind: 's', rows: [{ w: 7, r: 15, rpe: 7 }, { w: 7, r: 15, rpe: 8 }, { w: 7, r: 12, rpe: 8 }] },
    { key: 'd3_b1', kind: 's', rows: [{ w: 8, r: 12, rpe: 7 }, { w: 8, r: 12, rpe: 8 }, { w: 8, r: 10, rpe: 9 }] },
    { key: 'd3_b2', kind: 's', rows: [{ w: 18, r: 12, rpe: 7 }, { w: 18, r: 12, rpe: 8 }, { w: 18, r: 12, rpe: 8 }] },
    { key: 'd3_core', kind: 's', rows: [{ w: null, r: 15, rpe: 7 }, { w: null, r: 15, rpe: 8 }, { w: null, r: 12, rpe: 8 }] },
  ] },
  { d: 19, sets: [
    { key: 'd4_bulgaria', kind: 's', rows: [{ w: 20, r: 10, rpe: 7 }, { w: 20, r: 10, rpe: 8 }, { w: 20, r: 9, rpe: 8 }] },
    { key: 'd4_hold', kind: 'h', rows: [{ holdSec: 40, rpe: 7 }, { holdSec: 45, rpe: 8 }, { holdSec: 45, rpe: 8 }] },
    { key: 'd4_cardio', kind: 'c', rows: [{ durSec: 300, hr: 150, rpe: 6 }] },
  ] },
  // ---- week 2 ----
  { d: 13, sets: [
    { key: 'd1_press', kind: 's', rows: [{ w: 42.5, r: 9, rpe: 8 }, { w: 42.5, r: 9, rpe: 8 }, { w: 42.5, r: 8, rpe: 8 }, { w: 42.5, r: 8, rpe: 9 }] },
    { key: 'd1_remo', kind: 's', rows: [{ w: 47.5, r: 10, rpe: 7 }, { w: 47.5, r: 10, rpe: 8 }, { w: 47.5, r: 9, rpe: 8 }, { w: 47.5, r: 9, rpe: 9 }] },
    { key: 'd1_squat', kind: 's', rows: [{ w: 62.5, r: 5, rpe: 7, rir: 3 }, { w: 62.5, r: 5, rpe: 8, rir: 2 }, { w: 62.5, r: 5, rpe: 8, rir: 2 }, { w: 62.5, r: 5, rpe: 8, rir: 2 }, { w: 62.5, r: 5, rpe: 9, rir: 1 }] },
  ] },
  { d: 11, sets: [
    { key: 'd3_a1', kind: 's', rows: [{ w: 11, r: 12, rpe: 7 }, { w: 11, r: 12, rpe: 8 }, { w: 11, r: 12, rpe: 8 }] },
    { key: 'd3_a2', kind: 's', rows: [{ w: 27, r: 10, rpe: 8 }, { w: 27, r: 10, rpe: 8 }, { w: 27, r: 10, rpe: 8 }] },
    { key: 'd3_b1', kind: 's', rows: [{ w: 9, r: 12, rpe: 8 }, { w: 9, r: 12, rpe: 8 }, { w: 9, r: 11, rpe: 9 }] },
    { key: 'd3_b2', kind: 's', rows: [{ w: 19, r: 12, rpe: 8 }, { w: 19, r: 12, rpe: 8 }, { w: 19, r: 12, rpe: 8 }] },
  ] },
  { d: 10, sets: [
    { key: 'd2_cardio', kind: 'c', rows: [{ durSec: 1620, distM: 4600, hr: 151, rpe: 6 }] },
  ] },
  { d: 8, sets: [
    { key: 'd4_bulgaria', kind: 's', rows: [{ w: 22.5, r: 10, rpe: 8 }, { w: 22.5, r: 10, rpe: 8 }, { w: 22.5, r: 10, rpe: 9 }] },
    { key: 'd4_hold', kind: 'h', rows: [{ holdSec: 50, rpe: 7 }, { holdSec: 50, rpe: 8 }, { holdSec: 55, rpe: 8 }] },
  ] },
  // ---- week 3 (last week: the shoulder-note set) ----
  { d: 6, sets: [
    { key: 'd1_press', kind: 's', rows: [{ w: 45, r: 8, rpe: 8 }, { w: 45, r: 8, rpe: 8, note: NOTE_SHOULDER }, { w: 45, r: 8, rpe: 9 }, { w: 45, r: 7, rpe: 9 }] },
    { key: 'd1_remo', kind: 's', rows: [{ w: 50, r: 9, rpe: 8 }, { w: 50, r: 9, rpe: 8 }, { w: 50, r: 9, rpe: 9 }, { w: 50, r: 8, rpe: 9 }] },
    { key: 'd1_squat', kind: 's', rows: [{ w: 65, r: 5, rpe: 8, rir: 2 }, { w: 65, r: 5, rpe: 8, rir: 2 }, { w: 65, r: 5, rpe: 8, rir: 2 }, { w: 65, r: 5, rpe: 9, rir: 1 }, { w: 65, r: 5, rpe: 9, rir: 1 }] },
  ] },
  { d: 4, sets: [
    { key: 'd3_a1', kind: 's', rows: [{ w: 12, r: 12, rpe: 8 }, { w: 12, r: 11, rpe: 8 }, { w: 12, r: 10, rpe: 9 }] },
    { key: 'd3_a2', kind: 's', rows: [{ w: 30, r: 10, rpe: 8 }, { w: 30, r: 10, rpe: 8 }, { w: 30, r: 9, rpe: 9 }] },
    { key: 'd3_a3', kind: 's', rows: [{ w: 8, r: 15, rpe: 8 }, { w: 8, r: 14, rpe: 8 }, { w: 8, r: 12, rpe: 9 }] },
    { key: 'd3_b1', kind: 's', rows: [{ w: 10, r: 12, rpe: 8 }, { w: 10, r: 11, rpe: 9 }, { w: 10, r: 10, rpe: 9 }] },
    { key: 'd3_b2', kind: 's', rows: [{ w: 20, r: 12, rpe: 8 }, { w: 20, r: 12, rpe: 8 }, { w: 20, r: 11, rpe: 9 }] },
    { key: 'd3_core', kind: 's', rows: [{ w: null, r: 15, rpe: 8 }, { w: null, r: 15, rpe: 8 }, { w: null, r: 15, rpe: 9 }] },
  ] },
  // ---- YESTERDAY: Día 1 heavy, press-banca PR, live streak ----
  { d: 1, sets: [
    { key: 'd1_press', kind: 's', rows: [{ w: 47.5, r: 9, rpe: 8 }, { w: 47.5, r: 9, rpe: 8 }, { w: 47.5, r: 8, rpe: 9 }, { w: 47.5, r: 8, rpe: 9 }] }, // PR (Epley 47.5x9=61.75 > 45x8=57)
    { key: 'd1_remo', kind: 's', rows: [{ w: 52.5, r: 9, rpe: 8 }, { w: 52.5, r: 9, rpe: 8 }, { w: 52.5, r: 8, rpe: 9 }, { w: 52.5, r: 8, rpe: 9 }] },
    { key: 'd1_squat', kind: 's', rows: [{ w: 67.5, r: 5, rpe: 8, rir: 2 }, { w: 67.5, r: 5, rpe: 9, rir: 1 }, { w: 67.5, r: 5, rpe: 9, rir: 1 }, { w: 67.5, r: 5, rpe: 9, rir: 1 }, { w: 67.5, r: 5, rpe: 9, rir: 0 }] },
  ] },
]

// ── comidas del plan · alimentos reales del catálogo (fix W4) ─────────────────
// El plan activo de Catalina (df06de05…, plan_mode='exchanges') tenía las 4 comidas
// VACÍAS de food_items => el alumno veía "Esta comida no tiene alimentos especificados"
// (MealCard.tsx) y 0 kcal por comida. La vista del alumno lee la jerarquía
// nutrition_plans → nutrition_meals → food_items → foods (getActiveNutritionPlan),
// sobre el plan-INSTANCIA del cliente (template_id NULL — NO hay plantilla del coach que
// tocar). Las comidas NO son day-scoped (day_of_week=null) ⇒ estos ítems aplican a HOY y
// a AYER (y a todo día) por igual; la distinción hoy/ayer vive en los *_logs (ya sembrados).
//
// Todos los alimentos elegidos tienen serving_size=100 ⇒ sus macros están por-100g/ml, y el
// motor (calculateFoodItemMacros) para unit 'g'/'ml' usa factor = quantity/100. Así la suma
// del día es exacta y predecible ≈ 2047 kcal · P150 · C211 · F68
// (objetivo de Catalina: 2100 kcal · P150 · C210 · F70 — coherente).
const MEAL_FOODS_BY_ORDER = [
  // 0 · Desayuno ≈ 513 kcal (P32 · C72 · F13)
  [
    { food: 'd540d957-1f4b-4368-84ae-19b0161b53ad', grams: 60, unit: 'g' }, // Avena en hojuelas
    { food: '1a5300d7-7672-4f0a-b3c6-407069e31743', grams: 170, unit: 'g' }, // Yogur griego natural (sin azúcar)
    { food: 'f0f00114-f079-40ce-8d83-f7fcaa174b2d', grams: 100, unit: 'g' }, // Plátano / Banana
    { food: '26726059-1854-4a4d-9a94-30e19f412e37', grams: 15, unit: 'g' }, // Mantequilla de maní (100% natural)
  ],
  // 1 · Almuerzo ≈ 637 kcal (P62 · C63 · F14)
  [
    { food: 'aeb7d52f-da07-47d2-8762-5d92ade8b30a', grams: 170, unit: 'g' }, // Pechuga de Pollo cocida
    { food: 'd942ccff-6023-4747-8676-bde73a858133', grams: 180, unit: 'g' }, // Arroz Blanco (cocido)
    { food: '0fdedd27-24b0-4465-b4bf-515c739014b3', grams: 50, unit: 'g' }, // Palta
    { food: '4d73f2a4-f208-4ca3-b1cf-9c66f7671ce0', grams: 120, unit: 'g' }, // Brócoli (cocido)
  ],
  // 2 · Once ≈ 336 kcal (P21 · C40 · F12)
  [
    { food: '0fd9900d-013c-4d7f-9bbd-c39ad576cd91', grams: 60, unit: 'g' }, // Pan Integral Protein 10 (Ideal)
    { food: 'c8d75857-3acb-41e4-9134-2265845fd9c6', grams: 80, unit: 'g' }, // Quesillo
    { food: '0fdedd27-24b0-4465-b4bf-515c739014b3', grams: 40, unit: 'g' }, // Palta
    { food: '19b7ec50-b390-4fd2-a65a-2b7e3d96d2bf', grams: 80, unit: 'g' }, // Arándanos frescos
  ],
  // 3 · Cena ≈ 562 kcal (P35 · C36 · F29)
  [
    { food: '3473d80f-2a02-46bd-9496-1ab86161694d', grams: 130, unit: 'g' }, // Salmón
    { food: '547db9c4-2f06-4250-9f6a-359b127b33b2', grams: 150, unit: 'g' }, // Quinoa (cocida)
    { food: '03ab32f3-c287-40bd-9731-297691e47317', grams: 100, unit: 'g' }, // Espinaca
    { food: 'fbe0046b-84d5-4a47-8690-311f149cd739', grams: 10, unit: 'ml' }, // Aceite de Oliva Extra Virgen
  ],
]

// ── manifest io ──────────────────────────────────────────────────────────────
const loadManifest = () => (existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) : null)
const chunk = (arr, n) => (arr.length ? Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n)) : [])

// Delete all QA² workout artifacts for Catalina (programs whose name starts with the marker,
// plus any program id recorded in the manifest) + manifest-tracked nutrition/habits/check-ins.
async function deleteQaArtifacts(manifest) {
  // 1) QA² programs (marker OR manifest id) -> plans -> blocks -> logs
  const progIds = new Set()
  const { data: qa } = await sb
    .from('workout_programs')
    .select('id,name')
    .eq('client_id', CLIENT_ID)
    .like('name', `${PROGRAM_MARKER}%`)
  for (const p of qa ?? []) progIds.add(p.id)
  if (manifest?.createdProgramId) progIds.add(manifest.createdProgramId)

  for (const pid of progIds) {
    const { data: plans } = await sb.from('workout_plans').select('id').eq('program_id', pid)
    const planIds = (plans ?? []).map((r) => r.id)
    let blockIds = []
    if (planIds.length) {
      const { data: blocks } = await sb.from('workout_blocks').select('id').in('plan_id', planIds)
      blockIds = (blocks ?? []).map((r) => r.id)
    }
    for (const c of chunk(blockIds, 100)) {
      await sb.from('workout_logs').delete().eq('client_id', CLIENT_ID).in('block_id', c)
      await sb.from('workout_blocks').delete().in('id', c)
    }
    if (planIds.length) await sb.from('workout_plans').delete().in('id', planIds)
    await sb.from('workout_programs').delete().eq('id', pid).eq('client_id', CLIENT_ID)
  }

  // 2) nutrition + habits + check-ins (ONLY ids we recorded — never prior-seed data)
  if (manifest?.createdFoodItemIds?.length)
    for (const c of chunk(manifest.createdFoodItemIds, 100)) await sb.from('food_items').delete().in('id', c)
  if (manifest?.createdMealLogIds?.length)
    for (const c of chunk(manifest.createdMealLogIds, 100)) await sb.from('nutrition_meal_logs').delete().in('id', c)
  if (manifest?.createdDailyNutritionLogIds?.length)
    for (const c of chunk(manifest.createdDailyNutritionLogIds, 100)) await sb.from('daily_nutrition_logs').delete().in('id', c)
  if (manifest?.createdHabitDates?.length)
    await sb.from('daily_habits').delete().eq('client_id', CLIENT_ID).in('log_date', manifest.createdHabitDates)
  if (manifest?.createdCheckInIds?.length)
    for (const c of chunk(manifest.createdCheckInIds, 100)) await sb.from('check_ins').delete().in('id', c)
}

async function reactivatePrograms(ids) {
  if (!ids?.length) return
  await sb.from('workout_programs').update({ is_active: true }).in('id', ids).eq('client_id', CLIENT_ID)
}

// ── DOWN ─────────────────────────────────────────────────────────────────────
async function down() {
  const manifest = loadManifest()
  if (!manifest) console.warn('WARN: no manifest — will still delete QA² program artifacts by marker, but cannot restore the previously-active program or nutrition/habits/check-ins.')
  await deleteQaArtifacts(manifest)
  await reactivatePrograms(manifest?.deactivatedProgramIds)
  console.log('DOWN complete — removed QA² program + tracked nutrition/habits/check-ins; restored previous active program.')
}

// ── UP ───────────────────────────────────────────────────────────────────────
async function up() {
  // 0) idempotency: undo any prior run of THIS script fully (restore old program, wipe our QA² data)
  const prev = loadManifest()
  if (prev) {
    await reactivatePrograms(prev.deactivatedProgramIds)
    await deleteQaArtifacts(prev)
  } else {
    await deleteQaArtifacts(null) // marker-based safety wipe
  }

  // 1) capture the current active NON-QA² program(s) — deactivated LATER (after the
  //    manifest is on disk) so a mid-run crash never strands Catalina without an active
  //    program AND without a recovery record.
  const { data: actives } = await sb
    .from('workout_programs')
    .select('id,name')
    .eq('client_id', CLIENT_ID)
    .eq('is_active', true)
    .not('name', 'like', `${PROGRAM_MARKER}%`)
  const deactivatedProgramIds = (actives ?? []).map((r) => r.id)
  console.log(`will deactivate previous active program(s): ${(actives ?? []).map((a) => `${a.name}(${a.id})`).join(', ') || 'none'}`)

  // 2) create QA² program
  const startDate = dateOnlyAgo(START_DAYS_AGO)
  const endDate = dateOnlyAgo(START_DAYS_AGO - TOTAL_WEEKS * 7)
  const programPhases = [
    { name: 'Acumulación', weeks: 3, color: '#2680FF' },
    { name: 'Intensificación', weeks: 3, color: '#F7B500' },
  ]
  const { data: prog, error: pErr } = await sb
    .from('workout_programs')
    .insert({
      client_id: CLIENT_ID,
      coach_id: COACH_ID,
      name: PROGRAM_NAME,
      weeks_to_repeat: TOTAL_WEEKS,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      duration_type: 'weeks',
      program_structure_type: 'weekly',
      program_phases: programPhases,
      program_notes: 'Bloque de fuerza + hipertrofia. Enfoque en press de banca y sentadilla. (seed QA²)',
      created_by_coach_id: COACH_ID,
      last_edited_by_coach_id: COACH_ID,
    })
    .select('id')
    .single()
  if (pErr) throw new Error(`program insert: ${pErr.message}`)

  // 3) plans + blocks
  const blockIdByKey = {}
  const createdPlanIds = []
  const createdBlockIds = []
  for (const day of DAYS) {
    const { data: plan, error: plErr } = await sb
      .from('workout_plans')
      .insert({
        client_id: CLIENT_ID,
        coach_id: COACH_ID,
        program_id: prog.id,
        title: day.title,
        group_name: 'Programa de Entrenamiento',
        day_of_week: day.dow,
        week_variant: 'A',
        assigned_date: startDate,
      })
      .select('id')
      .single()
    if (plErr) throw new Error(`plan ${day.key}: ${plErr.message}`)
    createdPlanIds.push(plan.id)

    const rows = day.blocks.map((b) => ({
      plan_id: plan.id,
      exercise_id: b.ex.id,
      order_index: b.oi,
      sets: b.sets,
      reps: b.reps,
      rest_time: b.rest ?? '90s',
      warmup_rest_time: b.warmupRest ?? null,
      tempo: b.tempo ?? null,
      rir: b.rir ?? null,
      section: b.section,
      section_template_id: b.tmpl,
      superset_group: b.ss ?? null,
      exercise_type_override: b.override ?? null,
      progression_mode: b.prog?.mode ?? 'weekly_linear',
      progression_type: b.prog?.type ?? null,
      progression_value: b.prog?.value ?? null,
      target_weight_kg: b.prog?.target ?? null,
      hr_zone: b.hr_zone ?? null,
      duration_sec: b.duration_sec ?? null,
      distance_value: b.distance_value ?? null,
      distance_unit: b.distance_unit ?? null,
      target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
      side_mode: b.side_mode ?? null,
    }))
    const { data: blocks, error: bErr } = await sb.from('workout_blocks').insert(rows).select('id,order_index')
    if (bErr) throw new Error(`blocks ${day.key}: ${bErr.message}`)
    // map back by order_index -> key
    for (const b of day.blocks) {
      const hit = blocks.find((x) => x.order_index === b.oi)
      blockIdByKey[b.key] = hit.id
      createdBlockIds.push(hit.id)
    }
  }

  // 4) workout_logs (each set = one row)
  const blockDefByKey = {}
  for (const day of DAYS) for (const b of day.blocks) blockDefByKey[b.key] = { def: b, dayTitle: day.title }
  const logRows = []
  for (const ses of SESSIONS) {
    let staggerMs = 0
    for (const grp of ses.sets) {
      const { def, dayTitle } = blockDefByKey[grp.key]
      grp.rows.forEach((row, i) => {
        const base = {
          block_id: blockIdByKey[grp.key],
          client_id: CLIENT_ID,
          set_number: i + 1,
          logged_at: isoAgo(ses.d, staggerMs),
          plan_name_at_log: dayTitle,
          exercise_name_at_log: def.ex.name,
          target_reps_at_log: def.reps,
          note: row.note ?? null,
          rpe: row.rpe ?? null,
        }
        if (grp.kind === 's') {
          logRows.push({ ...base, weight_kg: row.w, reps_done: row.r, rir: row.rir ?? null, target_weight_at_log: def.prog?.target != null ? row.w : null })
        } else if (grp.kind === 'c') {
          logRows.push({ ...base, actual_duration_sec: row.durSec ?? null, actual_distance_m: row.distM ?? null, actual_avg_hr: row.hr ?? null, actual_pace_sec_per_km: row.pace ?? null })
        } else if (grp.kind === 'h') {
          logRows.push({ ...base, actual_hold_sec: row.holdSec ?? null })
        }
        staggerMs += 45_000
      })
    }
  }
  const createdWorkoutLogIds = []
  for (const c of chunk(logRows, 200)) {
    const { data, error } = await sb.from('workout_logs').insert(c).select('id')
    if (error) throw new Error(`workout_logs: ${error.message}`)
    for (const r of data) createdWorkoutLogIds.push(r.id)
  }

  // 5) nutrition — reuse EXISTING active plan + meals
  const createdDailyNutritionLogIds = []
  const createdMealLogIds = []
  const createdFoodItemIds = []
  const { data: nplan } = await sb
    .from('nutrition_plans')
    .select('id,name,daily_calories,protein_g,carbs_g,fats_g')
    .eq('client_id', CLIENT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nutritionNote = 'no active nutrition plan — skipped'
  if (nplan) {
    const { data: meals } = await sb
      .from('nutrition_meals')
      .select('id,name,order_index')
      .eq('plan_id', nplan.id)
      .order('order_index')
    const mealByOrder = (meals ?? []).sort((a, b) => a.order_index - b.order_index)

    // 5a) FOOD ITEMS — poblar las comidas del plan con alimentos reales (fix W4).
    //     Self-heal idempotente: borra los food_items existentes de estas 4 comidas antes de
    //     insertar (evita duplicados aunque se pierda el manifest). --down los quita por id.
    if (mealByOrder.length >= 4) {
      const targetMealIds = mealByOrder.slice(0, 4).map((m) => m.id)
      await sb.from('food_items').delete().in('meal_id', targetMealIds)
      const foodRows = []
      mealByOrder.slice(0, 4).forEach((m, i) => {
        for (const fi of MEAL_FOODS_BY_ORDER[i] ?? [])
          foodRows.push({ meal_id: m.id, food_id: fi.food, quantity: fi.grams, unit: fi.unit ?? 'g', swap_options: [] })
      })
      if (foodRows.length) {
        const { data: fData, error: fErr } = await sb.from('food_items').insert(foodRows).select('id')
        if (fErr) throw new Error(`food_items: ${fErr.message}`)
        for (const r of fData) createdFoodItemIds.push(r.id)
      }
    }

    const targets = {
      target_calories_at_log: nplan.daily_calories,
      target_protein_at_log: nplan.protein_g,
      target_carbs_at_log: nplan.carbs_g,
      target_fats_at_log: nplan.fats_g,
    }
    const mkDailyLog = async (daysAgo) => {
      const { data: dl, error } = await sb
        .from('daily_nutrition_logs')
        .insert({ client_id: CLIENT_ID, plan_id: nplan.id, log_date: ymdAgo(daysAgo), plan_name_at_log: nplan.name, created_at: isoAgo(daysAgo), ...targets })
        .select('id')
        .single()
      if (error) throw new Error(`daily_nutrition_log d${daysAgo}: ${error.message}`)
      createdDailyNutritionLogIds.push(dl.id)
      return dl.id
    }
    const mkMealLog = async (dailyLogId, mealId, daysAgo, extra = {}) => {
      const { data: ml, error } = await sb
        .from('nutrition_meal_logs')
        .insert({ daily_log_id: dailyLogId, meal_id: mealId, is_completed: true, created_at: isoAgo(daysAgo), ...extra })
        .select('id')
        .single()
      if (error) throw new Error(`nutrition_meal_log: ${error.message}`)
      createdMealLogIds.push(ml.id)
    }
    if (mealByOrder.length >= 4) {
      // YESTERDAY: 2 de 4 completadas; una (Almuerzo) al 50% con satisfacción
      const yLog = await mkDailyLog(1)
      await mkMealLog(yLog, mealByOrder[0].id, 1, { satisfaction_score: 3 }) // Desayuno full
      await mkMealLog(yLog, mealByOrder[1].id, 1, { consumed_quantity: 50, satisfaction_score: 2 }) // Almuerzo 50%
      // TODAY: Desayuno registrado (día en curso 1/4) — mantiene la racha viva
      const tLog = await mkDailyLog(0)
      await mkMealLog(tLog, mealByOrder[0].id, 0, { satisfaction_score: 3 })
      nutritionNote = `plan ${nplan.id}: yesterday 2/4 (Almuerzo 50%), today 1/4`
    } else {
      nutritionNote = `plan ${nplan.id} has <4 meals — skipped meal logs`
    }
  }

  // 6) daily_habits — last 7 days (varied realistic values)
  const HAB = [
    { water_ml: 2100, steps: 8400, sleep_hours: 7.5, fasting_hours: 13, supplements: ['Creatina', 'Vitamina D'], notes: 'Buen día, con energía' },
    { water_ml: 1800, steps: 6200, sleep_hours: 6.5, fasting_hours: 14, supplements: ['Creatina'], notes: null },
    { water_ml: 2400, steps: 11200, sleep_hours: 8, fasting_hours: 12, supplements: ['Creatina', 'Omega 3'], notes: 'Caminata larga' },
    { water_ml: 1600, steps: 4300, sleep_hours: 6, fasting_hours: 15, supplements: [], notes: 'Dormí poco' },
    { water_ml: 2000, steps: 9100, sleep_hours: 7, fasting_hours: 13, supplements: ['Creatina'], notes: null },
    { water_ml: 2200, steps: 7600, sleep_hours: 7.5, fasting_hours: 14, supplements: ['Creatina', 'Vitamina D'], notes: null },
    { water_ml: 1900, steps: 5400, sleep_hours: 6.5, fasting_hours: 12, supplements: ['Creatina'], notes: 'Descanso' },
  ]
  const createdHabitDates = []
  const habitRows = HAB.map((h, d) => ({
    client_id: CLIENT_ID,
    log_date: ymdAgo(d),
    water_ml: h.water_ml,
    steps: h.steps,
    sleep_hours: h.sleep_hours,
    fasting_hours: h.fasting_hours,
    supplements: h.supplements.length ? h.supplements : null,
    notes: h.notes,
    updated_at: isoAgo(d),
  }))
  const { error: habErr } = await sb.from('daily_habits').insert(habitRows)
  if (habErr) throw new Error(`daily_habits: ${habErr.message}`)
  for (const r of habitRows) createdHabitDates.push(r.log_date)

  // 7) check-ins — 2 nuevos, sin fotos (72.9 -> 72.4)
  const checkRows = [
    { client_id: CLIENT_ID, date: isoAgo(7), created_at: isoAgo(7), weight: 72.9, energy_level: 3, notes: null },
    { client_id: CLIENT_ID, date: isoAgo(3), created_at: isoAgo(3), weight: 72.4, energy_level: 4, notes: 'Dormí mejor esta semana y me sentí con más fuerza en los entrenos.' },
  ]
  const { data: checks, error: cErr } = await sb.from('check_ins').insert(checkRows).select('id')
  if (cErr) throw new Error(`check_ins: ${cErr.message}`)
  const createdCheckInIds = checks.map((r) => r.id)

  // 8) manifest
  const manifest = {
    seededAt: new Date().toISOString(),
    note: 'QA² showcase seed for Catalina Rojas. Reverse: node scripts/seed-catalina-full-qa.mjs --down',
    client_id: CLIENT_ID,
    coach_id: COACH_ID,
    programName: PROGRAM_NAME,
    startDate,
    endDate,
    todayTrainsDayOfWeek: 5,
    deactivatedProgramIds,
    createdProgramId: prog.id,
    createdPlanIds,
    createdBlockIds,
    createdWorkoutLogIds,
    createdDailyNutritionLogIds,
    createdMealLogIds,
    createdFoodItemIds,
    createdHabitDates,
    createdCheckInIds,
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  // 8b) NOW flip the previous active program off (manifest already persisted => reversible)
  if (deactivatedProgramIds.length)
    await sb.from('workout_programs').update({ is_active: false }).in('id', deactivatedProgramIds).eq('client_id', CLIENT_ID)

  // 9) verify
  const { data: activeProg } = await sb
    .from('workout_programs')
    .select('id,name,is_active,start_date,end_date,weeks_to_repeat,program_phases')
    .eq('client_id', CLIENT_ID)
    .eq('is_active', true)
  console.log('\n===== SEED SUMMARY =====')
  console.log(`program: ${prog.id} (${PROGRAM_NAME}) start=${startDate} end=${endDate} weeks=${TOTAL_WEEKS}`)
  console.log(`plans: ${createdPlanIds.length} | blocks: ${createdBlockIds.length} | workout_logs: ${createdWorkoutLogIds.length}`)
  console.log(`nutrition: ${nutritionNote} | daily_nutrition_logs: ${createdDailyNutritionLogIds.length} | meal_logs: ${createdMealLogIds.length} | food_items: ${createdFoodItemIds.length}`)
  console.log(`daily_habits: ${createdHabitDates.length} (dates ${createdHabitDates[createdHabitDates.length - 1]}..${createdHabitDates[0]})`)
  console.log(`check_ins: ${createdCheckInIds.length}`)
  console.log(`deactivated previous program(s): ${deactivatedProgramIds.join(', ') || 'none'}`)
  console.log('\nactive program(s) now for Catalina (SELECT via same service-role client):')
  console.log(JSON.stringify(activeProg, null, 2))
  console.log(`\nHOY es viernes (day_of_week=5) -> le toca "Día 3 · Hombro/Brazo (HOY)" (2 superseries + core). Sin logs hoy.`)
  console.log(`Manifest: ${MANIFEST_PATH}`)
}

const mode = process.argv.includes('--down') ? 'down' : 'up'
;(mode === 'down' ? down() : up()).catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
