const SANTIAGO_TZ = 'America/Santiago'

function toSantiagoDate(now: Date): Date {
  const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
  return new Date(tzStr)
}

export function getTodayInSantiago(now = new Date()): { iso: string; dayOfWeek: number } {
  const d = toSantiagoDate(now)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay()
  return { iso, dayOfWeek }
}

export function getNutritionDayOfWeekFromIsoYmd(isoYmd: string): number {
  const d = toSantiagoDate(new Date(`${isoYmd}T12:00:00Z`))
  return d.getDay() === 0 ? 7 : d.getDay()
}

export function nutritionMealApplies(meal: { day_of_week?: number | null }, isoYmd: string): boolean {
  if (meal.day_of_week == null) return true
  return meal.day_of_week === getNutritionDayOfWeekFromIsoYmd(isoYmd)
}

export function getSantiagoIsoYmdForUtcInstant(isoUtc: string): string {
  const d = toSantiagoDate(new Date(isoUtc))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoDateAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatRelativeDate(dateStr: string, todayIso?: string): string {
  const today = todayIso ?? getTodayInSantiago().iso
  const d0 = new Date(`${today}T12:00:00`).getTime()
  const d1 = new Date(`${dateStr}T12:00:00`).getTime()
  const diff = Math.round((d0 - d1) / 86400000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  if (diff > 1 && diff < 7) return `Hace ${diff} días`
  if (diff >= 7 && diff < 14) return 'Hace 1 semana'
  if (diff >= 14 && diff < 30) return `Hace ${Math.floor(diff / 7)} semanas`
  if (diff >= 30 && diff < 60) return 'Hace 1 mes'
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function timeGreeting(now = new Date()): string {
  const h = toSantiagoDate(now).getHours()
  if (h >= 5 && h < 12) return 'Buenos días'
  if (h >= 12 && h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

export function formatLongDate(now = new Date()): string {
  return toSantiagoDate(now).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}
