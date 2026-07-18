import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const SANTIAGO_TZ = 'America/Santiago'

/** Hoy en zona Santiago: fecha local, ISO `YYYY-MM-DD`, día semana 1=Lun … 7=Dom (convención DB). */
export function getTodayInSantiago(now = new Date()): {
    date: Date
    iso: string
    dayOfWeek: number
} {
    const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const date = new Date(tzStr)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dowJs = date.getDay()
    const dayOfWeek = dowJs === 0 ? 7 : dowJs
    return { date, iso, dayOfWeek }
}

/**
 * Convierte `YYYY-MM-DD` al día de semana 1=Lun … 7=Dom en **America/Santiago**
 * (misma convención que `getTodayInSantiago`).
 */
export function getNutritionDayOfWeekFromIsoYmdInSantiago(isoYmd: string): number {
    const ref = parseISO(`${isoYmd}T12:00:00`)
    const tzStr = ref.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const d = new Date(tzStr)
    const dowJs = d.getDay()
    return dowJs === 0 ? 7 : dowJs
}

/** NULL/`undefined` en `day_of_week` = comida aplica todos los días. */
export function nutritionMealAppliesOnIsoYmdInSantiago(
    meal: { day_of_week?: number | null },
    isoYmd: string
): boolean {
    if (meal.day_of_week == null) return true
    return meal.day_of_week === getNutritionDayOfWeekFromIsoYmdInSantiago(isoYmd)
}

/** Etiquetas relativas en español para fechas `YYYY-MM-DD`. */
export function formatRelativeDate(dateStr: string, todayIso?: string): string {
    const today = todayIso ?? getTodayInSantiago().iso
    const d0 = parseISO(`${today}T12:00:00`)
    const d1 = parseISO(`${dateStr}T12:00:00`)
    const diff = differenceInCalendarDays(d0, d1)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    if (diff > 1 && diff < 7) return `Hace ${diff} días`
    if (diff >= 7 && diff < 14) return 'Hace 1 semana'
    if (diff >= 14 && diff < 30) return `Hace ${Math.floor(diff / 7)} semanas`
    if (diff >= 30 && diff < 60) return 'Hace 1 mes'
    return format(d1, "d MMM yyyy", { locale: es })
}

/**
 * Formatea una fecha date-only `YYYY-MM-DD` a formato corto humano es-CL
 * ("mié 16 jul"; agrega el año solo si difiere del año en curso: "mié 16 jul 2025").
 * Timezone-safe: parsea los componentes a mano y formatea en UTC, de modo que el día
 * jamás se corre por zona (`new Date('2026-07-16')` es medianoche UTC y en Chile mostraría
 * el día anterior). Con `relative`, hoy/ayer se muestran como palabra. String fuera de
 * patrón → se devuelve tal cual (defensivo).
 */
export function formatNutritionShortDate(
    dateStr: string,
    options: { todayIso?: string; relative?: boolean } = {}
): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
    if (!match) return dateStr
    const year = Number(match[1])
    const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3])))
    if (Number.isNaN(date.getTime())) return dateStr

    const today = options.todayIso ?? getTodayInSantiago().iso
    if (options.relative) {
        const diff = differenceInCalendarDays(parseISO(`${today}T12:00:00`), parseISO(`${dateStr}T12:00:00`))
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

export function timeGreetingSantiago(now = new Date()): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
    const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const d = new Date(tzStr)
    const h = d.getHours()
    if (h >= 5 && h < 12) return 'Buenos días'
    if (h >= 12 && h < 19) return 'Buenas tardes'
    return 'Buenas noches'
}

/**
 * Returns UTC ISO timestamp boundaries that cover the full calendar day `isoDate` in Santiago.
 * Correctly handles DST (UTC-3 summer / UTC-4 winter) so late-night logs are not lost.
 *
 * El offset se deriva con Intl.formatToParts, NUNCA con `new Date(toLocaleString(...))`:
 * esa interpretación usa la TZ del HOST y solo es correcta cuando el server corre en UTC
 * (en un host en hora chilena la ventana quedaba [00:00Z, 24:00Z) y los registros de
 * 20:00-24:00 hora local "desaparecían" del día).
 */
export function getSantiagoUtcBoundsForDay(isoDate: string): { startIso: string; endIso: string } {
    const noonUtc = new Date(`${isoDate}T12:00:00Z`)
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: SANTIAGO_TZ,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    const parts = Object.fromEntries(dtf.formatToParts(noonUtc).map(p => [p.type, p.value]))
    const santiagoAsUtcMs = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
    )
    const offsetMs = noonUtc.getTime() - santiagoAsUtcMs
    const midnightUtcMs = new Date(`${isoDate}T00:00:00Z`).getTime() + offsetMs
    return {
        startIso: new Date(midnightUtcMs).toISOString(),
        endIso: new Date(midnightUtcMs + 86_400_000).toISOString(),
    }
}

/**
 * Maps a UTC instant (e.g. `workout_logs.logged_at`) to calendar `YYYY-MM-DD` in America/Santiago.
 * Use this instead of `logged_at.startsWith('yyyy-mm-dd')` (UTC prefix can disagree with local day).
 */
export function getSantiagoIsoYmdForUtcInstant(isoUtc: string): string {
    const d = new Date(isoUtc)
    const tzStr = d.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const local = new Date(tzStr)
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`
}

/**
 * Días calendario (America/Santiago) transcurridos desde un INSTANTE UTC (p. ej. `check_ins.date`,
 * un timestamptz) hasta `todayIso` (día YA en Santiago; por defecto hoy). Timezone-safe: mapea el
 * instante al día calendario de Santiago ANTES de restar. Evita el off-by-one de comparar el
 * prefijo UTC del instante (`utcInstant.split('T')[0]`) contra un día calculado en Santiago —
 * cerca de la medianoche chilena el prefijo UTC ya saltó al día siguiente (bug del banner de
 * check-in, jul-2026: el conteo se desalineaba de `getLastCheckIn`, que ordena por `date`).
 */
export function daysSinceSantiagoInstant(utcInstant: string, todayIso?: string): number {
    const today = todayIso ?? getTodayInSantiago().iso
    const lastDay = getSantiagoIsoYmdForUtcInstant(utcInstant)
    return differenceInCalendarDays(parseISO(`${today}T12:00:00`), parseISO(`${lastDay}T12:00:00`))
}

export function formatLongDateSantiago(now = new Date()): string {
    const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const d = new Date(tzStr)
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Prefijo `YYYY-MM` del mes calendario ACTUAL en America/Santiago. DST-safe: deriva los
 * componentes con `Intl.DateTimeFormat` (no `new Date(toLocaleString(...))`, que depende de la
 * TZ del host). Comparable por `startsWith()` contra los `day` (YYYY-MM-DD, ya en Santiago) que
 * devuelven los RPC de agregación → filtra sesiones/volumen al borde correcto del mes.
 */
export function getSantiagoMonthPrefix(now = new Date()): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO_TZ, year: 'numeric', month: '2-digit' })
            .formatToParts(now)
            .map((p) => [p.type, p.value])
    )
    return `${parts.year}-${parts.month}`
}

/** Etiqueta legible del mes calendario actual en Santiago: "Julio 2026" (mes capitalizado). */
export function formatSantiagoMonthLabel(now = new Date()): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('es-CL', { timeZone: SANTIAGO_TZ, month: 'long', year: 'numeric' })
            .formatToParts(now)
            .map((p) => [p.type, p.value])
    )
    const month = (parts.month || '').replace(/^\w/u, (c) => c.toUpperCase())
    return `${month} ${parts.year}`
}

/**
 * Formatea un timestamp ISO (`timestamptz`, ej. `nutrition_v2_conversion_links.converted_at`)
 * a `dd-mm-yyyy` en **America/Santiago**. DST-safe: deriva los componentes con
 * `Intl.DateTimeFormat` (mismo patrón que `getSantiagoMonthPrefix`), nunca con
 * `new Date(toLocaleString(...))` que depende de la TZ del host. Timestamp inválido → cadena
 * vacía (defensivo; el llamador decide si ocultar el dato).
 */
export function formatDateDdMmYyyySantiago(isoTimestamp: string): string {
    const instant = new Date(isoTimestamp)
    if (Number.isNaN(instant.getTime())) return ''
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: SANTIAGO_TZ,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
            .formatToParts(instant)
            .map((p) => [p.type, p.value])
    )
    return `${parts.day}-${parts.month}-${parts.year}`
}
