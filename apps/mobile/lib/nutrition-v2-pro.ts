/**
 * nutrition-v2-pro — gating comercial PURO (sin react-native / supabase) del addon "Nutrición Pro"
 * en la ficha coach V2. Espejo RN del subconjunto de `apps/web/.../nutrition-v2/_lib/nutrition-pro.ts`
 * que la ficha necesita: el mismo module key que V1 (`nutrition_exchanges`) y la ventana BASE de
 * historial (~30 dias) que ve el coach sin el addon.
 *
 * FRONTERA (decision CEO 2026-07-15): sin addon, el historial del alumno para el coach se limita a
 * ~30 dias. El API movil coach (`get_nutrition_client_detail_scoped_v2`) YA corta server-side, asi
 * que la ficha solo REFLEJA el banner de upsell; el recorte cliente aqui es defensa en profundidad
 * para que RN nunca muestre >30 dias aunque el servidor no cortara. La barrera de dinero vive en el
 * servidor (assertModule), no en la UI.
 */

import type { ModuleKey } from './entitlements-core'

/** Mismo entitlement que V1: el addon Pro de nutricion. */
export const NUTRITION_PRO_MODULE_KEY: ModuleKey = 'nutrition_exchanges'

/** Ventana de historial (dias) visible para el coach base, sin el addon Pro. */
export const NUTRITION_PRO_HISTORY_DAYS_BASE = 30

/** Copy del banner de upsell (paridad con web). */
export const NUTRITION_PRO_HISTORY_BANNER_LABEL = 'Histórico completo con Nutrición Pro'

/** Resta `days` dias a una fecha ISO (YYYY-MM-DD) en UTC; el orden lexicografico = cronologico. */
function subtractIsoDays(isoDate: string, days: number): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  parsed.setUTCDate(parsed.getUTCDate() - days)
  return parsed.toISOString().slice(0, 10)
}

/**
 * PURA: recorta una lista de dias de historial a la ventana BASE (por defecto 30 dias hasta
 * `today`, inclusive). Los ISO dates comparan lexicograficamente. Defensa en profundidad: el API
 * movil ya corta server-side, esto garantiza el limite aunque no lo hiciera.
 */
export function filterHistoryDaysToBaseWindow<T extends { localDate: string }>(
  days: readonly T[],
  today: string,
  windowDays: number = NUTRITION_PRO_HISTORY_DAYS_BASE,
): T[] {
  const cutoff = subtractIsoDays(today, windowDays)
  return days.filter((day) => day.localDate >= cutoff)
}

/**
 * PURA: ¿mostrar el banner "Histórico completo con Nutrición Pro"? Se muestra cuando el entitlement
 * local dice SIN addon. Fail-safe: si el entitlement aun no resolvio (`hasNutritionPro` false por
 * default) mostramos el banner, coherente con el recorte server-side.
 */
export function shouldShowNutritionProHistoryBanner(opts: { hasNutritionPro: boolean }): boolean {
  return !opts.hasNutritionPro
}
