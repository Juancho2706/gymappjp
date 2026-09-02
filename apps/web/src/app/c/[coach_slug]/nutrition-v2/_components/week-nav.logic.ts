/**
 * Lógica PURA de la navegación semanal del alumno web (tabs "Hoy" y "Plan").
 *
 * El día que el alumno está mirando vive en `searchParams` para que sobreviva al back, sea
 * compartible y se resuelva SERVER-FIRST (el RSC recompone; no hay estado de cliente que
 * rehidratar). Dos parámetros, uno por tab, porque significan cosas distintas:
 *
 *  - Tab **Plan** → `?dow=1..7` (1=lunes … 7=domingo, orden de lectura latam, misma convención
 *    que `getTodayInSantiago().dayOfWeek`). El plan es un patrón semanal: la fecha exacta no
 *    aporta y un `dow` sobrevive al cambio de día sin quedar apuntando a la semana pasada.
 *  - Tab **Hoy** → `?date=YYYY-MM-DD`, porque ahí sí importa la jornada concreta (sus registros).
 *
 * Ambos se resuelven contra las 7 fechas de la semana de HOY: fuera de esa ventana caemos a hoy
 * (fail-closed). La semana mostrada es siempre la actual — navegar semanas anteriores es fase
 * posterior (SPEC "Fuera de alcance") y pedirlo aquí obligaría a otra página de historial.
 *
 * Framework-neutral: sin React ni DOM. Se testea sola (`week-nav.logic.test.ts`).
 */

import {
  addNutritionDays,
  buildNutritionWeek,
  countEnergyDaysInRange,
  formatNutritionCalories,
  nutritionDayOfWeekFromIso,
  nutritionWeekStartIso,
  type NutritionHistoryDay,
  type NutritionPlanReadModel,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { formatShortMonthEs } from '@/lib/date-utils'

/** La celda de semana del alumno web, con la variante y el día de historial ya tipados. */
export type StudentNutritionWeekCell = NutritionWeekCell<
  NutritionPlanReadModel['dayVariants'][number],
  NutritionHistoryDay
>

/**
 * Página del historial que cubre EXACTAMENTE la semana pedida.
 *
 * `get_nutrition_history_page_v2` no tiene cota inferior: su cursor `p_before` es exclusivo y
 * descendente. Pidiendo `before = lunes + 7` (o sea, el lunes siguiente) con `pageSize = 7` se
 * garantiza traer todos los días con datos de la semana — cualquier día de esta semana es más
 * reciente que cualquier día anterior — y `buildNutritionWeek` descarta client-side las filas
 * que caigan fuera. Nunca se asumen 7 filas densas: el historial es DISPERSO.
 */
export const NUTRITION_WEEK_HISTORY_PAGE_SIZE = 7

/** Cursor `p_before` (exclusivo) para pedir solo la semana que contiene `isoDate`. */
export function nutritionWeekHistoryCursor(isoDate: string | null | undefined): string | null {
  return addNutritionDays(nutritionWeekStartIso(isoDate), 7)
}

/** `?dow=1..7` → fecha de esa posición en la semana. Ausente o inválido ⇒ `fallbackIso` (hoy). */
export function resolveWeekIsoFromDowParam(
  weekDates: readonly string[],
  raw: string | string[] | null | undefined,
  fallbackIso: string,
): string {
  if (typeof raw === 'string' && /^[1-7]$/.test(raw.trim())) {
    const iso = weekDates[Number(raw.trim()) - 1]
    if (iso != null) return iso
  }
  return fallbackIso
}

/**
 * `?date=YYYY-MM-DD` acotado a la semana mostrada. Fecha inválida o de otra semana ⇒ hoy: la
 * pantalla solo tiene datos descargados de esta semana y jamás debe pedirle al backend un día
 * suelto (`get_nutrition_today_v2` es `volatile` y revienta con fechas fuera de ventana).
 */
export function resolveWeekIsoFromDateParam(
  weekDates: readonly string[],
  raw: string | string[] | null | undefined,
  fallbackIso: string,
): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (nutritionDayOfWeekFromIso(trimmed) != null && weekDates.includes(trimmed)) return trimmed
  }
  return fallbackIso
}

/** "27 de julio" — la fecha ya viene resuelta en la zona del alumno, así que se formatea en UTC. */
function formatDayAndMonth(isoDate: string): string | null {
  if (nutritionDayOfWeekFromIso(isoDate) == null) return null
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`))
}

/** Nombre del día en minúscula para frases ("Sábado" → "sábado"). */
function lowerDayLabel(longLabel: string): string {
  return longLabel.toLocaleLowerCase('es-CL')
}

/**
 * Encabezado del día PASADO: "Estás viendo el lunes 27 de julio". Sin culpa, sin adjetivos —
 * el banner solo ubica al alumno y le ofrece volver.
 */
export function formatPastDayHeadline(cell: Pick<StudentNutritionWeekCell, 'longLabel' | 'isoDate'>): string {
  const dayAndMonth = formatDayAndMonth(cell.isoDate)
  const day = lowerDayLabel(cell.longLabel)
  return dayAndMonth ? `Estás viendo el ${day} ${dayAndMonth}` : `Estás viendo el ${day}`
}

/**
 * Encabezado del día FUTURO: "El sábado sigues: Día alto · 2.600 kcal". Es una PROYECCIÓN de la
 * variante que aplica (misma regla del snapshot), no una promesa: si el coach republica el plan
 * antes de ese día, el día real será el que congele su snapshot.
 */
export function formatFutureDayHeadline(cell: {
  longLabel: string
  variant: { label: string } | null
  targets: { calories?: number | null } | null
}): string {
  const day = lowerDayLabel(cell.longLabel)
  const label = cell.variant?.label?.trim()
  if (!label) return `El ${day} tu plan no prescribe comidas`
  const calories = cell.targets?.calories
  const suffix = calories != null && Number.isFinite(calories) ? ` · ${formatNutritionCalories(calories)}` : ''
  return `El ${day} sigues: ${label}${suffix}`
}

/**
 * Poda las celdas para cruzar el borde RSC → cliente.
 *
 * El chip solo lee fecha, etiquetas, estado y consumo; la variante (con TODAS sus franjas,
 * alimentos y media) y el snapshot del historial se quedan en el servidor. Sin esta poda, pintar
 * 7 chips serializaría el plan entero siete veces en el payload de Flight. `variant: null` aquí
 * NO significa "sin plan ese día": estas celdas son exclusivamente para el selector.
 */
export function toWeekNavCells(
  cells: readonly Pick<
    NutritionWeekCell,
    'isoDate' | 'dayOfWeek' | 'shortLabel' | 'longLabel' | 'state' | 'consumed' | 'isLegacy' | 'rangeDot'
  >[],
): NutritionWeekCell[] {
  return cells.map((cell) => ({
    isoDate: cell.isoDate,
    dayOfWeek: cell.dayOfWeek,
    shortLabel: cell.shortLabel,
    longLabel: cell.longLabel,
    state: cell.state,
    variant: null,
    targets: null,
    targetsSource: 'none',
    consumed: cell.consumed,
    isLegacy: cell.isLegacy,
    legacy: null,
    // T2.7: el punto por rango viene MATERIALIZADO por buildNutritionWeek — la poda tira las
    // metas, asi que derivarlo del lado cliente ya no seria posible.
    rangeDot: cell.rangeDot,
  }))
}

/** Caption de "Metas del día" en planes multi-día: "Lunes · Día alto". */
export function formatSelectedDayCaption(cell: {
  longLabel: string
  variant: { label: string } | null
}): string | null {
  const label = cell.variant?.label?.trim()
  if (!label) return cell.longLabel
  // Variante nombrada igual que el día ("Viernes") ⇒ no repetir: "Viernes · Viernes" (QA H6).
  if (label.localeCompare(cell.longLabel, 'es', { sensitivity: 'base' }) === 0) return cell.longLabel
  return `${cell.longLabel} · ${label}`
}

// ── Historial por semanas (auditoría SPEC ola 3 punto 7) ──────────────────────────
//
// El tab "Historial" pasa de una card por DÍA a una card por SEMANA (rango + n/7 + %) con un
// mini-strip de 7 celdas tappable. `get_nutrition_history_page_v2` no tiene bordes de semana: su
// paginación es por CANTIDAD de filas y el historial es DISPERSO (solo hay fila para un día si
// alguna vez tuvo snapshot o intake), así que una tanda de filas puede cruzar más o menos semanas
// según cuán activo sea el alumno. Por eso agrupamos lo que YA llegó por `nutritionWeekStartIso`
// en vez de pedir "una semana" al backend: cero RPC nuevo, cero fecha inventada.

/** Una semana agrupada del historial, lista para pintar una card + su mini-strip de 7 días. */
export interface HistoryWeekBucket {
  /** Lunes de la semana (`YYYY-MM-DD`). */
  weekStartIso: string
  /** Domingo de la semana (`YYYY-MM-DD`). */
  weekEndIso: string
  /** 7 celdas Lu-Do, podadas (`toWeekNavCells`) para cruzar al cliente. */
  cells: NutritionWeekCell[]
  /** Días con registro (`state === 'past-logged'`) de los 7 de la semana. */
  loggedCount: number
  /** `loggedCount / 7` redondeado, para el "% " de la card. */
  percent: number
  /**
   * Días de la semana DENTRO del rango de energía ±10% (T2.7 F3): alimenta la pill "N/7 en
   * rango" de la card y las barras de la tendencia. Un día sin datos no cuenta ni en contra.
   */
  inRangeCount: number
}

/**
 * Agrupa filas de historial (ya ordenadas desc por el RPC) en semanas Lu-Do completas.
 *
 * Cada semana presente entre las filas recibidas se agrupa una sola vez, en el mismo orden en que
 * aparecieron (más reciente primero); los días sin fila dentro de esa semana quedan "sin
 * registro" vía `buildNutritionWeek` (regla 3: `consumed = null` ≠ "registró cero"). No se
 * fabrican semanas fuera del rango de filas recibido — si el alumno tiene huecos de meses, esta
 * función no inventa semanas vacías de por medio.
 *
 * `variants: []` a propósito: el mini-strip solo pinta el punto de estado (con/sin registro), no
 * la estructura del plan de ese día — pasar variantes reales aquí serializaría el árbol del plan
 * sin que ninguna UI lo use (mismo criterio que `toWeekNavCells`).
 *
 * La semana que contiene `todayIso` queda EXCLUIDA (paridad RN T1.3): esa semana en curso vive en
 * el tab Hoy, no en el historial de semanas cerradas.
 */
export function groupHistoryDaysByWeek(
  days: readonly NutritionHistoryDay[],
  todayIso: string,
): HistoryWeekBucket[] {
  // Paridad RN (T1.3, `nutrition-v2/index.tsx` — "La semana EN CURSO se excluye a propósito"):
  // esa semana la ve el alumno en el tab Hoy, no en el historial de semanas cerradas.
  const currentWeekStartIso = nutritionWeekStartIso(todayIso)
  const rowsByWeek = new Map<string, NutritionHistoryDay[]>()
  const order: string[] = []
  for (const day of days) {
    const weekStartIso = nutritionWeekStartIso(day.localDate)
    if (weekStartIso == null) continue
    if (weekStartIso === currentWeekStartIso) continue
    if (!rowsByWeek.has(weekStartIso)) {
      rowsByWeek.set(weekStartIso, [])
      order.push(weekStartIso)
    }
    rowsByWeek.get(weekStartIso)!.push(day)
  }

  return order.map((weekStartIso) => {
    const cells = toWeekNavCells(
      buildNutritionWeek({
        variants: [],
        history: rowsByWeek.get(weekStartIso) ?? [],
        weekStartIso,
        todayIso,
      }),
    )
    const loggedCount = cells.filter((cell) => cell.state === 'past-logged').length
    return {
      weekStartIso,
      weekEndIso: addNutritionDays(weekStartIso, 6) ?? weekStartIso,
      cells,
      loggedCount,
      percent: Math.round((loggedCount / 7) * 100),
      inRangeCount: countEnergyDaysInRange(rowsByWeek.get(weekStartIso) ?? []),
    }
  })
}

/**
 * Recorta una tanda de semanas al borde seguro de paginación (QA F1-F3, hallazgo H3).
 *
 * El RPC pagina por CANTIDAD de fechas, así que la semana más vieja de una tanda puede llegar
 * CORTADA (solo sus días más recientes). Emitirla igual pintaba días con datos como "sin datos",
 * una pill "N/7" mentirosa, y al pedir la tanda siguiente la MISMA semana aparecía otra vez con
 * el resto de sus días. Regla: con `hasMore`, la última semana se DESCARTA y el cursor pasa a ser
 * el lunes de la última emitida (`p_before` es exclusivo ⇒ la próxima tanda re-trae la semana
 * descartada COMPLETA, hasta su domingo). Sin `hasMore` no hay corte posible y no se descarta.
 * Con una sola semana en la tanda no se descarta (guard anti-loop; con tandas ≥8 fechas no pasa).
 */
export function trimHistoryWeeksPage(input: {
  weeks: HistoryWeekBucket[]
  hasMore: boolean
  rpcCursor: string | null
}): { weeks: HistoryWeekBucket[]; hasMore: boolean; nextCursor: string | null } {
  if (!input.hasMore || input.weeks.length < 2) {
    return { weeks: input.weeks, hasMore: input.hasMore, nextCursor: input.rpcCursor }
  }
  const emitted = input.weeks.slice(0, -1)
  return { weeks: emitted, hasMore: true, nextCursor: emitted[emitted.length - 1]!.weekStartIso }
}

/** "21-27 jul" (mismo mes) o "28 jul-3 ago" (cruza de mes), para el encabezado de la card. */
export function formatHistoryWeekRangeLabel(weekStartIso: string, weekEndIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00Z`)
  const end = new Date(`${weekEndIso}T00:00:00Z`)
  // Abreviatura por tabla fija (misma salida sin punto que ya se pelaba a mano). `Intl` depende de
  // la ICU del runtime — el Safari nuevo imprime "jul." — y esta etiqueta se pinta en el primer
  // render de `HistoryWeeksList`, que hidrata el HTML del servidor (EVA-NEXTJS-18).
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()
  const startLabel = sameMonth
    ? `${start.getUTCDate()}`
    : `${start.getUTCDate()} ${formatShortMonthEs(weekStartIso)}`
  return `${startLabel}-${end.getUTCDate()} ${formatShortMonthEs(weekEndIso)}`
}
