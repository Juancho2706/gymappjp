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

/** Tono de atencion nutricional (espeja el criterio web: solo `no_plan` es warning). */
export type NutritionAttentionTone = 'warning' | 'info'

/**
 * Titulo de la `CoachAttentionCard` por motivo (espejo de `attentionTitle` de web
 * `HubRoster.tsx:38-42`). Regla espanol latam: los labels RN CONSERVAN tildes aunque el
 * web las omita.
 */
export function nutritionAttentionCardTitle(reason: Exclude<NutritionAttentionReason, 'none'>): string {
  switch (reason) {
    case 'no_plan':
      return 'Sin plan publicado'
    case 'draft_pending':
      return 'Borrador pendiente'
    case 'no_recent_intake':
      return 'Sin consumo reciente'
  }
}

/**
 * Descripcion de la `CoachAttentionCard` por motivo (espejo de `attentionDescription` de web
 * `HubRoster.tsx:44-48`, con tildes correctas).
 */
export function nutritionAttentionCardDescription(reason: Exclude<NutritionAttentionReason, 'none'>): string {
  switch (reason) {
    case 'no_plan':
      return 'Este alumno todavía no tiene una prescripción versionada.'
    case 'draft_pending':
      return 'Existe una versión que aún no ha sido publicada.'
    case 'no_recent_intake':
      return 'No hay registros canónicos durante los últimos siete días.'
  }
}

/** Tono de la card por motivo: `no_plan` warning, el resto info (espejo web `HubRoster.tsx:288`). */
export function nutritionAttentionCardTone(reason: Exclude<NutritionAttentionReason, 'none'>): NutritionAttentionTone {
  return reason === 'no_plan' ? 'warning' : 'info'
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

/** Claves de orden del roster (espejo de `SortKey` de web `_lib/hub-roster.ts:18`). */
export type NutritionSortKey = 'default' | 'name' | 'activity' | 'attention'

/**
 * Opciones de orden del roster (espejo de `SORT_OPTIONS` de web). Regla espanol latam: los
 * labels RN CONSERVAN tildes ("Último registro", "Prioridad de atención") aunque el web las omita.
 */
export const NUTRITION_SORT_OPTIONS: ReadonlyArray<{ value: NutritionSortKey; label: string }> = [
  { value: 'default', label: 'Actividad reciente' },
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'activity', label: 'Último registro' },
  { value: 'attention', label: 'Prioridad de atención' },
]

/** lower-case + sin tildes, para buscar/ordenar de forma tolerante a acentos (espejo `normalizeText` web). */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// Prioridad al ordenar por "atencion": cuanto mas alto, mas arriba (espejo `ATTENTION_PRIORITY` web).
const NUTRITION_ATTENTION_PRIORITY: Record<NutritionAttentionReason, number> = {
  no_plan: 3,
  draft_pending: 2,
  no_recent_intake: 1,
  none: 0,
}

function compareNutritionBySort(
  a: NutritionHubItemLike,
  b: NutritionHubItemLike,
  sort: Exclude<NutritionSortKey, 'default'>,
): number {
  switch (sort) {
    case 'name':
      return normalizeText(a.clientName).localeCompare(normalizeText(b.clientName))
    case 'activity': {
      // Ultimo registro primero; los que nunca registraron van al final.
      const ta = a.lastIntakeAt ? Date.parse(a.lastIntakeAt) : Number.NEGATIVE_INFINITY
      const tb = b.lastIntakeAt ? Date.parse(b.lastIntakeAt) : Number.NEGATIVE_INFINITY
      return tb - ta
    }
    case 'attention':
      return NUTRITION_ATTENTION_PRIORITY[b.attentionReason] - NUTRITION_ATTENTION_PRIORITY[a.attentionReason]
  }
}

export interface NutritionRosterFilters {
  search: string
  attention: NutritionAttentionFilter
  sort: NutritionSortKey
}

export const DEFAULT_NUTRITION_ROSTER_FILTERS: NutritionRosterFilters = {
  search: '',
  attention: 'all',
  sort: 'default',
}

/**
 * Aplica filtro (atencion + busqueda por nombre) y orden a la pagina cargada (espejo de
 * `applyRosterFilters` de web `_lib/hub-roster.ts:93`). El RPC del hub no soporta search/sort
 * server-side, asi que se derivan client-side sobre la pagina visible. Orden estable: el modo
 * 'default' respeta el orden del servidor (updatedAt desc); el resto compara y cae de vuelta al
 * indice original ante empates.
 */
export function applyNutritionRosterFilters<T extends NutritionHubItemLike>(
  items: readonly T[],
  filters: NutritionRosterFilters,
): T[] {
  const needle = normalizeText(filters.search)
  const filtered = items.filter((item) => {
    if (!matchesAttention(item.attentionReason, filters.attention)) return false
    if (needle.length === 0) return true
    return normalizeText(item.clientName).includes(needle)
  })

  if (filters.sort === 'default') return filtered

  const withIndex = filtered.map((item, index) => ({ item, index }))
  const sort = filters.sort
  withIndex.sort((a, b) => {
    const cmp = compareNutritionBySort(a.item, b.item, sort)
    if (cmp !== 0) return cmp
    return a.index - b.index // estable
  })
  return withIndex.map((entry) => entry.item)
}

/** ¿Hay algun filtro activo (busqueda, atencion u orden distintos del default)? */
export function isNutritionRosterFiltered(filters: NutritionRosterFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.attention !== 'all' ||
    filters.sort !== 'default'
  )
}

/** Forma minima que necesita el picker "Nuevo plan" del hub (selector de alumno). */
export interface NutritionPickerEntryLike {
  clientId: string
  clientName: string
}

/**
 * Filtra el roster del picker "Nuevo plan" por nombre, tolerante a acentos/mayusculas (espejo de
 * `filterPickerEntries` web). Query vacia => copia intacta del roster (preserva el orden del
 * servidor).
 */
export function filterNutritionPickerEntries<T extends NutritionPickerEntryLike>(
  entries: readonly T[],
  query: string,
): T[] {
  const needle = normalizeText(query)
  if (needle.length === 0) return [...entries]
  return entries.filter((entry) => normalizeText(entry.clientName).includes(needle))
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
 * Href hacia el builder del alumno. La ruta RN es un SEGMENTO dinamico
 * (`app/coach/nutrition-v2/builder/[clientId].tsx`, lee `params.clientId`) y NO existe
 * `builder/index.tsx`, asi que la forma de query (`builder?clientId=`) navegaba a una ruta sin
 * match. Espeja al web, que navega por segmento (`/coach/nutrition-v2/{clientId}/builder`).
 */
export function nutritionV2BuilderHref(clientId: string): string {
  return `/coach/nutrition-v2/builder/${encodeURIComponent(clientId)}`
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
