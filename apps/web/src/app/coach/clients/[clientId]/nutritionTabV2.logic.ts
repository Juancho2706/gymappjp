import {
  addNutritionDays,
  buildNutritionWeek,
  nutritionWeekStartIso,
  type NutritionClientDetailReadModel,
  type NutritionHistoryDay,
  type NutritionStrategy,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { resolveCoachDayAdherence } from '@/app/coach/nutrition-v2/[clientId]/_lib/week-nav'

/**
 * View model PURO del tab Nutrición V2 embebido en la ficha principal del alumno
 * (coach/clients/[clientId]). Es el contrato serializable RSC -> client component:
 * la page resuelve el canary + la lectura scoped server-side y pasa este objeto ya
 * mapeado; el componente `NutritionTabV2` solo pinta.
 *
 * Poda 2026-07-29 (auditoría "R10 — B es A recortada"): este tab dejó de clonar las cards de
 * la ficha completa (plan vigente / hoy / últimos días). Ahora es SOLO un resumen glanceable:
 * semana en dots + energía de hoy + racha + un único CTA a la ficha (`detailHref`). El detalle
 * completo vive a un clic, en la superficie A (`/coach/nutrition-v2/[clientId]`).
 */
export type NutritionTabV2DayStatus = 'done' | 'partial' | 'none' | 'future'

export interface NutritionTabV2SummaryDay {
  isoDate: string
  /** "Lu" … "Do". */
  shortLabel: string
  status: NutritionTabV2DayStatus
  isToday: boolean
}

export interface NutritionTabV2ViewModel {
  clientId: string
  clientName: string
  /** Existe algún plan V2 (para el label del CTA del builder en el estado vacío). */
  hasPlan: boolean
  /** Hay un plan VIGENTE hoy (gobierna resumen vs estado vacío). */
  hasActivePlan: boolean
  /** /coach/nutrition-v2/[clientId] — CTA "Abrir ficha de nutrición". */
  detailHref: string
  /** /coach/nutrition-v2/[clientId]/builder — CTA del estado vacío ("Crear plan"). */
  builderHref: string
  builderCtaLabel: 'Crear plan' | 'Nueva versión'
  /** Estrategia del plan vigente (null si no hay plan vigente hoy). */
  strategy: NutritionStrategy | null
  /** Semana en curso (lunes a domingo), 7 celdas; [] sin plan vigente. */
  week: NutritionTabV2SummaryDay[]
  /** Energía de HOY vs meta, para la barra del resumen. */
  today: {
    calories: { consumed: number; target: number }
  }
  /** Días de `week` con energía dentro de rango (90-110% de la meta). */
  completedCount: number
  /** Días de `week` con registro pero fuera de rango. */
  partialCount: number
  /** Racha de días consecutivos con registro, contando hacia atrás desde ayer (u hoy, si hoy ya
   *  registró algo). El día en curso nunca corta una racha previa mientras no tenga registro. */
  streakDays: number
}

export interface BuildNutritionTabV2Input {
  clientId: string
  detail: NutritionClientDetailReadModel
  /** Hoy en la zona del alumno (`YYYY-MM-DD`), la misma fecha con la que se leyó `detail`. */
  todayIso: string
  /**
   * Historial YA recortado a la ventana visible (la page reusa `filterHistoryDaysToBaseWindow`
   * cuando el coach no tiene el addon Nutrición Pro). Alimenta tanto los dots de la semana como
   * la racha: ambos son resúmenes derivados, no un listado de historial, así que respetan el
   * mismo recorte de entitlement sin gate propio.
   */
  recentDaysForDisplay: NutritionHistoryDay[]
}

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Clasifica una celda PASADA de la semana en el estado que pintan los dots del resumen (mockup
 *  "flujos podados" sección 01). `buildNutritionWeek` ya resuelve pasado/futuro y consumo desde
 *  `recentDaysForDisplay`; acá solo se decide "cumplido" (dentro de rango) vs "parcial" (con
 *  registro, fuera de rango) reusando el mismo umbral que el resto de la ficha
 *  (`resolveCoachDayAdherence`). NO se usa para HOY: ver `resolveTodaySummaryStatus`. */
function resolveSummaryDayStatus(cell: NutritionWeekCell): NutritionTabV2DayStatus {
  if (cell.state === 'future') return 'future'
  if (cell.consumed == null) return 'none'
  const adherence = resolveCoachDayAdherence(cell.consumed.calories, cell.targets?.calories ?? null)
  return adherence?.tone === 'success' ? 'done' : 'partial'
}

/**
 * Clasifica HOY para los dots del resumen. `buildNutritionWeek` compone el consumo de cada celda
 * SOLO desde `history` (`recentDaysForDisplay`), que nunca trae la fila de hoy (hoy vive en el
 * read separado `detail.today`, la única fecha que `get_nutrition_today_v2` puede materializar:
 * ver la nota "Prohibido `get_nutrition_today_v2` con fecha != hoy"). Por eso la celda de hoy que
 * arma `buildNutritionWeek` siempre trae `consumed: null`, aunque el alumno ya haya registrado
 * algo — la ficha misma esquiva esto pintando `MacroBudget` con `detail.today.*` en vez de la
 * celda. Este resolver replica esa misma fuente de verdad para el dot de hoy.
 */
function resolveTodaySummaryStatus(
  consumed: { calories: number; entryCount: number },
  targets: { calories: number | null },
): NutritionTabV2DayStatus {
  if (consumed.entryCount <= 0) return 'none'
  const adherence = resolveCoachDayAdherence(consumed.calories, targets.calories)
  return adherence?.tone === 'success' ? 'done' : 'partial'
}

/**
 * Racha de días consecutivos con registro. Puro: recibe el historial ya recortado + si HOY tiene
 * registro (fuente `detail.today.consumed`, no `recentDays`: hoy vive en un read separado). Un día
 * sin registro dentro de la ventana cargada corta la cuenta; la ventana no cargada (fuera del
 * recorte Pro) no se ve, así que la racha nunca puede sobreestimar días que no llegaron al cliente.
 */
export function computeNutritionStreakDays(input: {
  recentDays: readonly Pick<NutritionHistoryDay, 'localDate' | 'activeEntryCount' | 'consumed'>[]
  todayIso: string
  todayHasIntake: boolean
}): number {
  const byDate = new Map<string, boolean>()
  for (const day of input.recentDays) {
    if (day == null || typeof day.localDate !== 'string') continue
    if (day.localDate === input.todayIso) continue
    if (byDate.has(day.localDate)) continue
    const hasIntake = (day.activeEntryCount ?? 0) > 0 || (day.consumed?.entryCount ?? 0) > 0
    byDate.set(day.localDate, hasIntake)
  }

  let streak = input.todayHasIntake ? 1 : 0
  let cursor = addNutritionDays(input.todayIso, -1)
  // Cota defensiva: el mapa es finito (ventana ya recortada), pero nunca debe iterar sin fin si
  // `addNutritionDays` alguna vez devolviera la misma fecha.
  let guard = byDate.size + 1
  while (cursor != null && guard > 0) {
    if (byDate.get(cursor) !== true) break
    streak += 1
    guard -= 1
    cursor = addNutritionDays(cursor, -1)
  }
  return streak
}

/**
 * PURA: read model del detalle V2 + flags -> props del tab. Testeable sin server-only.
 * No hace fetching ni recorte temporal; ambos ocurren server-side en la page.
 */
export function buildNutritionTabV2ViewModel(
  input: BuildNutritionTabV2Input,
): NutritionTabV2ViewModel {
  const { clientId, detail, todayIso, recentDaysForDisplay } = input

  const hasPlan = detail.plan.plan !== null
  const activePlan = detail.today.plan
  const hasActivePlan = activePlan !== null

  const consumed = detail.today.consumed
  const targets = detail.today.targets
  const todayHasIntake = consumed.entryCount > 0

  const weekStartIso = nutritionWeekStartIso(todayIso) ?? todayIso
  const weekCells = hasActivePlan
    ? buildNutritionWeek({
        variants: detail.plan.dayVariants,
        history: recentDaysForDisplay,
        weekStartIso,
        todayIso,
      })
    : []

  const week: NutritionTabV2SummaryDay[] = weekCells.map((cell) => {
    const isToday = cell.state === 'today'
    return {
      isoDate: cell.isoDate,
      shortLabel: cell.shortLabel,
      isToday,
      status: isToday ? resolveTodaySummaryStatus(consumed, targets) : resolveSummaryDayStatus(cell),
    }
  })

  return {
    clientId,
    clientName: detail.client.fullName,
    hasPlan,
    hasActivePlan,
    detailHref: `/coach/nutrition-v2/${clientId}`,
    builderHref: `/coach/nutrition-v2/${clientId}/builder`,
    builderCtaLabel: hasPlan ? 'Nueva versión' : 'Crear plan',
    strategy: activePlan?.strategy ?? null,
    week,
    today: {
      calories: { consumed: num(consumed.calories), target: num(targets.calories) },
    },
    completedCount: week.filter((day) => day.status === 'done').length,
    partialCount: week.filter((day) => day.status === 'partial').length,
    streakDays: hasActivePlan
      ? computeNutritionStreakDays({ recentDays: recentDaysForDisplay, todayIso, todayHasIntake })
      : 0,
  }
}
