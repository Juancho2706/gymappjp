// Helpers puros del roster del Centro V2 (hub coach).
//
// Todo lo que sea logica de filtro/orden/metricas vive aca (sin React, sin fetch)
// para poder testearlo y para que el componente cliente sea una capa delgada de
// presentacion. El RPC del hub (`get_nutrition_coach_hub_scoped_v2`) NO acepta
// busqueda ni orden server-side (solo keyset por updatedAt + pageSize), por eso el
// filtrado/orden es client-side sobre la pagina ya cargada.

export type AttentionReason = 'no_plan' | 'draft_pending' | 'no_recent_intake' | 'none'

export type AttentionFilter =
  | 'all'
  | 'needs_attention'
  | 'no_plan'
  | 'draft_pending'
  | 'no_recent_intake'

export type SortKey = 'default' | 'name' | 'activity' | 'attention'

export interface RosterFilters {
  search: string
  attention: AttentionFilter
  sort: SortKey
}

export const DEFAULT_ROSTER_FILTERS: RosterFilters = {
  search: '',
  attention: 'all',
  sort: 'default',
}

export const ATTENTION_FILTER_OPTIONS: Array<{ value: AttentionFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'needs_attention', label: 'Requieren atencion' },
  { value: 'no_plan', label: 'Sin plan V2' },
  { value: 'draft_pending', label: 'Borrador pendiente' },
  { value: 'no_recent_intake', label: 'Sin consumo reciente' },
]

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'default', label: 'Actividad reciente' },
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'activity', label: 'Ultimo registro' },
  { value: 'attention', label: 'Prioridad de atencion' },
]

const ATTENTION_FILTER_VALUES = new Set<AttentionFilter>(
  ATTENTION_FILTER_OPTIONS.map((o) => o.value),
)
const SORT_VALUES = new Set<SortKey>(SORT_OPTIONS.map((o) => o.value))

const MAX_SEARCH_LEN = 120

/** Minima forma que necesitan los helpers; el componente pasa el item completo. */
export interface RosterItemLike {
  clientId: string
  clientName: string
  planId: string | null
  attentionReason: AttentionReason
  lastIntakeAt: string | null
  pendingDrafts: number
}

/** lower-case + sin tildes, para buscar de forma tolerante a acentos. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// Prioridad al ordenar por "atencion": cuanto mas alto, mas arriba.
const ATTENTION_PRIORITY: Record<AttentionReason, number> = {
  no_plan: 3,
  draft_pending: 2,
  no_recent_intake: 1,
  none: 0,
}

function matchesAttention(item: RosterItemLike, filter: AttentionFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'needs_attention') return item.attentionReason !== 'none'
  return item.attentionReason === filter
}

/**
 * Aplica filtro (atencion + busqueda por nombre) y orden a la pagina cargada.
 * Generico para preservar el tipo del item completo. Orden estable: para el modo
 * 'default' respeta el orden del servidor (updatedAt desc); el resto compara y cae
 * de vuelta al indice original ante empates.
 */
export function applyRosterFilters<T extends RosterItemLike>(
  items: readonly T[],
  filters: RosterFilters,
): T[] {
  const needle = normalizeText(filters.search)
  const filtered = items.filter((item) => {
    if (!matchesAttention(item, filters.attention)) return false
    if (needle.length === 0) return true
    return normalizeText(item.clientName).includes(needle)
  })

  if (filters.sort === 'default') return filtered

  const withIndex = filtered.map((item, index) => ({ item, index }))
  withIndex.sort((a, b) => {
    const cmp = compareBySort(a.item, b.item, filters.sort)
    if (cmp !== 0) return cmp
    return a.index - b.index // estable
  })
  return withIndex.map((entry) => entry.item)
}

function compareBySort(a: RosterItemLike, b: RosterItemLike, sort: SortKey): number {
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
      return ATTENTION_PRIORITY[b.attentionReason] - ATTENTION_PRIORITY[a.attentionReason]
    default:
      return 0
  }
}

/** Minima forma que necesita el picker "Nuevo plan" del hub (selector de alumno). */
export interface PickerEntryLike {
  clientId: string
  clientName: string
}

/**
 * Filtra el roster del picker "Nuevo plan" por nombre, tolerante a acentos/mayusculas.
 * Query vacia => copia intacta del roster (preserva el orden del servidor). Puro: alimenta
 * el selector de alumno del hub sin queries nuevas (el picker ya recibe el roster cargado).
 */
export function filterPickerEntries<T extends PickerEntryLike>(
  entries: readonly T[],
  query: string,
): T[] {
  const needle = normalizeText(query)
  if (needle.length === 0) return [...entries]
  return entries.filter((entry) => normalizeText(entry.clientName).includes(needle))
}

/**
 * Label del CTA de plan por alumno en el roster. Espeja el criterio de
 * `nutritionTabV2.logic.ts` (`builderCtaLabel`): si ya hay un plan PUBLICADO se ofrece
 * "Nueva versión"; en cualquier otro caso (sin plan o solo borrador) "Crear plan". El
 * hub solo expone `planStatus === 'published'` para la insignia de versión, por eso el
 * mismo umbral gobierna el CTA (un borrador pendiente sigue siendo "Crear plan").
 */
export function planCtaLabel(planStatus: string | null): 'Crear plan' | 'Nueva versión' {
  return planStatus === 'published' ? 'Nueva versión' : 'Crear plan'
}

/**
 * ¿La página cargada es el roster COMPLETO (sin paginación en juego)? Solo entonces las
 * métricas de cabecera son totales reales del scope. En cuanto haya una página siguiente
 * (`hasMore`) o hayamos entrado vía cursor (`hasIncomingCursor`), las métricas son un
 * resumen de la página visible y deben rotularse como tal.
 */
export function isRosterPageComplete(opts: {
  hasMore: boolean
  hasIncomingCursor: boolean
}): boolean {
  return !opts.hasMore && !opts.hasIncomingCursor
}

export interface RosterCursor {
  updatedAt: string
  clientId: string
}

// Delimitadores de la pila de cursores en la URL (param `pc`). El cursor null (primera
// página, sin keyset) se codifica como '_' para distinguirlo de la pila vacía: sin el
// centinela, [null] y [] colapsarían al mismo string ''. Ni ISO datetime ni UUID
// contienen '|' ni '~', así que el split es seguro.
const CURSOR_STACK_SEP = '~'
const CURSOR_FIELD_SEP = '|'
const CURSOR_NULL_TOKEN = '_'

/**
 * Codifica la pila de cursores ancestros (para "Página anterior") en un string apto para
 * la URL. Cada entrada es el cursor con que se cargó una página previa; null = primera
 * página (sin cursor).
 */
export function encodeCursorStack(stack: ReadonlyArray<RosterCursor | null>): string {
  return stack
    .map((c) => (c ? `${c.updatedAt}${CURSOR_FIELD_SEP}${c.clientId}` : CURSOR_NULL_TOKEN))
    .join(CURSOR_STACK_SEP)
}

/** Inversa de `encodeCursorStack`; tolera entradas corruptas devolviéndolas como null. */
export function parseCursorStack(raw: string | null | undefined): Array<RosterCursor | null> {
  if (!raw) return []
  return raw.split(CURSOR_STACK_SEP).map((entry) => {
    if (entry === CURSOR_NULL_TOKEN || entry === '') return null
    const idx = entry.indexOf(CURSOR_FIELD_SEP)
    if (idx < 0) return null
    const updatedAt = entry.slice(0, idx)
    const clientId = entry.slice(idx + 1)
    if (!updatedAt || !clientId) return null
    return { updatedAt, clientId }
  })
}

/** Lee los filtros desde un record de searchParams (server-side o cliente). */
export function parseRosterFilters(
  params: Record<string, string | string[] | undefined>,
): RosterFilters {
  const raw = (key: string): string => {
    const value = params[key]
    if (Array.isArray(value)) return value[0] ?? ''
    return value ?? ''
  }

  const attentionRaw = raw('attn') as AttentionFilter
  const sortRaw = raw('sort') as SortKey

  return {
    search: raw('q').slice(0, MAX_SEARCH_LEN),
    attention: ATTENTION_FILTER_VALUES.has(attentionRaw) ? attentionRaw : 'all',
    sort: SORT_VALUES.has(sortRaw) ? sortRaw : 'default',
  }
}

/**
 * Serializa los filtros a pares clave/valor, omitiendo los defaults para mantener
 * URLs limpias y compartibles. Se puede combinar con los params de cursor.
 */
export function serializeRosterFilters(filters: RosterFilters): Record<string, string> {
  const out: Record<string, string> = {}
  const search = filters.search.trim()
  if (search.length > 0) out.q = search.slice(0, MAX_SEARCH_LEN)
  if (filters.attention !== 'all') out.attn = filters.attention
  if (filters.sort !== 'default') out.sort = filters.sort
  return out
}

export interface HubMetrics {
  total: number
  withPlan: number
  withoutPlan: number
  activeToday: number
}

export interface MetricItemLike {
  planId: string | null
  lastIntakeAt: string | null
}

/** Fecha local (YYYY-MM-DD) de un ISO en la zona horaria dada; null si no parsea. */
export function localDateOf(iso: string, timeZone: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  // en-CA rinde YYYY-MM-DD; con timeZone respeta el dia local del coach.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Deriva las metricas de cabecera del payload ya cargado (sin queries nuevas):
 * alumnos con plan V2, sin plan, y con actividad hoy (ultimo registro cae en la
 * fecha local del coach). `total` es el tamano de la pagina.
 */
export function mapHubMetrics<T extends MetricItemLike>(
  items: readonly T[],
  opts: { todayLocalDate: string; timeZone: string },
): HubMetrics {
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
