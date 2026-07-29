import {
  addNutritionDays,
  buildNutritionWeek,
  nutritionWeekStartIso,
  sortNutritionDayVariantsForDisplay,
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

/** Umbral de riesgo de nutrición (mismo 60 % que el resto de la ficha y `@eva/profile-analytics`). */
export const NUTRITION_V2_RISK_BELOW_PCT = 60

/** Meta de energía de una variante del plan (multi-día: una entrada por variante). */
export interface NutritionV2DayTarget {
  /** Etiqueta de la variante ("Base", "Sábado"…). */
  label: string
  /** Meta de energía de la variante; `null` si la variante no fija kcal. */
  calories: number | null
}

/**
 * Señal de nutrición V2 del alumno — FUENTE ÚNICA de todas las superficies de la ficha que
 * hablan de nutrición fuera del tab: chip del hero, anillo "Nutrición" del Resumen, pill de
 * la card Programa, badge del tab, `attentionScore` y la sección del PDF (dossier).
 *
 * Antes cada una leía las tablas V1 (`daily_nutrition_logs` + `nutrition_meal_logs`) mientras
 * el tab y la ficha dedicada leían V2 ⇒ un alumno que registra en V2 veía "0 / 1 comidas",
 * anillo 0 %, "Nutrición en riesgo" pulsante y un PDF con el plan V1 obsoleto, con la semana
 * verde al lado (auditoría `audit3-perfil-cliente.md` §2.2).
 *
 * Regla de honestidad: sin plan V2 vigente (o sin ningún día de la semana cubierto por el plan)
 * los campos derivados quedan `null` y la señal se OMITE en cada superficie. Nunca se afirma
 * riesgo por falta de datos, y jamás se cae a V1.
 */
export interface NutritionV2Signal {
  /** Hay un plan VIGENTE hoy (gobierna resumen vs estado vacío, y si hay señal que mostrar). */
  hasActivePlan: boolean
  /** Nombre del plan vigente (null sin plan vigente). */
  planName: string | null
  /** Energía de HOY vs meta, para la barra del resumen y el chip del hero. */
  today: {
    calories: { consumed: number; target: number }
  }
  /** % de la meta de energía consumido HOY; `null` si el plan no fija kcal. */
  todayPct: number | null
  /** Metas de macros de HOY (variante vigente) — alimenta los chips del PDF. */
  todayMacroTargets: {
    calories: number | null
    proteinG: number | null
    carbsG: number | null
    fatsG: number | null
  }
  /** Franjas prescritas para HOY (variante vigente). */
  todaySlotCount: number
  /**
   * Adherencia de la SEMANA en curso: días en rango / días ya transcurridos que el plan cubre
   * (hoy solo cuenta si ya registró algo, igual que la racha). `null` = sin dato honesto
   * (sin plan vigente, o el plan arrancó después de todos los días transcurridos).
   */
  weeklyInRangePct: number | null
  weeklyInRangeDays: number
  weeklyTrackedDays: number
  /** `true`/`false` solo con dato real; `null` ⇒ la señal se omite (no penaliza, no alarma). */
  isAtRisk: boolean | null
  /** Metas de energía por variante; >1 entrada ⇒ el plan es multi-día. */
  dayTargets: NutritionV2DayTarget[]
  /** Días de `week` con energía dentro de rango (90-110% de la meta). */
  completedCount: number
  /** Días de `week` con registro pero fuera de rango. */
  partialCount: number
  /** Racha de días consecutivos con registro, contando hacia atrás desde ayer (u hoy, si hoy ya
   *  registró algo). El día en curso nunca corta una racha previa mientras no tenga registro. */
  streakDays: number
}

export interface NutritionTabV2ViewModel extends NutritionV2Signal {
  clientId: string
  clientName: string
  /** Existe algún plan V2 (para el label del CTA del builder en el estado vacío). */
  hasPlan: boolean
  /** /coach/nutrition-v2/[clientId] — CTA "Abrir ficha de nutrición". */
  detailHref: string
  /** /coach/nutrition-v2/[clientId]/builder — CTA del estado vacío ("Crear plan"). */
  builderHref: string
  builderCtaLabel: 'Crear plan' | 'Nueva versión'
  /** Estrategia del plan vigente (null si no hay plan vigente hoy). */
  strategy: NutritionStrategy | null
  /** Semana en curso (lunes a domingo), 7 celdas; [] sin plan vigente. */
  week: NutritionTabV2SummaryDay[]
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

function numOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Adherencia semanal V2 (la que pinta el anillo "Nutrición" y decide `isAtRisk`).
 *
 * Cuenta los días de la semana YA TRANSCURRIDOS que el plan cubre (`effectiveFrom` en adelante:
 * un plan publicado el miércoles no puede "reprobar" el lunes) y mide cuántos cerraron dentro de
 * rango. Hoy solo entra al denominador si ya registró algo — misma convención que la racha: el
 * día en curso no penaliza mientras siga abierto.
 *
 * `null` cuando no hay ningún día computable ⇒ la ficha OMITE la señal en vez de mostrar 0 %.
 */
export function computeNutritionWeeklyAdherence(input: {
  week: readonly NutritionTabV2SummaryDay[]
  /** `effectiveFrom` del plan vigente; `null` = sin recorte por inicio de plan. */
  planEffectiveFrom: string | null
  todayHasIntake: boolean
}): { pct: number | null; inRangeDays: number; trackedDays: number } {
  const covered = (isoDate: string) =>
    input.planEffectiveFrom == null || isoDate >= input.planEffectiveFrom

  let trackedDays = 0
  let inRangeDays = 0
  for (const day of input.week) {
    if (day.status === 'future') continue
    if (!covered(day.isoDate)) continue
    // El día en curso todavía no es un veredicto: entra solo si ya registró algo.
    if (day.isToday && !input.todayHasIntake) continue
    trackedDays += 1
    if (day.status === 'done') inRangeDays += 1
  }

  return {
    pct: trackedDays > 0 ? Math.round((inRangeDays / trackedDays) * 100) : null,
    inRangeDays,
    trackedDays,
  }
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

  // Señal semanal + riesgo: se computan UNA vez acá y viajan a hero/anillo/pill/badge/score/PDF.
  const weekly = computeNutritionWeeklyAdherence({
    week,
    planEffectiveFrom: activePlan?.effectiveFrom ?? null,
    todayHasIntake,
  })
  const targetCalories = numOrNull(targets.calories)

  return {
    clientId,
    clientName: detail.client.fullName,
    hasPlan,
    hasActivePlan,
    planName: activePlan?.name?.trim() ? activePlan.name.trim() : null,
    detailHref: `/coach/nutrition-v2/${clientId}`,
    builderHref: `/coach/nutrition-v2/${clientId}/builder`,
    builderCtaLabel: hasPlan ? 'Nueva versión' : 'Crear plan',
    strategy: activePlan?.strategy ?? null,
    week,
    today: {
      calories: { consumed: num(consumed.calories), target: num(targets.calories) },
    },
    // Derivados de HOY: solo con plan vigente. Sin plan no hay meta que comparar ⇒ `null`
    // (la ficha muestra "—", nunca un 0 % que el coach lea como incumplimiento).
    todayPct:
      hasActivePlan && targetCalories != null && targetCalories > 0
        ? Math.round((num(consumed.calories) / targetCalories) * 100)
        : null,
    todayMacroTargets: {
      calories: hasActivePlan ? targetCalories : null,
      proteinG: hasActivePlan ? numOrNull(targets.proteinG) : null,
      carbsG: hasActivePlan ? numOrNull(targets.carbsG) : null,
      fatsG: hasActivePlan ? numOrNull(targets.fatsG) : null,
    },
    todaySlotCount:
      hasActivePlan && Array.isArray(detail.today.mealSlots) ? detail.today.mealSlots.length : 0,
    weeklyInRangePct: hasActivePlan ? weekly.pct : null,
    weeklyInRangeDays: hasActivePlan ? weekly.inRangeDays : 0,
    weeklyTrackedDays: hasActivePlan ? weekly.trackedDays : 0,
    isAtRisk:
      hasActivePlan && weekly.pct != null ? weekly.pct < NUTRITION_V2_RISK_BELOW_PCT : null,
    dayTargets: hasActivePlan
      ? sortNutritionDayVariantsForDisplay(detail.plan.dayVariants ?? []).map((variant) => ({
          label: variant.label?.trim() || 'Plan del día',
          calories: numOrNull(variant.targets?.calories),
        }))
      : [],
    completedCount: week.filter((day) => day.status === 'done').length,
    partialCount: week.filter((day) => day.status === 'partial').length,
    streakDays: hasActivePlan
      ? computeNutritionStreakDays({ recentDays: recentDaysForDisplay, todayIso, todayHasIntake })
      : 0,
  }
}
