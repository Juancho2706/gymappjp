/**
 * Utilidades de MES para la exportación del dossier (chips, rótulos, períodos, nombre de archivo).
 *
 * Todo puro y SIN `Date` de zona local: las claves `YYYY-MM` y las fechas `YYYY-MM-DD` se parsean
 * a mano. Usar `new Date('2026-07-01')` interpretaría UTC y en Santiago (UTC-3/-4) devolvería
 * junio — el bug clásico de los cortes de mes.
 */

/** Meses cortos, iguales a los que ya imprimen los dos generadores de PDF. */
export const MONTHS_SHORT = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic',
] as const

export const MONTHS_LONG = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
] as const

/** `2026-07` / `2026-07-01` / `2026-07-01T…` ⇒ `{ year: 2026, month: 7 }`. null si no parsea. */
function parseMonthKey(value: string | null | undefined): { year: number; month: number } | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})/.exec(String(value).trim())
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2])
    if (!Number.isFinite(year) || month < 1 || month > 12) return null
    return { year, month }
}

/** `2026-07-17` / `2026-07-17T…` ⇒ `{ year, month, day }`. null si no parsea. */
function parseDayKey(value: string | null | undefined): { year: number; month: number; day: number } | null {
    if (!value) return null
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim())
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return { year, month, day }
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n)
}

/** Índice absoluto de mes (año*12 + mes), para comparar y recorrer sin `Date`. */
function monthIndex(p: { year: number; month: number }): number {
    return p.year * 12 + (p.month - 1)
}

function fromMonthIndex(idx: number): { year: number; month: number } {
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** Días del mes (con año bisiesto correcto). */
export function daysInMonth(year: number, month: number): number {
    if (month === 2) {
        const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
        return leap ? 29 : 28
    }
    return [1, 3, 5, 7, 8, 10, 12].includes(month) ? 31 : 30
}

/** Normaliza cualquier fecha/clave a `YYYY-MM`. Cadena vacía si no parsea. */
export function toMonthKey(value: string | null | undefined): string {
    const p = parseMonthKey(value)
    return p ? `${p.year}-${pad2(p.month)}` : ''
}

/**
 * Claves `YYYY-MM` ascendentes desde `firstMonthIso` hasta `currentMonthIso`, ambas inclusive.
 * Acepta `YYYY-MM` o `YYYY-MM-DD` (así entra tal cual el `get_client_report_bounds` de R11).
 * Si el primero es posterior al actual (dato raro), devuelve solo el mes actual.
 */
export function monthRangeFrom(firstMonthIso: string | null | undefined, currentMonthIso: string | null | undefined): string[] {
    const first = parseMonthKey(firstMonthIso)
    const current = parseMonthKey(currentMonthIso)
    if (!current) return []
    const currentIdx = monthIndex(current)
    const firstIdx = first ? monthIndex(first) : currentIdx
    if (firstIdx > currentIdx) return [`${current.year}-${pad2(current.month)}`]
    const out: string[] = []
    for (let i = firstIdx; i <= currentIdx; i++) {
        const p = fromMonthIndex(i)
        out.push(`${p.year}-${pad2(p.month)}`)
    }
    return out
}

/** `2026-07` ⇒ `jul 2026` (rótulo corto de chips y tiles). */
export function formatMonthLabel(monthKey: string | null | undefined): string {
    const p = parseMonthKey(monthKey)
    if (!p) return '—'
    return `${MONTHS_SHORT[p.month - 1]} ${p.year}`
}

/** `2026-07` ⇒ `Julio 2026` (título del informe). */
export function formatMonthLong(monthKey: string | null | undefined): string {
    const p = parseMonthKey(monthKey)
    if (!p) return '—'
    return `${MONTHS_LONG[p.month - 1]} ${p.year}`
}

/** `2026-07-17` ⇒ `17 jul`. Usado en «último check-in dd mmm» y «finalizó el dd mmm». */
export function formatDayMonth(dateIso: string | null | undefined): string {
    const p = parseDayKey(dateIso)
    if (!p) return '—'
    return `${p.day} ${MONTHS_SHORT[p.month - 1]}`
}

/**
 * Período de un mes. El mes EN CURSO (el de `todayIso`) corta en hoy; los demás van al último
 * día del mes. `todayIso` es la fecha local de Santiago que resuelve el caller (R1).
 */
export function monthPeriod(monthKey: string, todayIso: string): { fromIso: string; toIso: string } {
    const p = parseMonthKey(monthKey)
    if (!p) return { fromIso: '', toIso: '' }
    const fromIso = `${p.year}-${pad2(p.month)}-01`
    const lastIso = `${p.year}-${pad2(p.month)}-${pad2(daysInMonth(p.year, p.month))}`
    const today = parseDayKey(todayIso)
    if (!today) return { fromIso, toIso: lastIso }
    const isCurrentMonth = today.year === p.year && today.month === p.month
    const toIso = isCurrentMonth ? `${today.year}-${pad2(today.month)}-${pad2(today.day)}` : lastIso
    return { fromIso, toIso }
}

/**
 * Slug del nombre del alumno. MISMA receta que los dos generadores de PDF (NFD, sin diacríticos,
 * `[^a-z0-9]+` → `-`, tope 60) — si diverge, cambian los nombres de archivo entre web y RN.
 */
export function slugifyClientName(name: string | null | undefined): string {
    return (
        String(name ?? '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 60) || 'alumno'
    )
}

/**
 * Nombre base del archivo, SIN extensión:
 * - sin meses (dossier de hoy) ⇒ `dossier-<slug>`
 * - un mes ⇒ `dossier-<slug>-2026-07`
 * - varios ⇒ `dossier-<slug>-2026-07_2026-09` (primero y último, ordenados)
 */
export function dossierFileStem(fullName: string | null | undefined, monthKeys: string[] = []): string {
    const slug = slugifyClientName(fullName)
    const keys = monthKeys
        .map((k) => toMonthKey(k))
        .filter((k) => !!k)
        .sort()
    if (keys.length === 0) return `dossier-${slug}`
    if (keys.length === 1) return `dossier-${slug}-${keys[0]}`
    return `dossier-${slug}-${keys[0]}_${keys[keys.length - 1]}`
}
