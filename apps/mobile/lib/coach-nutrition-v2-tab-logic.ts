/**
 * coach-nutrition-v2-tab-logic — helper PURO (sin react-native / supabase) del tab Nutrición V2
 * embebido en la ficha del alumno del coach. Espejo RN 1:1 de
 * `apps/web/src/app/coach/clients/[clientId]/nutritionTabV2.logic.ts` (view model del
 * `NutritionTabV2` web): misma forma, mismos labels y las mismas reglas de negocio.
 *
 * Diferencias deliberadas (adaptación nativa, documentadas en
 * docs/rn-port/specs/seccion-3/verify-fix/ficha-nutricion-v2.md):
 *  - `detailHref`/`builderHref` apuntan a las rutas expo-router del monorepo móvil
 *    (`/coach/nutrition-v2/[clientId]` y `/coach/nutrition-v2/builder/[clientId]`), no a los
 *    segmentos Next (`.../builder`). Mismo destino funcional.
 *  - El recorte del historial sin addon Pro ocurre en el componente (cliente) con
 *    `filterHistoryDaysToBaseWindow`, porque RN no tiene RSC; misma función y ventana que web.
 */
import {
  createNutritionMacroValue,
  type NutritionClientDetailReadModel,
  type NutritionHistoryDay,
  type NutritionMacroValue,
  type NutritionStrategy,
} from '@eva/nutrition-v2'

/**
 * View model del tab (contrato de render de `NutritionV2Summary`). Espejo campo a campo del
 * `NutritionTabV2ViewModel` web:
 *  - `hasPlan`: existe ALGÚN plan (vigente publicado) → gobierna el label del CTA del builder
 *    ("Crear plan" vs "Nueva versión") — web nutritionTabV2.logic.ts:120,158.
 *  - `plan`: el plan VIGENTE HOY (`today.plan`). Si es null → estado vacío con CTA al builder
 *    (web nutritionTabV2.logic.ts:121-122,159).
 *  - `showHistoryUpgradeCta`: sin el addon Nutrición Pro el histórico se recorta a la ventana
 *    base (~30d) y se ofrece el upgrade (web nutritionTabV2.logic.ts:183).
 */
export interface NutritionTabV2ViewModel {
  clientId: string
  clientName: string
  /** Existe algún plan V2 (para el label del CTA del builder). */
  hasPlan: boolean
  /** Hay un plan VIGENTE hoy (gobierna resumen vs estado vacío). */
  hasActivePlan: boolean
  /** Ruta expo-router de la ficha nutrición completa. */
  detailHref: string
  /** Ruta expo-router del builder V2. */
  builderHref: string
  /** Ruta canónica de upgrade del addon Pro (web: '/coach/subscription'). */
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
  /** Sin addon Pro → mostrar CTA "Histórico completo con Nutrición Pro". */
  showHistoryUpgradeCta: boolean
}

export interface BuildNutritionTabV2Input {
  clientId: string
  detail: NutritionClientDetailReadModel
  /** Entitlement del addon `nutrition_exchanges` (useEntitlements().hasModule, fail-closed). */
  nutritionProEnabled: boolean
  /** Últimos días YA recortados a la ventana visible. El mapper no vuelve a recortar. */
  recentDaysForDisplay: NutritionHistoryDay[]
  /** Ruta de upgrade del addon (default: la canónica web '/coach/subscription'). */
  historyUpgradeHref?: string
}

// Nutrición Pro viene incluido en los planes pagos — el CTA apunta al upgrade de plan
// (web nutritionTabV2.logic.ts:80 DEFAULT_HISTORY_UPGRADE_HREF).
const DEFAULT_HISTORY_UPGRADE_HREF = '/coach/subscription'

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
 * Formatea una fecha LOCAL `YYYY-MM-DD` a es-CL ("15 jul 2026") SIN desfase de zona
 * (espejo exacto de web nutritionTabV2.logic.ts:100-109). Componentes parseados a mano y
 * fecha construida/formateada en UTC para que el día jamás se corra por timezone. Si el
 * string no calza con el patrón, se devuelve tal cual (defensivo).
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
 * 4B-04 — Decisión de swap del tab GLOBAL "Nutrición" del coach (NO confundir con el
 * view model per-alumno de arriba). Espejo del swap web
 * `nutrition-plans/_lib/nutrition-v2-swap.ts:19-31` + `page.tsx:38-40` y del gate del
 * tab del alumno 4A-01 (`alumno/(tabs)/nutricion.tsx`): con entitlements listos y el
 * flag `nutritionV2Coach` ON el tab abre el Centro V2; OFF → shell V1 (rollback puro,
 * decisión owner 1). Mientras los entitlements no estén hidratados NO se decide todavía
 * (`'loading'`) para NUNCA flashear V1 antes de resolver el swap. PURA (sin
 * react-native / supabase) y por eso testeable de forma aislada.
 *
 * Fail-closed: el flag default del bundle es `false` (`lib/flags.ts:19`); solo el Edge
 * Config remoto lo abre. Esta decisión usa el MISMO flag que el hub V2
 * (`nutrition-v2/index.tsx:81`) y no lo debilita: el hub conserva su propio gate más
 * estricto (entitlements + scope de workspace), así que `'v2'` aquí solo elige QUÉ
 * superficie montar, no autoriza datos.
 */
export type CoachNutritionTabMode = 'loading' | 'v1' | 'v2'

export function resolveCoachNutritionTabMode(input: {
  /** `useEntitlements().ready` — config remota (flags incluidos) ya hidratada. */
  entitlementsReady: boolean
  /** `isEnabled('nutritionV2Coach')` — mismo flag que el hub V2, fail-closed. */
  nutritionV2CoachEnabled: boolean
}): CoachNutritionTabMode {
  if (!input.entitlementsReady) return 'loading'
  return input.nutritionV2CoachEnabled ? 'v2' : 'v1'
}

/**
 * PURA: read model del detalle V2 + flags → props del tab. Espejo 1:1 de
 * `buildNutritionTabV2ViewModel` web (nutritionTabV2.logic.ts:115-185).
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
    builderHref: `/coach/nutrition-v2/builder/${clientId}`,
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
