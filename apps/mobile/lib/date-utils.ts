const SANTIAGO_TZ = 'America/Santiago'

/**
 * Convierte un instante a un `Date` cuyos getters locales (getHours,
 * getFullYear, ...) reflejan la hora de pared de Santiago.
 *
 * NO usar `new Date(now.toLocaleString(...))`: el string localizado
 * ("7/9/2026, 3:04:05 PM") NO es ISO y Hermes/iOS lo rechaza → "Invalid Date"
 * (bug de clase). `formatToParts` + constructor numérico nunca parsea strings.
 */
function toSantiagoDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SANTIAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  let hour = Number(p.hour)
  if (hour === 24) hour = 0 // algunos motores devuelven '24' a medianoche
  return new Date(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    hour,
    Number(p.minute),
    Number(p.second),
  )
}

/**
 * Parser central y seguro para fechas que vienen de Postgres.
 * Acepta: `YYYY-MM-DD` (columnas `date`, se ancla a mediodía local para evitar
 * saltos de día por TZ), timestamps ISO con `T`/`Z`, y el formato con espacio
 * `YYYY-MM-DD HH:mm[:ss]` que Hermes/iOS NO parsea con `new Date()`.
 * Devuelve `null` si el valor es vacío o no se puede parsear.
 */
export function parseDbDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const s = String(value).trim()
  if (!s) return null
  // Solo fecha (YYYY-MM-DD): anclar a mediodía local evita off-by-one por TZ.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  // Timestamp con espacio → normalizar a ISO reemplazando el primer espacio.
  const iso = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
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

/**
 * Offset de Santiago respecto a UTC (ms; negativo al oeste, p.ej. -4h en invierno CL) para un instante
 * UTC dado, INDEPENDIENTE de la TZ del runtime: `formatToParts` con `timeZone` fijo da la hora de pared
 * de Santiago y `Date.UTC` la reinterpreta sin mirar la TZ del dispositivo. Se muestrea a mediodía para
 * no caer en el salto de DST (que ocurre a medianoche local).
 */
function santiagoUtcOffsetMs(atUtcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SANTIAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(atUtcMs))
  const p: Record<string, string> = {}
  for (const part of parts) p[part.type] = part.value
  let hour = Number(p.hour)
  if (hour === 24) hour = 0 // algunos motores devuelven '24' a medianoche
  const sanWallAsUtcMs = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute), Number(p.second))
  return sanWallAsUtcMs - atUtcMs
}

export function getSantiagoUtcBoundsForDay(isoDate: string): { startIso: string; endIso: string } {
  // Ventana [start,end) del día de Santiago en UTC, INDEPENDIENTE de la TZ del dispositivo. Antes el
  // offset se derivaba con `toSantiagoDate`, cuyo `new Date(y,m,d,...)` interpreta los componentes en la
  // TZ LOCAL del runtime: en un teléfono en Santiago el offset salía 0 y la ventana colapsaba a
  // [00:00Z,00:00Z) en vez de [04:00Z,04:00Z), dejando FUERA los logs de la tarde/noche (>= ~20:00 local
  // ya viven en el día UTC siguiente) → el SELECT del día no veía la fila y el re-guardado reinsertaba,
  // chocando con el índice único `workout_logs_one_set_per_day` (23505). Con `Date.UTC` + `formatToParts`
  // de TZ fija el resultado es idéntico corriera donde corriera (verificado bit a bit contra la impl vieja
  // en runtime UTC, y correcto además en device Santiago para invierno UTC-4 y verano DST UTC-3).
  //
  // Guarda de entrada (Sentry EVA-MOBILE-1 "RangeError: Date value out of bounds"): un `isoDate`
  // invalido/undefined (p.ej. un `queued_at` corrupto en la cola offline que `getSantiagoIsoYmdForUtcInstant`
  // convierte en "NaN-NaN-NaN", o una fecha mal formada rio arriba) hacia que `midnightUtcMs`/`offsetMs`
  // fueran NaN y el `new Date(NaN).toISOString()` de abajo lanzara — un throw que en el flush de la cola
  // (fire-and-forget) cae como `onunhandledrejection`. Se normaliza a la parte `YYYY-MM-DD` (identico para
  // todo caller valido actual, que ya pasa date-only) y si el dia no es parseable se cae a HOY en Santiago:
  // nunca se lanza, y la ventana devuelta siempre es un dia real.
  const ymd = /^\d{4}-\d{2}-\d{2}/.exec(String(isoDate ?? ''))?.[0]
  const safeDate =
    ymd && !Number.isNaN(new Date(`${ymd}T00:00:00Z`).getTime()) ? ymd : getTodayInSantiago().iso
  const midnightUtcMs = new Date(`${safeDate}T00:00:00Z`).getTime()
  const offsetMs = santiagoUtcOffsetMs(new Date(`${safeDate}T12:00:00Z`).getTime())
  const startMs = midnightUtcMs - offsetMs
  return {
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(startMs + 86_400_000).toISOString(),
  }
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

/**
 * Formatea una fecha date-only `YYYY-MM-DD` a formato corto humano es-CL
 * ("mié 16 jul"; agrega el año solo si difiere del año en curso). Timezone-safe:
 * parsea los componentes a mano y formatea en UTC, así el día no se corre por zona.
 * Con `relative`, hoy/ayer se muestran como palabra. Fuera de patrón → tal cual.
 */
export function formatNutritionShortDate(
  dateStr: string,
  options: { todayIso?: string; relative?: boolean } = {},
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return dateStr
  const year = Number(match[1])
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return dateStr

  const today = options.todayIso ?? getTodayInSantiago().iso
  if (options.relative) {
    const diff = Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${dateStr}T12:00:00`).getTime()) / 86400000,
    )
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
  }

  const withYear = year !== Number(today.slice(0, 4))
  const parts = new Intl.DateTimeFormat('es-CL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).formatToParts(date)
  const part = (type: string) => (parts.find((p) => p.type === type)?.value ?? '').replace(/\.$/, '')
  const base = `${part('weekday')} ${part('day')} ${part('month')}`
  return withYear ? `${base} ${part('year')}` : base
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
