import {
  createNutritionMacroValue,
  type NutritionClientDetailReadModel,
  type NutritionHistoryDay,
  type NutritionMacroValue,
  type NutritionStrategy,
} from '@eva/nutrition-v2'

/**
 * View model PURO del tab Nutrición V2 embebido en la ficha principal del alumno
 * (coach/clients/[clientId]). Es el contrato serializable RSC -> client component:
 * la page resuelve el canary + la lectura scoped server-side y pasa este objeto ya
 * mapeado; el componente `NutritionTabV2` solo pinta.
 *
 * Reglas de negocio reflejadas (espejo de la ficha V2 existente):
 *  - `hasPlan`: existe ALGÚN plan (draft/publicado) -> gobierna el label del CTA del
 *    builder ("Crear plan" vs "Nueva versión").
 *  - `plan`: el plan VIGENTE HOY (`today.plan`). Si es null -> estado vacío con CTA al
 *    builder (aunque exista un plan histórico, no hay estructura vigente que mostrar).
 *  - `showHistoryUpgradeCta`: sin el addon Nutrición Pro el coach ve el histórico del
 *    alumno recortado a la ventana base (~30d) -> se ofrece el upgrade. El recorte real
 *    lo hace la page con `filterHistoryDaysToBaseWindow` (server-only); acá solo llega el
 *    set ya recortado y el flag para el copy.
 */
export interface NutritionTabV2ViewModel {
  clientId: string
  clientName: string
  /** Existe algún plan V2 (para el label del CTA del builder). */
  hasPlan: boolean
  /** Hay un plan VIGENTE hoy (gobierna resumen vs estado vacío). */
  hasActivePlan: boolean
  /** /coach/nutrition-v2/[clientId] — "Abrir ficha nutrición completa". */
  detailHref: string
  /** /coach/nutrition-v2/[clientId]/builder — "Crear plan" / "Nueva versión". */
  builderHref: string
  /** Ruta canónica de compra/activación del addon Pro. */
  historyUpgradeHref: string
  builderCtaLabel: 'Crear plan' | 'Nueva versión'
  /** Resumen del plan vigente (null si no hay plan vigente hoy). */
  plan: {
    strategy: NutritionStrategy
    versionNumber: number
    status: 'published' | 'superseded'
    effectiveFrom: string
    /** `effectiveFrom` formateado es-CL ("15 jul 2026") para pintar sin fechas ISO crudas. */
    effectiveFromLabel: string
    name: string | null
    visibleNotes: string | null
  } | null
  /** Consumo de HOY vs meta (kcal + macros) del read model del día. */
  today: {
    calories: { consumed: number; target: number }
    macros: NutritionMacroValue[]
    remainingCalories: number
    entryCount: number
    mealSlotCount: number
  }
  /** Últimos días (ya recortados a la ventana base si no hay addon Pro). */
  recentDays: Array<{ localDate: string; label: string; calories: number; entryCount: number }>
  /** Sin addon Pro -> mostrar CTA "Histórico completo con Nutrición Pro". */
  showHistoryUpgradeCta: boolean
}

export interface BuildNutritionTabV2Input {
  clientId: string
  detail: NutritionClientDetailReadModel
  /** Entitlement del addon `nutrition_exchanges` resuelto server-side (fail-closed). */
  nutritionProEnabled: boolean
  /**
   * Últimos días YA recortados a la ventana visible (la page reusa
   * `filterHistoryDaysToBaseWindow` cuando no hay addon Pro). El mapper no vuelve a
   * recortar: solo proyecta.
   */
  recentDaysForDisplay: NutritionHistoryDay[]
  /** Ruta de compra/activación del addon (default: la canónica de módulos). */
  historyUpgradeHref?: string
}

const DEFAULT_HISTORY_UPGRADE_HREF = '/coach/settings/modules'

function num(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

const ES_CL_DATE_FORMAT = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/**
 * Formatea una fecha LOCAL `YYYY-MM-DD` a es-CL ("15 jul 2026") SIN desfase de zona.
 * Parseamos los componentes a mano y construimos la fecha en UTC (y la formateamos en UTC),
 * de modo que el día jamás se corre por timezone: `new Date('2026-07-15')` sería medianoche
 * UTC y en zonas negativas (Chile) mostraría el día anterior. Si el string no calza con el
 * patrón, se devuelve tal cual (defensivo).
 */
export function formatLocalDateEsCl(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) return localDate
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return localDate
  return ES_CL_DATE_FORMAT.format(date)
}

/**
 * PURA: read model del detalle V2 + flags -> props del tab. Testeable sin server-only.
 * No hace fetching ni recorte temporal; ambos ocurren server-side en la page.
 */
export function buildNutritionTabV2ViewModel(
  input: BuildNutritionTabV2Input,
): NutritionTabV2ViewModel {
  const { clientId, detail, nutritionProEnabled, recentDaysForDisplay } = input

  const hasPlan = detail.plan.plan !== null
  const activePlan = detail.today.plan
  const hasActivePlan = activePlan !== null

  const consumed = detail.today.consumed
  const targets = detail.today.targets
  const remaining = detail.today.remaining

  const targetCalories = num(targets.calories)
  const consumedCalories = num(consumed.calories)
  const remainingCalories =
    remaining.calories != null && Number.isFinite(remaining.calories)
      ? Math.max(num(remaining.calories), 0)
      : Math.max(targetCalories - consumedCalories, 0)

  const macros: NutritionMacroValue[] = [
    createNutritionMacroValue('protein', {
      consumed: num(consumed.proteinG),
      target: num(targets.proteinG),
    }),
    createNutritionMacroValue('carbs', {
      consumed: num(consumed.carbsG),
      target: num(targets.carbsG),
    }),
    createNutritionMacroValue('fats', {
      consumed: num(consumed.fatsG),
      target: num(targets.fatsG),
    }),
  ]

  return {
    clientId,
    clientName: detail.client.fullName,
    hasPlan,
    hasActivePlan,
    detailHref: `/coach/nutrition-v2/${clientId}`,
    builderHref: `/coach/nutrition-v2/${clientId}/builder`,
    historyUpgradeHref: input.historyUpgradeHref ?? DEFAULT_HISTORY_UPGRADE_HREF,
    builderCtaLabel: hasPlan ? 'Nueva versión' : 'Crear plan',
    plan: activePlan
      ? {
          strategy: activePlan.strategy,
          versionNumber: activePlan.versionNumber,
          status: activePlan.status,
          effectiveFrom: activePlan.effectiveFrom,
          effectiveFromLabel: formatLocalDateEsCl(activePlan.effectiveFrom),
          name: detail.plan.plan?.name ?? activePlan.name,
          visibleNotes: detail.plan.visibleNotes,
        }
      : null,
    today: {
      calories: { consumed: consumedCalories, target: targetCalories },
      macros,
      remainingCalories,
      entryCount: consumed.entryCount,
      mealSlotCount: detail.today.mealSlots.length,
    },
    recentDays: recentDaysForDisplay.map((day) => ({
      localDate: day.localDate,
      label: formatLocalDateEsCl(day.localDate),
      calories: num(day.consumed.calories),
      entryCount: day.activeEntryCount,
    })),
    showHistoryUpgradeCta: !nutritionProEnabled,
  }
}
