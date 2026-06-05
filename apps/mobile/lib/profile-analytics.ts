// Analítica de perfil de alumno — port 1:1 de la web (profileTrainingAnalytics + profileOverviewUtils
// + profileBodyCompositionUtils), adaptado a RN: logs PLANOS (no nested), sin date-fns, colores hex.
// Mismos cálculos que la web → mismos números.

// ── Date helpers (sin date-fns) ─────────────────────────────────────────────
const DAY_MS = 86_400_000
function parseYmd(s: string): Date { return new Date(`${s.slice(0, 10)}T12:00:00`) }
function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function diffDays(a: Date, b: Date): number { return Math.floor((b.getTime() - a.getTime()) / DAY_MS) }
function diffMonths(a: Date, b: Date): number { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) }
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d); const day = (x.getDay() + 6) % 7 // 0 = lunes
  x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x
}
function shortLabel(dateKey: string): string {
  return parseYmd(dateKey).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

// ── Tipo de log plano (lo que provee el data layer RN) ──────────────────────
export interface WorkoutLogRow {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  weightKg: number | null
  reps: number | null
  loggedAt: string
}

export interface MuscleVolumeRow { muscleGroup: string; volume: number }

// ── 1RM Epley + series de fuerza por ejercicio ──────────────────────────────
export function epleyOneRM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return weightKg * (1 + reps / 30)
}

function isKeyCompoundLift(name: string): boolean {
  const n = name.toLowerCase()
  return /banca|bench|press|sentadilla|squat|muerto|deadlift|dead lift/.test(n)
}

export type OneRMHistoryPoint = { dateKey: string; label: string; oneRm: number; weightKg: number; reps: number }
export type ExerciseStrengthSeries = { exerciseId: string; exerciseName: string; muscleGroup: string; series: OneRMHistoryPoint[]; totalVolume: number }

export function buildExerciseStrengthSeriesMap(logs: WorkoutLogRow[]): Map<string, ExerciseStrengthSeries> {
  type DayBest = { oneRm: number; weightKg: number; reps: number }
  type Acc = { exerciseName: string; muscleGroup: string; byDay: Map<string, DayBest>; totalVolume: number }
  const byEx = new Map<string, Acc>()

  for (const log of logs || []) {
    const w = log.weightKg, r = log.reps ?? 0
    if (w == null || w <= 0 || r <= 0 || !log.loggedAt) continue
    const exId = log.exerciseId || `name:${log.exerciseName}`
    const day = log.loggedAt.slice(0, 10)
    const oneRm = epleyOneRM(w, r)
    if (oneRm <= 0) continue
    let acc = byEx.get(exId)
    if (!acc) { acc = { exerciseName: log.exerciseName || 'Ejercicio', muscleGroup: log.muscleGroup?.trim() || '—', byDay: new Map(), totalVolume: 0 }; byEx.set(exId, acc) }
    acc.totalVolume += w * r
    const prev = acc.byDay.get(day)
    if (!prev || oneRm > prev.oneRm || (oneRm === prev.oneRm && w > prev.weightKg)) {
      acc.byDay.set(day, { oneRm: Math.round(oneRm * 10) / 10, weightKg: w, reps: r })
    }
  }

  const out = new Map<string, ExerciseStrengthSeries>()
  for (const [exerciseId, acc] of byEx) {
    const keys = [...acc.byDay.keys()].sort()
    const series: OneRMHistoryPoint[] = keys.map((dateKey) => {
      const d = acc.byDay.get(dateKey)!
      return { dateKey, label: shortLabel(dateKey), oneRm: d.oneRm, weightKg: d.weightKg, reps: d.reps }
    })
    if (series.length === 0) continue
    out.set(exerciseId, { exerciseId, exerciseName: acc.exerciseName, muscleGroup: acc.muscleGroup, series, totalVolume: acc.totalVolume })
  }
  return out
}

export function selectStrengthCardExercises(logs: WorkoutLogRow[], maxCards = 4): ExerciseStrengthSeries[] {
  const list = [...buildExerciseStrengthSeriesMap(logs).values()].filter((s) => s.series.length > 0)
  list.sort((a, b) => {
    const ka = isKeyCompoundLift(a.exerciseName) ? 1 : 0, kb = isKeyCompoundLift(b.exerciseName) ? 1 : 0
    if (ka !== kb) return kb - ka
    if (b.totalVolume !== a.totalVolume) return b.totalVolume - a.totalVolume
    return b.series.length - a.series.length
  })
  return list.slice(0, maxCards)
}

export function strengthTrendDeltaKg(series: OneRMHistoryPoint[]): number | null {
  if (series.length < 2) return null
  return Math.round((series[series.length - 1]!.oneRm - series[0]!.oneRm) * 10) / 10
}
export function maxOneRMIndex(series: OneRMHistoryPoint[]): number {
  let best = -1, idx = 0
  series.forEach((p, i) => { if (p.oneRm > best) { best = p.oneRm; idx = i } })
  return idx
}

// ── PR 1RM de la semana (lunes → hoy) ───────────────────────────────────────
export type WeeklyWeightPR = {
  exerciseId: string; exerciseName: string; muscleGroup: string
  newWeightKg: number; newReps: number; newOneRm: number
  prevWeightKg: number; prevReps: number; prevOneRm: number; pctChange: number | null
}
export function findWeeklyWeightPRs(logs: WorkoutLogRow[], now: Date = new Date()): WeeklyWeightPR[] {
  const weekStart = startOfWeekMonday(now)
  type Agg = { name: string; muscle: string; before1rm: number; beforeWeightKg: number; beforeReps: number; inWeek1rm: number; inWeekWeightKg: number; inWeekReps: number }
  const byEx = new Map<string, Agg>()
  for (const log of logs || []) {
    const w = log.weightKg; if (w == null || w <= 0) continue
    const r = log.reps ?? 0; if (r <= 0 || r > 30 || !log.loggedAt) continue
    const d = new Date(log.loggedAt); if (!isFinite(d.getTime())) continue
    const orm = epleyOneRM(w, r); if (orm <= 0) continue
    const exId = log.exerciseId || `name:${log.exerciseName}`
    let row = byEx.get(exId)
    if (!row) { row = { name: log.exerciseName || 'Ejercicio', muscle: log.muscleGroup?.trim() || '—', before1rm: 0, beforeWeightKg: 0, beforeReps: 0, inWeek1rm: 0, inWeekWeightKg: 0, inWeekReps: 0 }; byEx.set(exId, row) }
    if (d >= weekStart) {
      if (orm > row.inWeek1rm || (orm === row.inWeek1rm && w > row.inWeekWeightKg)) { row.inWeek1rm = orm; row.inWeekWeightKg = w; row.inWeekReps = r }
    } else {
      if (orm > row.before1rm || (orm === row.before1rm && w > row.beforeWeightKg)) { row.before1rm = orm; row.beforeWeightKg = w; row.beforeReps = r }
    }
  }
  const out: WeeklyWeightPR[] = []
  for (const [exerciseId, row] of byEx) {
    if (row.inWeek1rm <= 0 || row.before1rm <= 0 || row.inWeek1rm <= row.before1rm) continue
    const pct = Math.round(((row.inWeek1rm - row.before1rm) / row.before1rm) * 1000) / 10
    out.push({ exerciseId, exerciseName: row.name, muscleGroup: row.muscle, newWeightKg: row.inWeekWeightKg, newReps: row.inWeekReps, newOneRm: Math.round(row.inWeek1rm * 10) / 10, prevWeightKg: row.beforeWeightKg, prevReps: row.beforeReps, prevOneRm: Math.round(row.before1rm * 10) / 10, pctChange: pct })
  }
  return out.sort((a, b) => b.newOneRm - a.newOneRm)
}

// ── Tonelaje por día + media móvil 7 ────────────────────────────────────────
export type SessionTonnagePoint = { dateKey: string; label: string; tonnage: number; sessions: number; movingAvg?: number }
export function buildDailyTonnageSeries(logs: WorkoutLogRow[], maxDays = 21): SessionTonnagePoint[] {
  const byDay = new Map<string, number>()
  for (const log of logs || []) {
    const add = (log.weightKg ?? 0) * (log.reps ?? 0)
    if (add <= 0 || !log.loggedAt) continue
    const day = log.loggedAt.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + add)
  }
  const slice = [...byDay.keys()].sort().slice(-maxDays)
  const points = slice.map((dateKey) => ({ dateKey, label: shortLabel(dateKey), tonnage: Math.round(byDay.get(dateKey) ?? 0), sessions: 1 }))
  const window = 7
  return points.map((pt, i) => {
    const s = points.slice(Math.max(0, i - window + 1), i + 1)
    return { ...pt, movingAvg: Math.round(s.reduce((acc, p) => acc + p.tonnage, 0) / s.length) }
  })
}

// ── Desbalance de volumen muscular ──────────────────────────────────────────
export type VolumeImbalance = { stronger: string; weaker: string; ratio: number }
export function detectVolumeImbalances(rows: MuscleVolumeRow[], take = 6, minRatio = 2): VolumeImbalance[] {
  const list = [...(rows || [])].filter((r) => r.volume > 0)
  if (list.length < 2) return []
  const top = list.sort((a, b) => b.volume - a.volume).slice(0, take)
  const maxV = top[0]?.volume ?? 0, strong = top[0]?.muscleGroup ?? ''
  if (maxV <= 0 || !strong) return []
  const alerts: VolumeImbalance[] = []
  for (let i = 1; i < top.length; i++) {
    const w = top[i]!; if (w.volume <= 0) continue
    const ratio = maxV / w.volume
    if (ratio >= minRatio) alerts.push({ stronger: strong, weaker: w.muscleGroup, ratio: Math.round(ratio * 10) / 10 })
  }
  return alerts
}

// ── Composición corporal ────────────────────────────────────────────────────
export function linearRegressionKgPerDay(checkIns: { created_at: string; weight?: number | null }[]): number {
  const valid = [...checkIns].filter((c) => c.weight != null && Number(c.weight) > 0).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const cutoff = addDays(new Date(), -30)
  const windowed = valid.filter((c) => new Date(c.created_at) >= cutoff)
  const series = windowed.length >= 2 ? windowed : valid
  if (series.length < 2) return 0
  const t0 = new Date(series[0]!.created_at).getTime()
  const pts = series.map((c) => ({ x: (new Date(c.created_at).getTime() - t0) / DAY_MS, y: Number(c.weight) }))
  const n = pts.length
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x }
  const denom = n * sxx - sx * sx
  return Math.abs(denom) < 1e-9 ? 0 : (n * sxy - sx * sy) / denom
}
export function bmiFromMetric(weightKg: number, heightCm: number): number | null {
  if (!heightCm || heightCm <= 0 || !weightKg || weightKg <= 0) return null
  const cm = heightCm < 3 ? heightCm * 100 : heightCm
  if (cm < 80 || cm > 260) return null
  const m = cm / 100
  return weightKg / (m * m)
}
export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Bajo peso'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Sobrepeso'
  return 'Obesidad'
}
export function avgEnergySince(checkIns: { created_at: string; energy_level?: number | null }[], since: Date): number | null {
  const levels = checkIns.filter((c) => new Date(c.created_at) >= since && c.energy_level != null).map((c) => Number(c.energy_level))
  return levels.length === 0 ? null : levels.reduce((a, b) => a + b, 0) / levels.length
}
export function energyColorHex(level: number | null | undefined): string {
  if (level == null) return '#6B7280'
  if (level >= 8) return '#10B981'
  if (level >= 5) return '#F59E0B'
  return '#EF4444'
}

// ── Overview: calendar-heatmap + rachas + edad de entreno ────────────────────
export type ProfileCalendarActivity = { date: string; count: number; level: number }
export function buildProfileActivityCalendar(workoutDates: string[], checkInDates: string[], daysBack = 371): ProfileCalendarActivity[] {
  const end = new Date(); const start = addDays(end, -daysBack)
  const map = new Map<string, number>()
  for (const iso of workoutDates || []) {
    if (!iso) continue
    const d = parseYmd(iso); if (d < start || d > end) continue
    map.set(iso.slice(0, 10), (map.get(iso.slice(0, 10)) ?? 0) + 1)
  }
  for (const iso of checkInDates || []) {
    if (!iso) continue
    const d = parseYmd(iso); if (d < start || d > end) continue
    map.set(iso.slice(0, 10), (map.get(iso.slice(0, 10)) ?? 0) + 2)
  }
  const max = Math.max(1, ...map.values())
  const out: ProfileCalendarActivity[] = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = ymd(d); const count = map.get(key) ?? 0
    out.push({ date: key, count, level: count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)) })
  }
  return out
}
export function longestActivityStreak(data: ProfileCalendarActivity[]): number {
  const active = data.filter((a) => a.count > 0).map((a) => a.date).sort()
  if (active.length === 0) return 0
  let best = 1, cur = 1
  for (let i = 1; i < active.length; i++) {
    if (diffDays(parseYmd(active[i - 1]!), parseYmd(active[i]!)) === 1) { cur++; best = Math.max(best, cur) } else cur = 1
  }
  return best
}
export function formatTrainingAgeLabel(subscriptionStart: string | null, fallbackCreatedAt: string): string {
  const base = subscriptionStart || fallbackCreatedAt
  if (!base) return '—'
  const start = parseYmd(base)
  if (!isFinite(start.getTime())) return '—'
  const now = new Date()
  const months = diffMonths(start, now)
  if (months < 1) { const d = diffDays(start, now); return d < 1 ? 'Reciente' : `${d} día${d === 1 ? '' : 's'}` }
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`
  const y = Math.floor(months / 12), m = months % 12
  const yPart = `${y} año${y === 1 ? '' : 's'}`
  return m === 0 ? yPart : `${yPart} y ${m} mes${m === 1 ? '' : 'es'}`
}
export function checkInRegularityPercentAsOf(referenceDate: Date, checkIns: { created_at: string }[] | null): number {
  const refMs = referenceDate.getTime(); if (!isFinite(refMs)) return 0
  let lastMs = 0
  for (const c of checkIns || []) {
    if (!c.created_at) continue
    const t = new Date(c.created_at).getTime()
    if (!isFinite(t) || t > refMs) continue
    if (t > lastMs) lastMs = t
  }
  if (lastMs === 0) return 0
  const daysSince = diffDays(new Date(lastMs), referenceDate)
  return Math.max(0, Math.round(100 - Math.min(100, (daysSince / 7) * 100)))
}
