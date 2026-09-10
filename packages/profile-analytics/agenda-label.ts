// Agenda «Pendientes de hoy» — copys, severidad y fecha corta. Fuente UNICA compartida por el
// servidor web (buildAgendaFromPulse) y el fallback local de RN, igual que top-alert.ts: TypeScript
// puro, sin React / Next / Supabase / React Native / date-fns.
//
// Regla del tren «Señales honestas para el coach» (carril C): el label se arma UNA vez con estas
// funciones y quien pinta solo imprime. Nada de `Intl` ni `toLocaleDateString` acá ni en los
// llamadores: la abreviatura del mes sale de la tabla fija SHORT_MONTHS_ES (copia de
// `apps/web/src/lib/date-utils.ts`), porque el texto viaja del servidor al cliente y cualquier
// diferencia de ICU es un mismatch de hidratación (familia Sentry EVA-NEXTJS-18).

export type AgendaKind = 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
export type AgendaSeverity = 'none' | 'warning' | 'danger'

const DAY_MS = 86_400_000

/** Mediodía UTC del YMD: inmune a DST y a la zona del runtime. `null` si el string no es `YYYY-MM-DD`. */
function ymdToUtcNoon(ymd: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return Date.UTC(year, month - 1, day, 12)
}

/**
 * Días calendario **de Santiago** entre dos días `YYYY-MM-DD` que el llamador YA convirtió a esa
 * zona (se comparan al mediodía UTC, inmune a DST). `null` si no hay fecha o el formato no es YMD.
 *
 * NO recibe instantes UTC ni usa la medianoche del runtime (`setHours(0,0,0,0)`): el servidor web
 * corre en UTC y entre las 21:00 y la medianoche de Chile esa «medianoche local» ya es el día
 * siguiente, así que la misma fila diría «2 sept · 9 d» cuando son 8 y la severidad saltaría un día
 * antes. Por eso el formato es estricto: un ISO completo (`2026-09-02T23:00:00Z`) devuelve `null` en
 * vez de contar el día UTC en silencio. Los YMD los arman `getSantiagoIsoYmdForUtcInstant` y
 * `getTodayInSantiago().iso` (web `apps/web/src/lib/date-utils.ts`, RN `apps/mobile/lib/date-utils.ts`).
 *
 * Cuenta días calendario, no ventanas de 24 h: «ayer» es 1 d aunque hayan pasado menos de 24 h.
 */
export function daysSince(fromYmd: string | null, todayYmd: string): number | null {
  if (!fromYmd) return null
  const from = ymdToUtcNoon(fromYmd)
  const today = ymdToUtcNoon(todayYmd)
  if (from === null || today === null) return null
  return Math.round((today - from) / DAY_MS)
}

/** Punto de color de las filas por antigüedad: `>= 14 ⇒ danger`, `>= 7 ⇒ warning`, resto `none`. `null ⇒ 'none'`. */
export function agendaSeverity(days: number | null): AgendaSeverity {
  if (days === null) return 'none'
  if (days >= 14) return 'danger'
  if (days >= 7) return 'warning'
  return 'none'
}

/**
 * Punto de color de los programas: `<= 0 ⇒ 'danger'`, `1..3 ⇒ 'warning'`, resto `'none'`.
 * Para `programa_vence` la severidad sale de `daysLeft`, nunca de `days` (que es `null`). Los cortes
 * de `lastInfo` (`directory-shared.ts`, `<3` / `<7`) son otra regla y no se reutilizan acá.
 */
export function programSeverity(daysLeft: number): AgendaSeverity {
  if (daysLeft <= 0) return 'danger'
  if (daysLeft <= 3) return 'warning'
  return 'none'
}

/**
 * Tabla fija copiada de `apps/web/src/lib/date-utils.ts` (12 entradas, septiembre = `sept`, sin punto).
 * Se exporta para que el test pueda compararla entrada por entrada contra la de la web: allá es
 * privada y este tren no la toca.
 */
export const SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/**
 * `'2026-09-02'` ⇒ `'2 sept'` (día sin cero a la izquierda, espacio, abreviatura fija sin punto).
 * Fecha corta compartida por el servidor web y el fallback RN: una sola tabla determinista, **sin
 * `Intl` ni `toLocaleDateString` en ninguna de las dos plataformas**, para que no reaparezca la
 * divergencia `sept` / `sept.` (familia EVA-NEXTJS-18). Entrada fuera de patrón vuelve tal cual.
 */
export function shortDayMonthEs(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ymd
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return ymd
  return `${day} ${SHORT_MONTHS_ES[month - 1]}`
}

/**
 * Texto de la fila. Recibe la fecha YA formateada (`dateText`) con `shortDayMonthEs`; el molde del
 * string es el mismo en web y RN. Los copys son literales del contrato: ningún llamador los rearma.
 *
 * Sin fecha (`dateText`/`days` en `null`) las filas de pulse dicen «Todavía no registra …»: es el
 * alumno que nunca registró, y por eso no se fabrica un «· 0 d».
 */
export function buildAgendaLabel(input: {
  kind: AgendaKind
  days: number | null
  dateText: string | null
  programName?: string
  daysLeft?: number
}): string {
  switch (input.kind) {
    case 'sin_ejercicio':
      return input.dateText !== null && input.days !== null
        ? `Sin entrenos desde el ${input.dateText} · ${input.days} d`
        : 'Todavía no registra entrenos'
    case 'checkin_pendiente':
      return input.dateText !== null && input.days !== null
        ? `Sin check-in desde el ${input.dateText} · ${input.days} d`
        : 'Todavía no registra check-ins'
    case 'programa_vence': {
      const name = input.programName ?? ''
      const daysLeft = input.daysLeft ?? 0
      if (daysLeft > 0) return `«${name}» vence en ${daysLeft} d`
      if (daysLeft === 0) return `«${name}» vence hoy`
      return `«${name}» venció hace ${-daysLeft} d`
    }
  }
}
