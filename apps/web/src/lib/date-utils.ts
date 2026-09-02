import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

const SANTIAGO_TZ = 'America/Santiago'

/**
 * Reloj de pared de Santiago para un instante, por COMPONENTES (`Intl.formatToParts`, `h23`).
 *
 * Endurecimiento por hidratación (Sentry EVA-NEXTJS-18, 2026-09-02): el patrón viejo
 * `new Date(now.toLocaleString('en-US', { timeZone }))` vuelve a PARSEAR un string localizado, y ese
 * parseo depende del motor (V8 en Vercel, JSC en Safari) y de la ICU que imprime el string. Todo lo
 * que sale de acá se pinta en client components que se hidratan (saludo, fecha del header, día
 * calendario), así que cualquier discrepancia es un mismatch de TEXTO. Los componentes numéricos de
 * `formatToParts` no pasan por ningún parser: son idénticos en todo runtime. (La regresión real de
 * ese día fue la abreviatura del mes con punto en Safari 26 — ver `formatShortDayMonthEs`; este
 * helper cierra la otra puerta de la misma familia.)
 * Instante inválido ⇒ `null` (el llamador decide el fallback; `formatToParts` tiraría RangeError).
 */
function santiagoWallClock(instant: Date): {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
} | null {
    if (Number.isNaN(instant.getTime())) return null
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: SANTIAGO_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(instant)
            .map((p) => [p.type, p.value])
    )
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        // Alguna ICU vieja imprime «24» a medianoche con hour12:false; con h23 no pasa, el % es cinturón.
        hour: Number(parts.hour) % 24,
        minute: Number(parts.minute),
        second: Number(parts.second),
    }
}

/** Día de semana JS (0=Dom … 6=Sáb) de un día calendario, sin zona horaria de por medio. */
function weekdayOfYmd(year: number, month: number, day: number): number {
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Hoy en zona Santiago: fecha local, ISO `YYYY-MM-DD`, día semana 1=Lun … 7=Dom (convención DB). */
export function getTodayInSantiago(now = new Date()): {
    date: Date
    iso: string
    dayOfWeek: number
} {
    const wall = santiagoWallClock(now) ?? santiagoWallClock(new Date())!
    // `date` conserva el contrato histórico: un Date cuyos getters LOCALES (getDate/getDay/getHours)
    // leen el reloj de pared de Santiago, sin importar la TZ del host.
    const date = new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
    const iso = `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
    const dowJs = weekdayOfYmd(wall.year, wall.month, wall.day)
    const dayOfWeek = dowJs === 0 ? 7 : dowJs
    return { date, iso, dayOfWeek }
}

/**
 * Convierte `YYYY-MM-DD` al día de semana 1=Lun … 7=Dom (misma convención que `getTodayInSantiago`).
 * El día de semana de un día calendario no depende de ninguna zona: se calcula en UTC puro, sin
 * re-parsear strings localizados (ver `santiagoWallClock`).
 */
export function getNutritionDayOfWeekFromIsoYmdInSantiago(isoYmd: string): number {
    const ref = parseISO(`${isoYmd}T12:00:00`)
    const dowJs = weekdayOfYmd(ref.getFullYear(), ref.getMonth() + 1, ref.getDate())
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

const LONG_WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const LONG_MONTHS_ES = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
]

const SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** Abreviaturas de día de semana es (índice JS 0=Dom … 6=Sáb), sin punto — igual que las imprime Node. */
const SHORT_WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

/**
 * Entrada de los helpers de fecha corta: un `YYYY-MM-DD` o un `Date` YA resuelto al día calendario
 * que se quiere imprimir. Un `Date` se lee con los getters LOCALES (`getFullYear/getMonth/getDate`),
 * que es exactamente la zona que usaba `toLocaleDateString(...)` sin `timeZone`; quien formatea en
 * UTC debe derivar el `YYYY-MM-DD` con `getUTC*` y pasar el string.
 */
type ShortDateInput = string | Date

/** Componentes de calendario de la entrada, o `null` si no se puede interpretar (defensivo). */
function resolveYmdParts(input: ShortDateInput): { year: number; month: number; day: number } | null {
    if (input instanceof Date) {
        if (Number.isNaN(input.getTime())) return null
        return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() }
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return { year, month, day }
}

/** Fallback compartido: string fuera de patrón vuelve tal cual; `Date` inválido ⇒ cadena vacía. */
function shortDateFallback(input: ShortDateInput): string {
    return typeof input === 'string' ? input : ''
}

/** Día con o sin cero a la izquierda, según lo que imprimía `day: 'numeric' | '2-digit'`. */
function shortDay(day: number, mode: 'numeric' | '2-digit'): string {
    return mode === '2-digit' ? String(day).padStart(2, '0') : String(day)
}

/**
 * Fecha → `"1 sept"` / `"01 sept"` (día + abreviatura fija de mes, separados por espacio, sin punto).
 *
 * Existe por hidratación (Sentry EVA-NEXTJS-18, regresó 2026-09-01 y de nuevo 2026-09-02 con el Safari
 * 26.5 de iOS 18.7): `new Date(...).toLocaleDateString('es-CL', { month: 'short' })` depende de la
 * ICU/CLDR del runtime — Node 24 en Vercel imprime "31 ago" pero el Safari nuevo imprime "31 ago." (y
 * "sept.", "mié."), y ese mismatch de TEXTO SSR↔cliente dispara React #418. La tabla es fija y
 * determinista — nunca vía `Intl`/`toLocaleDateString` — así el HTML es idéntico en cualquier
 * runtime/ICU. Regla: en un client component que se hidrata (SSR), nunca formatear fechas con `Intl`
 * sin tabla fija (misma familia que los helpers `formatSantiago*` de más abajo, mismo issue).
 * Calca la salida de Node para `es-ES`/`es-CL` con `{ day, month: 'short' }` (+ año ausente).
 */
export function formatShortDayMonthEs(
    input: ShortDateInput,
    options: { day?: 'numeric' | '2-digit' } = {}
): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    return `${shortDay(parts.day, options.day ?? 'numeric')} ${SHORT_MONTHS_ES[parts.month - 1]}`
}

/**
 * Fecha → `"31-ago"` / `"02-sept"` (día de 2 dígitos + guion + mes corto).
 *
 * Calca exactamente lo que imprime Node para `es-CL` con `{ day: '2-digit', month: 'short' }` **sin
 * año**: en ese patrón el CLDR chileno usa GUION, no espacio (con año vuelve el espacio: "31 ago 2026").
 * Se separa de `formatShortDayMonthEs` justamente para no cambiarle el texto a nadie en Chrome.
 */
export function formatShortDayDashMonthEs(input: ShortDateInput): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    return `${shortDay(parts.day, '2-digit')}-${SHORT_MONTHS_ES[parts.month - 1]}`
}

/**
 * Fecha → `"31 ago 2026"` / `"05 ago 2026"` (día + mes corto + año, separados por espacio).
 * Calca la salida de Node para `es-ES`/`es-CL` con `{ day, month: 'short', year: 'numeric' }`.
 */
export function formatShortDayMonthYearEs(
    input: ShortDateInput,
    options: { day?: 'numeric' | '2-digit' } = {}
): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    return `${formatShortDayMonthEs(input, options)} ${parts.year}`
}

/**
 * Fecha → `"ago 2026"` / `"sept 2026"` (mes corto + año).
 * Calca la salida de Node para `es-ES`/`es-CL` con `{ month: 'short', year: 'numeric' }`.
 */
export function formatShortMonthYearEs(input: ShortDateInput): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    return `${SHORT_MONTHS_ES[parts.month - 1]} ${parts.year}`
}

/**
 * Fecha → `"ago"` / `"sept"` (solo la abreviatura del mes, sin punto).
 * Es la abreviatura que imprime Node en `es-ES`; en `es-CL` el `Intl` deja un punto ("ago.") que las
 * superficies del repo ya pelaban a mano — acá directamente no existe.
 */
export function formatShortMonthEs(input: ShortDateInput): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    return SHORT_MONTHS_ES[parts.month - 1]
}

/**
 * Fecha → `"lun, 31 ago"` / `"mié, 02 sept"` (día de semana corto + coma + día + mes corto).
 * Calca la salida de Node para `es-CL`/`es-AR` con `{ weekday: 'short', day, month: 'short' }`. El día
 * de semana sale de aritmética UTC pura sobre el día calendario, no de la zona del proceso.
 */
export function formatShortWeekdayDayMonthEs(
    input: ShortDateInput,
    options: { day?: 'numeric' | '2-digit' } = {}
): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    const weekday = SHORT_WEEKDAYS_ES[weekdayOfYmd(parts.year, parts.month, parts.day)]
    return `${weekday}, ${formatShortDayMonthEs(input, options)}`
}

/**
 * Fecha → `"lunes, 31 ago"` / `"miércoles, 2 sept"` (día de semana LARGO + día + mes corto).
 * Calca la salida de Node para `es-CL` con `{ weekday: 'long', day: 'numeric', month: 'short' }`.
 * El nombre largo no lleva punto en ningún ICU; lo que se fija acá es la abreviatura del mes.
 */
export function formatLongWeekdayShortDayMonthEs(
    input: ShortDateInput,
    options: { day?: 'numeric' | '2-digit' } = {}
): string {
    const parts = resolveYmdParts(input)
    if (!parts) return shortDateFallback(input)
    const weekday = LONG_WEEKDAYS_ES[weekdayOfYmd(parts.year, parts.month, parts.day)]
    return `${weekday}, ${formatShortDayMonthEs(input, options)}`
}

export function timeGreetingSantiago(now = new Date()): 'Buenos días' | 'Buenas tardes' | 'Buenas noches' {
    const h = (santiagoWallClock(now) ?? santiagoWallClock(new Date())!).hour
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
    const wall = santiagoWallClock(new Date(isoUtc))
    if (!wall) return ''
    return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
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

/**
 * «miércoles, 2 de septiembre» — el día de HOY en Santiago, con tablas fijas (sin `Intl` para los
 * nombres ni re-parseo de strings, ver `santiagoWallClock`). La salida calca exactamente lo que
 * imprimía `toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })` en Node,
 * así el HTML no cambia para nadie; la diferencia es que ahora Safari/Chrome/Node producen el mismo
 * texto en cualquier hora del día (hidratación del header del dashboard, EVA-NEXTJS-18).
 */
export function formatLongDateSantiago(now = new Date()): string {
    const wall = santiagoWallClock(now) ?? santiagoWallClock(new Date())!
    const weekday = LONG_WEEKDAYS_ES[weekdayOfYmd(wall.year, wall.month, wall.day)]
    return `${weekday}, ${wall.day} de ${LONG_MONTHS_ES[wall.month - 1]}`
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
    const parts = getSantiagoDateTimeParts(isoTimestamp, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    })
    if (!parts) return ''
    return `${parts.day}-${parts.month}-${parts.year}`
}

/**
 * Descompone un instante UTC en sus componentes de calendario en America/Santiago.
 * Siempre vía `Intl.DateTimeFormat` + `timeZone` (nunca `toLocaleString` reparseado ni
 * `format()` de date-fns): así el resultado depende SOLO del instante y no de la TZ del proceso.
 * Instante inválido → `null` (el llamador decide el fallback).
 */
function getSantiagoDateTimeParts(
    isoUtc: string,
    options: Intl.DateTimeFormatOptions
): Record<string, string> | null {
    const instant = new Date(isoUtc)
    if (Number.isNaN(instant.getTime())) return null
    return Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO_TZ, ...options })
            .formatToParts(instant)
            .map((p) => [p.type, p.value])
    )
}

/**
 * Instante UTC (`timestamptz`) → `31/08/26` en **America/Santiago**.
 *
 * Existe por hidratación (Sentry EVA-NEXTJS-18): `format(new Date(iso), 'dd/MM/yy')` de date-fns
 * formatea en la TZ del PROCESO. El HTML lo genera Vercel en UTC y el navegador del admin hidrata
 * en hora chilena, así que para instantes entre las 20:00 y las 24:00 de Chile el día impreso
 * difiere y React marca hydration mismatch. Con `Intl` + `timeZone` fijo, servidor y cliente
 * imprimen siempre lo mismo. Timestamp inválido → cadena vacía (defensivo).
 */
export function formatSantiagoDdMmYy(isoUtc: string): string {
    const parts = getSantiagoDateTimeParts(isoUtc, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
    })
    if (!parts) return ''
    return `${parts.day}/${parts.month}/${parts.year}`
}

/**
 * Instante UTC (`timestamptz`) → `31/08 22:30` (24 h) en **America/Santiago**.
 *
 * Existe por hidratación (Sentry EVA-NEXTJS-18): `format(new Date(iso), 'dd/MM HH:mm')` de
 * date-fns usa la TZ del proceso, así que la tabla de auditoría mostraba una hora en el HTML del
 * servidor (UTC) y otra tras hidratar (Chile). La hora se re-pad a mano para neutralizar el
 * `h24` de algunos ICU (medianoche como `24`). Timestamp inválido → cadena vacía (defensivo).
 */
export function formatSantiagoDdMmHhMm(isoUtc: string): string {
    const parts = getSantiagoDateTimeParts(isoUtc, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    })
    if (!parts) return ''
    const hour = String(Number(parts.hour) % 24).padStart(2, '0')
    return `${parts.day}/${parts.month} ${hour}:${parts.minute}`
}
