/**
 * Semana Lu-Do de nutrición V2 — helper PURO compartido web/RN (week view).
 *
 * Compone las 7 celdas de una semana con los datos que YA viajaron al cliente: el plan
 * (`plan.dayVariants`, que el RPC devuelve COMPLETO, no solo la variante de hoy) y las filas
 * dispersas del historial (`history.items` del alumno / `recentDays` del coach). Cero fetch por
 * celda y, sobre todo, cero llamadas a `get_nutrition_today_v2` por día: ese RPC es `volatile`
 * (materializa snapshots create-once) y revienta con fecha > hoy+1
 * (`nutrition_v2_snapshot_date_out_of_window`). Pintar la semana NUNCA debe escribir datos.
 *
 * Reglas de negocio (SPEC "Reglas de datos", auditoría de factibilidad 2026-07-29):
 *  1. La variante de cada día sale de `resolveNutritionDayVariantForDow`, que replica la regla
 *     del snapshot (match exacto de `dayOfWeek`, si no la variante base). Sin match y sin base
 *     ⇒ `null`: el snapshot tampoco prescribiría nada y NO se inventa la default.
 *  2. **El snapshot congelado del historial SIEMPRE gana sobre la proyección.** Si existe la
 *     fila del día, sus `targets` son los que el alumno realmente tuvo; así el pasado no se
 *     reescribe cuando el coach republica el plan (y la semana que cruza versiones no miente).
 *  3. `consumed = null` significa "sin registro", que NO es lo mismo que "registró cero". Un día
 *     con snapshot pero sin ingestas queda en `null`, no en ceros.
 *  4. Los días futuros nunca muestran consumo ni adherencia (solo el plan proyectado).
 *  5. Días del sistema anterior (V1): se describen con `describeLegacyHistoryDay` y su `consumed`
 *     V2 (todo ceros por construcción) se anula, para no pintar "0 kcal" falsos sobre un día que
 *     sí tuvo registros en el sistema clásico.
 *
 * Convención de `dayOfWeek`: 0=domingo … 6=sábado (idéntica a `extract(dow)` de Postgres), y la
 * semana se recorre en `NUTRITION_WEEK_ORDER` (lunes → domingo, lectura latam).
 *
 * Framework-neutral: sin React, sin DOM, sin RN. Una sola verdad para PWA y app nativa.
 */

import {
  NUTRITION_DAY_LABELS,
  NUTRITION_DAY_SHORT_LABELS,
  NUTRITION_WEEK_ORDER,
  nutritionDayOfWeekFromIso,
  resolveNutritionDayVariantForDow,
  type NutritionDayVariantLike,
} from './day-variants'
import { describeLegacyHistoryDay } from './read-models'

const MS_PER_DAY = 86_400_000

/**
 * Metas de un día. Forma estructural mínima: `NutritionMacroTargets` (plan e historial) la
 * cumple sin casts. `sodiumMg`/`waterMl` quedan opcionales porque no toda superficie las pinta.
 */
export interface NutritionWeekTargetsLike {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  fiberG: number | null
  sodiumMg?: number | null
  waterMl?: number | null
}

/** Totales consumidos de un día. `NutritionTotals` del read-model la cumple sin casts. */
export interface NutritionWeekConsumedLike {
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
  fiberG: number
  entryCount: number
}

/** Variante del plan + sus metas. `plan.dayVariants[number]` del read-model la cumple. */
export interface NutritionWeekVariantLike extends NutritionDayVariantLike {
  targets?: NutritionWeekTargetsLike | null
}

/**
 * Fila del historial de un día. `NutritionHistoryDay` (alumno: `history.items`; coach:
 * `recentDays`) la cumple sin casts. Los campos del sistema anterior son opcionales porque las
 * respuestas cacheadas del RPC previo (sobre todo la cache de RN) no los traen.
 */
export interface NutritionWeekHistoryDayLike {
  localDate: string
  targets?: NutritionWeekTargetsLike | null
  consumed?: NutritionWeekConsumedLike | null
  activeEntryCount?: number
  legacyCompletionCount?: number
  legacyDisclosure?: 'legacy_completion_without_food_detail' | null
  legacyEntryCount?: number
  legacyConsumed?: {
    calories: number
    proteinG: number
    carbsG: number
    fatsG: number
  } | null
  legacyMeals?: string[] | null
}

/**
 * Estado de una celda de la semana:
 * - `past-logged`: día pasado CON registro (V2 o del sistema anterior) ⇒ solo lectura con datos.
 * - `past-empty`: día pasado sin ningún registro ⇒ solo lectura, sin culpa ni rojo.
 * - `today`: único día con superficie de registro.
 * - `future`: plan proyectado, sin ningún control de registro.
 */
export type NutritionWeekDayState = 'past-logged' | 'past-empty' | 'today' | 'future'

/** De dónde salieron las `targets` de la celda (para no rotular una proyección como real). */
export type NutritionWeekTargetsSource = 'snapshot' | 'projected' | 'none'

/**
 * Resumen del sistema anterior (V1) del día. Es exactamente lo que devuelve
 * `describeLegacyHistoryDay` menos su bandera `isLegacy` (que la celda expone aparte), así no
 * puede quedar desincronizado con las frases visibles del historial.
 */
export type NutritionWeekLegacySummary = Omit<ReturnType<typeof describeLegacyHistoryDay>, 'isLegacy'>

/** Una celda de la semana: un día, su plan y (si lo hubo) su resultado. */
export interface NutritionWeekCell<
  TVariant extends NutritionWeekVariantLike = NutritionWeekVariantLike,
  THistory extends NutritionWeekHistoryDayLike = NutritionWeekHistoryDayLike,
> {
  /** Fecha local `YYYY-MM-DD` del día. */
  isoDate: string
  /** 0=domingo … 6=sábado. */
  dayOfWeek: number
  /** "Lu" … "Do" (mismo diccionario que la tira de variantes). */
  shortLabel: string
  /** "Lunes" … "Domingo". */
  longLabel: string
  state: NutritionWeekDayState
  /** Variante que aplica ese día; `null` = el plan no prescribe nada ese día. */
  variant: TVariant | null
  /** Snapshot del historial si la fila existe; si no, proyección de la variante; si no, `null`. */
  targets: NutritionWeekTargetsLike | null
  targetsSource: NutritionWeekTargetsSource
  /** Consumo real del día. `null` = SIN registro (≠ registro en cero). Futuro: siempre `null`. */
  consumed: NutritionWeekConsumedLike | null
  /** `true` solo en días con datos del sistema anterior (V1). Ausente si no aplica. */
  isLegacy?: boolean
  /** Frases y macros del sistema anterior; `null` cuando el día no es legacy. */
  legacy: NutritionWeekLegacySummary | null
  /** Fila cruda del historial, si existe (para detalle sin recomponer nada). */
  historyDay?: THistory
}

/** Etiqueta de estado en español latam neutro, para el `accessibilityLabel` de los chips. */
export const NUTRITION_WEEK_STATE_LABELS: Record<NutritionWeekDayState, string> = {
  'past-logged': 'con registro',
  'past-empty': 'sin registro',
  today: 'hoy',
  future: 'próximo',
}

/**
 * Fecha `YYYY-MM-DD` interpretada en UTC. Igual que `nutritionDayOfWeekFromIso`, la fecha ya
 * viene resuelta en la zona del alumno (`localDate`/`asOfDate`): interpretarla en la zona del
 * dispositivo la correría un día. La validación se delega en ese mismo helper (no se duplica).
 */
function parseNutritionIsoDate(isoDate: string | null | undefined): Date | null {
  if (typeof isoDate !== 'string') return null
  const trimmed = isoDate.trim()
  if (nutritionDayOfWeekFromIso(trimmed) == null) return null
  const parsed = Date.parse(`${trimmed}T00:00:00Z`)
  return Number.isNaN(parsed) ? null : new Date(parsed)
}

function toNutritionIsoDate(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Desplaza una fecha local `YYYY-MM-DD` en días (sin husos, sin DST). `null` si no es fecha. */
export function addNutritionDays(isoDate: string | null | undefined, days: number): string | null {
  const parsed = parseNutritionIsoDate(isoDate)
  if (parsed == null || !Number.isFinite(days)) return null
  return toNutritionIsoDate(new Date(parsed.getTime() + Math.trunc(days) * MS_PER_DAY))
}

/** Lunes de la semana que contiene `isoDate` (la semana se lee de lunes a domingo). */
export function nutritionWeekStartIso(isoDate: string | null | undefined): string | null {
  const dayOfWeek = nutritionDayOfWeekFromIso(isoDate)
  if (dayOfWeek == null) return null
  // 0=domingo cierra la semana ⇒ retrocede 6 días; el resto retrocede hasta el lunes.
  return addNutritionDays(isoDate, dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
}

/** Las 7 fechas `YYYY-MM-DD` de la semana que contiene `isoDate`, de lunes a domingo. */
export function buildNutritionWeekDates(isoDate: string | null | undefined): string[] {
  const monday = nutritionWeekStartIso(isoDate)
  if (monday == null) return []
  const dates: string[] = []
  for (let offset = 0; offset < NUTRITION_WEEK_ORDER.length; offset += 1) {
    const iso = addNutritionDays(monday, offset)
    if (iso == null) return []
    dates.push(iso)
  }
  return dates
}

/** "Lunes, con registro" — mismo texto en web y RN, sin duplicar diccionarios por superficie. */
export function formatNutritionWeekDayAccessibilityLabel(
  cell: Pick<NutritionWeekCell, 'longLabel' | 'state'>,
): string {
  return `${cell.longLabel}, ${NUTRITION_WEEK_STATE_LABELS[cell.state]}`
}

/**
 * Compone la semana Lu-Do a partir del plan ya descargado y del historial disperso.
 *
 * Siempre devuelve 7 celdas en `NUTRITION_WEEK_ORDER` (lunes → domingo). Devuelve `[]` solo si
 * `weekStartIso` no es una fecha válida: preferimos no pintar la tira antes que inventar
 * calendario. `weekStartIso` se normaliza al lunes de su semana, así que la superficie puede
 * pasar cualquier día de la semana mostrada.
 *
 * El historial puede venir disperso y con filas de semanas vecinas (el cursor `p_before` del RPC
 * no tiene cota inferior): las filas fuera de la semana simplemente no se usan, y los días sin
 * fila quedan como "sin registro" en vez de asumir 7 filas densas.
 *
 * `todayIso` inválido ⇒ ninguna celda es "hoy" y toda la semana cae a solo lectura (fail-closed:
 * nunca ofrecemos registro sobre un día que no podemos probar que es hoy).
 */
export function buildNutritionWeek<
  TVariant extends NutritionWeekVariantLike = NutritionWeekVariantLike,
  THistory extends NutritionWeekHistoryDayLike = NutritionWeekHistoryDayLike,
>(input: {
  variants: readonly TVariant[]
  history?: readonly THistory[] | null
  weekStartIso: string | null | undefined
  todayIso: string | null | undefined
}): NutritionWeekCell<TVariant, THistory>[] {
  const dates = buildNutritionWeekDates(input.weekStartIso)
  if (dates.length === 0) return []

  const variants = input.variants
  const todayIso =
    typeof input.todayIso === 'string' && nutritionDayOfWeekFromIso(input.todayIso) != null
      ? input.todayIso.trim()
      : null

  // Primera fila gana: el historial viene descendente y una fecha repetida sería un duplicado
  // de la misma jornada, no dos días distintos.
  const historyByDate = new Map<string, THistory>()
  for (const day of input.history ?? []) {
    if (day == null || typeof day.localDate !== 'string') continue
    const iso = day.localDate.trim()
    if (!historyByDate.has(iso)) historyByDate.set(iso, day)
  }

  return dates.map((isoDate) => {
    // El día de semana se deriva de la fecha (fuente de verdad); el orden Lu-Do queda garantizado
    // por `buildNutritionWeekDates`, que arranca en el lunes de la semana.
    const dayOfWeek = nutritionDayOfWeekFromIso(isoDate) ?? 0
    const variant = resolveNutritionDayVariantForDow(variants, dayOfWeek)
    const historyDay = historyByDate.get(isoDate)

    const isFuture = todayIso != null && isoDate > todayIso
    const isToday = todayIso != null && isoDate === todayIso

    const legacyDescriptor =
      historyDay == null
        ? null
        : describeLegacyHistoryDay({
            activeEntryCount: historyDay.activeEntryCount ?? 0,
            legacyDisclosure: historyDay.legacyDisclosure ?? null,
            legacyCompletionCount: historyDay.legacyCompletionCount ?? 0,
            legacyEntryCount: historyDay.legacyEntryCount,
            legacyConsumed: historyDay.legacyConsumed ?? null,
            legacyMeals: historyDay.legacyMeals ?? null,
          })

    const activeEntryCount = historyDay?.activeEntryCount ?? 0
    const hasLegacyActivity =
      legacyDescriptor != null &&
      legacyDescriptor.isLegacy &&
      (legacyDescriptor.completionCount > 0 ||
        legacyDescriptor.hasMacros ||
        (historyDay?.legacyEntryCount ?? 0) > 0)
    const hasIntake =
      activeEntryCount > 0 || (historyDay?.consumed?.entryCount ?? 0) > 0 || hasLegacyActivity

    // Regla 2: el snapshot congelado gana sobre la proyección incluso si sus metas están vacías
    // (ese día el alumno tuvo eso, no lo que el plan prescribe hoy).
    const targets = historyDay != null ? (historyDay.targets ?? null) : (variant?.targets ?? null)
    const targetsSource: NutritionWeekTargetsSource =
      targets == null ? 'none' : historyDay != null ? 'snapshot' : 'projected'

    let consumed: NutritionWeekConsumedLike | null = null
    if (!isFuture && hasIntake && !(legacyDescriptor?.legacyOnly ?? false)) {
      // Regla 3: sin registro ⇒ `null`, nunca ceros. Regla 5: en un día solo-legacy los totales
      // V2 son ceros por construcción y mentirían ("0 kcal"); ahí manda `legacy`.
      consumed = historyDay?.consumed ?? null
    }

    const state: NutritionWeekDayState = isToday
      ? 'today'
      : isFuture
        ? 'future'
        : hasIntake
          ? 'past-logged'
          : 'past-empty'

    const cell: NutritionWeekCell<TVariant, THistory> = {
      isoDate,
      dayOfWeek,
      shortLabel: NUTRITION_DAY_SHORT_LABELS[dayOfWeek],
      longLabel: NUTRITION_DAY_LABELS[dayOfWeek],
      state,
      variant,
      targets,
      targetsSource,
      consumed,
      legacy: null,
    }

    if (legacyDescriptor != null && legacyDescriptor.isLegacy) {
      cell.isLegacy = true
      cell.legacy = {
        legacyOnly: legacyDescriptor.legacyOnly,
        consumed: legacyDescriptor.consumed,
        hasMacros: legacyDescriptor.hasMacros,
        completionCount: legacyDescriptor.completionCount,
        completionsLabel: legacyDescriptor.completionsLabel,
        meals: legacyDescriptor.meals,
        mealsLabel: legacyDescriptor.mealsLabel,
        secondaryLabel: legacyDescriptor.secondaryLabel,
      }
    }
    if (historyDay != null) cell.historyDay = historyDay

    return cell
  })
}
