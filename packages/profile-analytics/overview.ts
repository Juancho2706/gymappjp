// Overview: calendar-heatmap + rachas + edad de entreno + regularidad de check-in.
// Forma canonica RN: recibe fechas YA extraidas (string[]). La web mantiene su variante
// anidada `buildProfileActivityCalendarData` (date-fns) local — mismos buckets.

import { addDays, diffDays, diffMonths, parseYmd, ymd } from './dates'
import type { ProfileCalendarActivity } from './types'

/**
 * Calendario de actividad (heatmap). `workoutDates` suma 1, `checkInDates` suma 2 por dia.
 * Nivel 0..4 relativo al dia mas activo de la ventana.
 */
export function buildProfileActivityCalendar(
  workoutDates: string[],
  checkInDates: string[],
  daysBack = 371
): ProfileCalendarActivity[] {
  const end = new Date()
  const start = addDays(end, -daysBack)
  const map = new Map<string, number>()
  for (const iso of workoutDates || []) {
    if (!iso) continue
    const d = parseYmd(iso)
    if (d < start || d > end) continue
    map.set(iso.slice(0, 10), (map.get(iso.slice(0, 10)) ?? 0) + 1)
  }
  for (const iso of checkInDates || []) {
    if (!iso) continue
    const d = parseYmd(iso)
    if (d < start || d > end) continue
    map.set(iso.slice(0, 10), (map.get(iso.slice(0, 10)) ?? 0) + 2)
  }
  const max = Math.max(1, ...map.values())
  const out: ProfileCalendarActivity[] = []
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = ymd(d)
    const count = map.get(key) ?? 0
    out.push({ date: key, count, level: count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4)) })
  }
  return out
}

/** Dias consecutivos con count > 0 en fechas ISO ordenadas. */
export function longestActivityStreak(data: ProfileCalendarActivity[]): number {
  const active = data
    .filter((a) => a.count > 0)
    .map((a) => a.date)
    .sort()
  if (active.length === 0) return 0
  let best = 1
  let cur = 1
  for (let i = 1; i < active.length; i++) {
    if (diffDays(parseYmd(active[i - 1]!), parseYmd(active[i]!)) === 1) {
      cur++
      best = Math.max(best, cur)
    } else {
      cur = 1
    }
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
  if (months < 1) {
    const d = diffDays(start, now)
    return d < 1 ? 'Reciente' : `${d} día${d === 1 ? '' : 's'}`
  }
  if (months < 12) return `${months} mes${months === 1 ? '' : 'es'}`
  const y = Math.floor(months / 12)
  const m = months % 12
  const yPart = `${y} año${y === 1 ? '' : 's'}`
  return m === 0 ? yPart : `${yPart} y ${m} mes${m === 1 ? '' : 'es'}`
}

/**
 * Regularidad de check-in: 100% si el ultimo check-in (en o antes de `referenceDate`) fue hoy
 * respecto a esa fecha; baja linealmente hasta 0% a los 7 dias.
 */
export function checkInRegularityPercentAsOf(
  referenceDate: Date,
  checkIns: { created_at: string }[] | null | undefined
): number {
  const refMs = referenceDate.getTime()
  if (!isFinite(refMs)) return 0
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
