// Verifies the seeded states by replicating dashboard.service.ts computation. Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env.local'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const COACH = '503412d0-77cc-4c7e-b1c2-dec81fb00ce6'
const NOW = Date.now(), DAY = 86400000
const diffDays = (a, b) => Math.floor((a - b) / DAY)

const m = JSON.parse(readFileSync(join(__dirname, 'seed-josefit-design-qa.json'), 'utf8'))
const ids = m.students.map((s) => s.clientId)

const since35 = new Date(NOW - 35 * DAY).toISOString()
const last7 = NOW - 7 * DAY

// planned sets
const progIds = m.students.map((s) => s.programId)
const { data: psets } = await sb.rpc('get_workout_program_planned_set_totals', { p_program_ids: progIds })
const setMap = new Map((psets ?? []).map((r) => [r.program_id, Number(r.total_planned_sets)]))
// last workout
const { data: lwd } = await sb.rpc('get_clients_last_workout_date', { p_client_ids: ids, p_since: since35 })
const lwMap = new Map((lwd ?? []).map((r) => [r.client_id, r.last_logged_at]))
// streaks
const { data: streaks } = await sb.rpc('get_clients_streaks_by_ids', { p_client_ids: ids })
const stMap = new Map((streaks ?? []).map((r) => [r.client_id, r.streak]))

function epley(w, r) { return w * (1 + r / 30) }
function badge(score) { return score >= 50 ? 'Riesgo' : score >= 25 ? 'Atención' : 'On track' }

console.log('name                | adh% | nut% | lastWO | lastCI | Sem  | daysRem | 1RMΔ | score | badge     | streak | expect')
console.log('-'.repeat(120))
const counts = {}
for (const st of m.students) {
  const cid = st.clientId
  const { data: logs } = await sb.from('workout_logs').select('logged_at,weight_kg,reps_done').eq('client_id', cid).gte('logged_at', since35)
  const planned = setMap.get(st.programId) ?? 0
  const logs7 = (logs ?? []).filter((l) => new Date(l.logged_at).getTime() >= last7)
  const adh = planned > 0 ? Math.min(Math.round((logs7.length / planned) * 100), 100) : 0
  const lwIso = lwMap.get(cid) ?? null
  const lwDays = lwIso ? diffDays(NOW, new Date(lwIso).getTime()) : null

  const { data: checks } = await sb.from('check_ins').select('created_at,weight').eq('client_id', cid).gte('created_at', since35).order('created_at', { ascending: false })
  const lastCI = checks?.[0]?.created_at ?? null
  const ciDays = lastCI ? diffDays(NOW, new Date(lastCI).getTime()) : null

  // nutrition compliance = sum(completed applicable) / (4 meals * range days). meals day_of_week null => 4/day.
  const cutoff = new Date(NOW - 7 * DAY)
  const cutoffYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(cutoff)
  const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(NOW))
  let nutPct = 0
  if (st.nutritionPlanId) {
    const { data: dls } = await sb.from('daily_nutrition_logs').select('id,log_date,nutrition_meal_logs(is_completed)').eq('client_id', cid).gte('log_date', cutoffYmd)
    // enumerate days cutoff..today
    let days = 0; let cur = new Date(cutoffYmd + 'T12:00:00Z').getTime(); const end = new Date(todayYmd + 'T12:00:00Z').getTime()
    while (cur <= end) { days++; cur += DAY }
    const sumApplicable = 4 * days
    let done = 0
    for (const d of dls ?? []) for (const ml of d.nutrition_meal_logs ?? []) if (ml.is_completed) done++
    nutPct = sumApplicable > 0 ? Math.round((done / sumApplicable) * 100) : 0
  }

  // plan meta
  const { data: prog } = await sb.from('workout_programs').select('start_date,end_date,weeks_to_repeat').eq('id', st.programId).single()
  const start = new Date(prog.start_date + 'T12:00:00')
  const end = prog.end_date ? new Date(prog.end_date + 'T12:00:00') : null
  const daysIn = Math.max(0, diffDays(NOW, start.getTime()))
  let week = Math.floor(daysIn / 7) + 1
  if (prog.weeks_to_repeat) week = Math.min(week, prog.weeks_to_repeat)
  const daysRem = end ? diffDays(end.getTime(), NOW) : null

  // 1RM delta
  const inRange = (s, e) => (logs ?? []).filter((l) => { const t = new Date(l.logged_at).getTime(); return t >= s && t < e && l.weight_kg && l.reps_done })
  const avgMax = (arr) => { if (!arr.length) return null; const byDay = new Map(); for (const l of arr) { const d = l.logged_at.slice(0, 10); byDay.set(d, Math.max(byDay.get(d) ?? 0, epley(l.weight_kg, l.reps_done))) } const v = [...byDay.values()]; return v.reduce((a, b) => a + b, 0) / v.length }
  const thisA = avgMax(inRange(NOW - 7 * DAY, NOW)), prevA = avgMax(inRange(NOW - 14 * DAY, NOW - 7 * DAY))
  const oneRM = (thisA != null && prevA != null && prevA > 0) ? Math.round(((thisA - prevA) / prevA) * 100) : null

  // attention score (hasActiveProgram = true for all)
  let score = 0
  if (ciDays != null && ciDays > 30) score += 25
  if (!lwIso || lwDays >= 7) score += 25
  if (nutPct < 60) score += 20
  if (daysRem != null && daysRem <= 0) score += 15
  else if (daysRem != null && daysRem <= 3) score += 8
  if (oneRM != null && oneRM < -5) score += 15

  const b = badge(score)
  const bucket = b === 'Riesgo' ? 'En riesgo' : b === 'Atención' ? 'Atrasada' : 'Al día'
  counts[bucket] = (counts[bucket] ?? 0) + 1
  const ok = bucket === st.expect ? 'OK' : 'MISMATCH'
  console.log(
    `${st.name.padEnd(19)} | ${String(adh).padStart(3)}  | ${String(nutPct).padStart(3)}  | ${String(lwDays).padStart(5)}d | ${String(ciDays).padStart(5)}d | ${String(week).padStart(2)}/${String(prog.weeks_to_repeat).padEnd(2)}| ${String(daysRem).padStart(6)} | ${String(oneRM).padStart(4)} | ${String(score).padStart(4)}  | ${b.padEnd(9)} | ${String(stMap.get(cid) ?? 0).padStart(5)}  | ${st.expect} ${ok}`
  )
}
console.log('\nState distribution:', JSON.stringify(counts))
// total standalone count
const { count } = await sb.from('clients').select('id', { count: 'exact', head: true }).eq('coach_id', COACH).is('org_id', null).is('team_id', null)
console.log('Total josefit STANDALONE clients (incl. pre-existing):', count)
