/**
 * Seleccion de candidatos Nutricion V2 para el recordatorio diario — helpers PUROS.
 *
 * El cron no puede llamar `get_nutrition_today_v2` (es `volatile`: materializa el snapshot del
 * dia y revienta con fecha > hoy+1) ni ninguna RPC por alumno dentro de un loop. Asi que la
 * pregunta "¿este alumno tiene plan V2 vigente hoy y que comidas le tocan?" se responde con
 * selects planos batcheados + estos helpers, que REPLICAN —sin inventar reglas— el selector
 * del servidor (`private.nutrition_v2_ensure_day_snapshot` /
 * `nutrition_v2_rederive_day_snapshot`, migracion 20260728120500):
 *
 *   version:  status in ('published','superseded') and effective_from <= hoy
 *             and (effective_to is null or effective_to >= hoy)
 *             order by effective_from desc, published_at desc nulls last,
 *                      version_number desc, id desc  limit 1
 *   variante: day_of_week = extract(dow from hoy) or is_default
 *             order by (match exacto primero), order_index, created_at  limit 1
 *
 * La ventana de fechas la filtra la query (indice + menos filas en el wire); aca vive el
 * DESEMPATE, que es la parte con riesgo real de drift. `day_of_week` es convencion Postgres
 * `extract(dow)`: 0=domingo … 6=sabado (NO la de V1, que es 1=Lun … 7=Dom).
 */

import { nutritionDayOfWeekFromIso, resolveNutritionDayVariantForDow } from '@eva/nutrition-v2'

/** Raiz de plan V2 activa (`lifecycle_status = 'active'`). */
export type NutritionV2PlanRow = {
  id: string
  client_id: string
}

/** Version vigente candidata: la query ya la acoto a published/superseded dentro de la ventana. */
export type NutritionV2VersionRow = {
  id: string
  plan_id: string
  version_number: number
  effective_from: string | null
  published_at: string | null
}

export type NutritionV2VariantRow = {
  id: string
  version_id: string
  day_of_week: number | null
  is_default: boolean
  order_index: number
  created_at: string
}

export type NutritionV2MealSlotRow = {
  day_variant_id: string
  name: string | null
  order_index: number
}

/** `desc nulls last` de Postgres para cadenas comparables (fechas ISO y timestamptz). */
function compareDescNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? 1 : -1
}

/**
 * Version V2 vigente hoy por alumno. Devuelve `Map<client_id, version_id>`; un alumno sin
 * version dentro de la ventana simplemente no aparece (no es candidato V2).
 */
export function pickEffectiveV2VersionByClient(
  plans: readonly NutritionV2PlanRow[],
  versions: readonly NutritionV2VersionRow[],
): Map<string, string> {
  const clientIdByPlanId = new Map(plans.map((plan) => [plan.id, plan.client_id]))

  const byClient = new Map<string, NutritionV2VersionRow>()
  for (const version of versions) {
    const clientId = clientIdByPlanId.get(version.plan_id)
    if (!clientId) continue
    const current = byClient.get(clientId)
    if (current == null || compareV2Versions(version, current) < 0) byClient.set(clientId, version)
  }

  return new Map([...byClient].map(([clientId, version]) => [clientId, version.id]))
}

/** Orden del selector del servidor: menor = gana. */
function compareV2Versions(a: NutritionV2VersionRow, b: NutritionV2VersionRow): number {
  return (
    compareDescNullsLast(a.effective_from, b.effective_from) ||
    compareDescNullsLast(a.published_at, b.published_at) ||
    b.version_number - a.version_number ||
    compareDescNullsLast(a.id, b.id)
  )
}

/**
 * Variante de dia que aplica HOY por version: `Map<version_id, day_variant_id>`. Gana el match
 * exacto de `day_of_week` y si no hay cae al dia base — la misma regla del snapshot, reusando
 * el helper puro compartido web/RN (`@eva/nutrition-v2`) en vez de reescribirla aca.
 */
export function pickV2DayVariantByVersion(
  variants: readonly NutritionV2VariantRow[],
  todayIso: string,
): Map<string, string> {
  const dayOfWeek = nutritionDayOfWeekFromIso(todayIso)

  const byVersion = new Map<string, NutritionV2VariantRow[]>()
  for (const variant of variants) {
    const bucket = byVersion.get(variant.version_id)
    if (bucket) bucket.push(variant)
    else byVersion.set(variant.version_id, [variant])
  }

  const out = new Map<string, string>()
  for (const [versionId, bucket] of byVersion) {
    // El desempate del RPC es `order_index, created_at`; el helper respeta el orden del arreglo.
    const ordered = [...bucket].sort(
      (a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at),
    )
    const picked = resolveNutritionDayVariantForDow(
      ordered.map((variant) => ({ id: variant.id, dayOfWeek: variant.day_of_week, isDefault: variant.is_default })),
      dayOfWeek,
    )
    if (picked?.id) out.set(versionId, picked.id)
  }
  return out
}

/**
 * Nombres de las franjas de cada variante, en orden de lectura y sin repetidos:
 * `Map<day_variant_id, string[]>`. Alimenta el cuerpo meal-aware del push.
 */
export function buildV2MealNamesByVariant(
  slots: readonly NutritionV2MealSlotRow[],
): Map<string, string[]> {
  const byVariant = new Map<string, NutritionV2MealSlotRow[]>()
  for (const slot of slots) {
    const bucket = byVariant.get(slot.day_variant_id)
    if (bucket) bucket.push(slot)
    else byVariant.set(slot.day_variant_id, [slot])
  }

  const out = new Map<string, string[]>()
  for (const [variantId, bucket] of byVariant) {
    const names = [
      ...new Set(
        [...bucket]
          .sort((a, b) => a.order_index - b.order_index)
          .map((slot) => slot.name?.trim())
          .filter((name): name is string => !!name),
      ),
    ]
    if (names.length > 0) out.set(variantId, names)
  }
  return out
}
