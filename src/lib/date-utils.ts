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

export function timeGreetingSantiago(now = new Date()): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
    const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const d = new Date(tzStr)
    const h = d.getHours()
    if (h >= 5 && h < 12) return 'Buenos días'
    if (h >= 12 && h < 19) return 'Buenas tardes'
    return 'Buenas noches'
}

export function formatLongDateSantiago(now = new Date()): string {
    const tzStr = now.toLocaleString('en-US', { timeZone: SANTIAGO_TZ })
    const d = new Date(tzStr)
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}
