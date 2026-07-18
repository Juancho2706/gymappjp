/**
 * nutrition-v2-hub — logica PURA (sin react-native / supabase) del Centro de Nutricion V2 coach.
 *
 * Espejo RN de los helpers de `apps/web/.../nutrition-v2/_lib/hub-roster.ts`. El RPC del hub
 * (`get_nutrition_coach_hub_scoped_v2`) NO acepta busqueda/orden server-side (solo keyset por
 * `updatedAt` + `pageSize`), asi que el filtrado por atencion y las metricas se derivan
 * client-side sobre la pagina ya cargada. Esto mantiene la pantalla como capa delgada y deja la
 * logica testeable con el runner del repo (vitest).
 */

export type NutritionAttentionReason = 'no_plan' | 'draft_pending' | 'no_recent_intake' | 'none'

export type NutritionAttentionFilter =
  | 'all'
  | 'needs_attention'
  | 'no_plan'
  | 'draft_pending'
  | 'no_recent_intake'

export const NUTRITION_ATTENTION_FILTER_OPTIONS: ReadonlyArray<{
  value: NutritionAttentionFilter
  label: string
}> = [
  { value: 'all', label: 'Todos' },
  { value: 'needs_attention', label: 'Requieren atención' },
  { value: 'no_plan', label: 'Sin plan V2' },
  { value: 'draft_pending', label: 'Borrador pendiente' },
  { value: 'no_recent_intake', label: 'Sin consumo reciente' },
]

/** Etiqueta legible del motivo de atencion (para la card del alumno). */
export function nutritionAttentionLabel(reason: NutritionAttentionReason): string {
  switch (reason) {
    case 'no_plan':
      return 'Sin plan V2'
    case 'draft_pending':
      return 'Borrador pendiente'
    case 'no_recent_intake':
      return 'Sin consumo reciente'
    default:
      return 'Al día'
  }
}

/** Forma minima que necesitan los helpers de filtro/metricas. */
export interface NutritionHubItemLike {
  clientName: string
  planId: string | null
  planStatus: string | null
  attentionReason: NutritionAttentionReason
  lastIntakeAt: string | null
}

function matchesAttention(reason: NutritionAttentionReason, filter: NutritionAttentionFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'needs_attention') return reason !== 'none'
  return reason === filter
}

/**
 * Filtra la pagina cargada por chip de atencion (el orden del servidor -updatedAt desc- se
 * respeta; no hay reordenamiento en el hub RN). Generico para preservar el tipo del item.
 */
export function applyNutritionAttentionFilter<T extends NutritionHubItemLike>(
  items: readonly T[],
  filter: NutritionAttentionFilter,
): T[] {
  return items.filter((item) => matchesAttention(item.attentionReason, filter))
}

/**
 * Label del CTA de plan por alumno. Espeja `planCtaLabel` de web / `builderCtaLabel` de V1: si ya
 * hay un plan PUBLICADO se ofrece "Nueva versión"; en cualquier otro caso (sin plan o solo
 * borrador) "Crear plan".
 */
export function nutritionPlanCtaLabel(planStatus: string | null): 'Crear plan' | 'Nueva versión' {
  return planStatus === 'published' ? 'Nueva versión' : 'Crear plan'
}

/**
 * Href convenido hacia el builder (pantalla de otro agente). Se usa query `clientId` para no
 * acoplarse a un segmento dinamico que aun no exista.
 */
export function nutritionV2BuilderHref(clientId: string): string {
  return `/coach/nutrition-v2/builder?clientId=${encodeURIComponent(clientId)}`
}

/** Fecha local (YYYY-MM-DD) de un ISO en la zona horaria dada; null si no parsea. */
export function localDateOf(iso: string, timeZone: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export interface NutritionHubMetrics {
  /** Tamano de la pagina cargada (no el total del scope si hay paginacion). */
  total: number
  withPlan: number
  withoutPlan: number
  activeToday: number
}

/**
 * Deriva metricas de cabecera del payload ya cargado (sin queries nuevas): alumnos con plan V2,
 * sin plan, y con actividad hoy (ultimo registro cae en la fecha local del coach).
 */
export function mapNutritionHubMetrics<T extends NutritionHubItemLike>(
  items: readonly T[],
  opts: { todayLocalDate: string; timeZone: string },
): NutritionHubMetrics {
  let withPlan = 0
  let withoutPlan = 0
  let activeToday = 0
  for (const item of items) {
    if (item.planId) withPlan += 1
    else withoutPlan += 1
    if (item.lastIntakeAt && localDateOf(item.lastIntakeAt, opts.timeZone) === opts.todayLocalDate) {
      activeToday += 1
    }
  }
  return { total: items.length, withPlan, withoutPlan, activeToday }
}

/**
 * ¿La pagina cargada es el roster COMPLETO del scope? Solo entonces las metricas de cabecera son
 * totales reales. Si hay pagina siguiente (`hasMore`) o entramos via cursor (`hasIncomingCursor`),
 * las metricas son un resumen de la pagina visible y deben rotularse "de esta página".
 */
export function isNutritionHubPageComplete(opts: {
  hasMore: boolean
  hasIncomingCursor: boolean
}): boolean {
  return !opts.hasMore && !opts.hasIncomingCursor
}

/** Sufijo de las metricas segun si la pagina es total real o solo un resumen paginado. */
export function nutritionHubMetricScopeLabel(pageComplete: boolean): string {
  return pageComplete ? 'en este workspace' : 'de esta página'
}
