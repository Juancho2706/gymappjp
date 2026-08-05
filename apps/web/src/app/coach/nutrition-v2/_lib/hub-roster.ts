// Helpers puros del roster del Centro V2 (hub coach).
//
// Todo lo que sea logica de filtro/orden/metricas/triage vive aca (sin React, sin fetch)
// para poder testearlo y para que el componente cliente sea una capa delgada de
// presentacion.
//
// Reparto server/cliente (migracion 20260805211949, `get_nutrition_coach_hub_scoped_v2`):
//  - SERVER: busqueda por nombre (`p_search`) y orden (`p_sort` = 'default' | 'attention',
//    con keyset score+updatedAt+id via `p_cursor_score`). Antes la busqueda era client-side
//    y solo cubria la pagina cargada: buscar a un alumno de la pagina 3 no lo encontraba.
//  - CLIENTE: el filtro por estado de atencion (`attn`) sobre la pagina ya cargada, y los
//    ordenes cosmeticos (nombre, ultimo registro).

export type AttentionReason = 'no_plan' | 'draft_pending' | 'no_recent_intake' | 'none'

/**
 * Valores aceptados por el param `attn`. `no_plan` NO es un chip del roster (se retiro del
 * selector en la poda 2026-07): sigue siendo un valor valido porque la tile "Sin plan" de las
 * stats lo activa, y cuando esta activo se pinta como chip extra.
 */
export type AttentionFilter =
  | 'all'
  | 'needs_attention'
  | 'draft_pending'
  | 'no_recent_intake'
  | 'stale_3d'
  | 'on_track'
  | 'no_plan'

/**
 * Orden del roster. `attention` y `recientes` los resuelve el SERVIDOR (`p_sort`); `name` y
 * `activity` son cosmeticos sobre la pagina cargada. `attention` es el default del triage.
 */
export type SortKey = 'attention' | 'recientes' | 'name' | 'activity'

export const DEFAULT_SORT: SortKey = 'attention'

export interface RosterFilters {
  search: string
  attention: AttentionFilter
  sort: SortKey
}

export const DEFAULT_ROSTER_FILTERS: RosterFilters = {
  search: '',
  attention: 'all',
  sort: DEFAULT_SORT,
}

/** Chips visibles del roster (en orden). `no_plan` queda fuera a proposito (ver AttentionFilter). */
export const ATTENTION_FILTER_OPTIONS: Array<{ value: AttentionFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'needs_attention', label: 'Por atender' },
  { value: 'stale_3d', label: 'Sin registrar 3+ días' },
  { value: 'on_track', label: 'Al día' },
  { value: 'draft_pending', label: 'Borrador pendiente' },
  { value: 'no_recent_intake', label: 'Sin consumo reciente' },
]

/** Etiqueta de cualquier valor aceptado, incluidos los que no son chip por defecto. */
export const ATTENTION_FILTER_LABELS: Record<AttentionFilter, string> = {
  all: 'Todos',
  needs_attention: 'Por atender',
  stale_3d: 'Sin registrar 3+ días',
  on_track: 'Al día',
  draft_pending: 'Borrador pendiente',
  no_recent_intake: 'Sin consumo reciente',
  no_plan: 'Sin plan',
}

export const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'attention', label: 'Por atención' },
  { value: 'recientes', label: 'Recientes' },
  { value: 'name', label: 'Nombre (A-Z)' },
  { value: 'activity', label: 'Último registro' },
]

const ATTENTION_FILTER_VALUES = new Set<AttentionFilter>(
  Object.keys(ATTENTION_FILTER_LABELS) as AttentionFilter[],
)
const SORT_VALUES = new Set<SortKey>(SORT_OPTIONS.map((o) => o.value))

const MAX_SEARCH_LEN = 120

/** Umbral del chip "Sin registrar 3+ días" (y del motivo por fila). */
export const STALE_DAYS_THRESHOLD = 3

/** Señal por-dia que viaja en `days7d` (ventana rodante de 7 dias, solo dias CON registros). */
export interface RosterDayLike {
  date: string
  entryCount: number
  consumedCalories: number
  targetCalories: number | null
}

/** Minima forma que necesitan los helpers; el componente pasa el item completo. */
export interface RosterItemLike {
  clientId: string
  clientName: string
  planId: string | null
  attentionReason: AttentionReason
  lastIntakeAt: string | null
  pendingDrafts: number
  phone?: string | null
  activeDays7d?: number
  activeDaysPrev7d?: number
  days7d?: readonly RosterDayLike[]
}

/** lower-case + sin tildes, para buscar de forma tolerante a acentos. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

// ── Fechas ISO (YYYY-MM-DD) ──────────────────────────────────────────────────────────
// Comparan lexicograficamente = cronologicamente. Se parsean en UTC a proposito: la fecha
// ya viene resuelta en la zona del coach, asi que jamas debe correrse un dia.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

function isoToUtcMs(isoDate: string): number | null {
  if (!ISO_DATE_RE.test(isoDate)) return null
  const ms = Date.parse(`${isoDate}T00:00:00Z`)
  return Number.isNaN(ms) ? null : ms
}

/** Dias enteros entre dos ISO (`to - from`); null si alguno no parsea. */
export function isoDaysBetween(fromIso: string, toIso: string): number | null {
  const from = isoToUtcMs(fromIso)
  const to = isoToUtcMs(toIso)
  if (from == null || to == null) return null
  return Math.round((to - from) / MS_PER_DAY)
}

/** `todayIso` desplazado `offset` dias (negativo = pasado). Cadena vacia si no parsea. */
export function isoShiftDays(isoDate: string, offset: number): string {
  const ms = isoToUtcMs(isoDate)
  if (ms == null) return ''
  return new Date(ms + offset * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * Dias transcurridos desde el ultimo registro (0 = registro hoy). `null` = no se sabe
 * (sin registro en la ventana ni `lastIntakeAt`; el RPC ya acota `lastIntakeAt` a 90 dias).
 *
 * Prefiere `days7d` porque es la senal por dia de calendario; cae a `lastIntakeAt` para los
 * items viejos (payload cacheado sin `days7d`) convirtiendo el timestamp a la fecha local del
 * coach, igual que `mapHubMetrics`.
 */
export function daysSinceLastEntry(
  item: Pick<RosterItemLike, 'days7d' | 'lastIntakeAt'>,
  opts: { todayIso: string; timeZone: string },
): number | null {
  let latest: string | null = null
  for (const day of item.days7d ?? []) {
    if (!day || day.entryCount <= 0) continue
    if (latest == null || day.date > latest) latest = day.date
  }
  if (latest == null && item.lastIntakeAt) {
    latest = localDateOf(item.lastIntakeAt, opts.timeZone)
  }
  if (latest == null) return null
  const diff = isoDaysBetween(latest, opts.todayIso)
  if (diff == null) return null
  return Math.max(0, diff)
}

// Prioridad al ordenar por "atencion" client-side (fallback cosmetico; el orden real lo da
// el `attentionScore` del servidor): cuanto mas alto, mas arriba.
const ATTENTION_PRIORITY: Record<AttentionReason, number> = {
  no_plan: 3,
  draft_pending: 2,
  no_recent_intake: 1,
  none: 0,
}

export interface RosterFilterContext {
  todayIso: string
  timeZone: string
}

function matchesAttention(
  item: RosterItemLike,
  filter: AttentionFilter,
  ctx: RosterFilterContext | undefined,
): boolean {
  if (filter === 'all') return true
  if (filter === 'needs_attention') return item.attentionReason !== 'none'
  if (filter === 'on_track') return item.attentionReason === 'none'
  if (filter === 'stale_3d') {
    if (!ctx) return false
    const days = daysSinceLastEntry(item, ctx)
    // `null` = nunca registro (o fuera de los 90 dias): califica de sobra.
    return days == null || days >= STALE_DAYS_THRESHOLD
  }
  return item.attentionReason === filter
}

/**
 * Aplica el filtro de atencion y el orden COSMETICO a la pagina cargada.
 *
 * La busqueda por nombre ya NO se aplica aca: la hace el servidor (`p_search`), asi que un
 * filtro client-side adicional solo podria esconder filas que el servidor si considero match.
 * Orden estable: 'attention' y 'recientes' respetan el orden del servidor; el resto compara y
 * cae de vuelta al indice original ante empates.
 */
export function applyRosterFilters<T extends RosterItemLike>(
  items: readonly T[],
  filters: RosterFilters,
  ctx?: RosterFilterContext,
): T[] {
  const filtered = items.filter((item) => matchesAttention(item, filters.attention, ctx))

  if (filters.sort === 'attention' || filters.sort === 'recientes') return filtered

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
    default:
      return ATTENTION_PRIORITY[b.attentionReason] - ATTENTION_PRIORITY[a.attentionReason]
  }
}

/** El orden que entiende el RPC. Los ordenes cosmeticos leen la pagina "reciente". */
export function serverSortFor(sort: SortKey): 'default' | 'attention' {
  return sort === 'attention' ? 'attention' : 'default'
}

// ── Triage: caida semanal ────────────────────────────────────────────────────────────

export interface WeeklyDrop {
  clientId: string
  clientName: string
  phone: string | null
  activeDays7d: number
  activeDaysPrev7d: number
  /** Dias perdidos respecto de la semana anterior (siempre >= 2 por construccion). */
  drop: number
}

/** Semana anterior con al menos estos dias activos para que la caida sea señal, no ruido. */
export const WEEKLY_DROP_MIN_PREV_DAYS = 3
/** Caida minima (en dias) para entrar a la franja. */
export const WEEKLY_DROP_MIN_DELTA = 2

/**
 * "Bajaron esta semana": alumnos que venian registrando (>= 3 dias la semana pasada) y esta
 * semana perdieron 2 dias o mas. Ordenados por mayor caida; los empates conservan el orden de
 * la pagina (que ya viene por riesgo). No incluye a quien nunca registro: eso es otro problema
 * (`no_recent_intake`) y ya tiene su propio motivo por fila.
 */
export function pickWeeklyDrops<T extends RosterItemLike>(
  items: readonly T[],
  limit = 3,
): WeeklyDrop[] {
  const candidates: Array<{ entry: WeeklyDrop; index: number }> = []
  items.forEach((item, index) => {
    const prev = item.activeDaysPrev7d ?? 0
    const current = item.activeDays7d ?? 0
    if (prev < WEEKLY_DROP_MIN_PREV_DAYS) return
    const drop = prev - current
    if (drop < WEEKLY_DROP_MIN_DELTA) return
    candidates.push({
      entry: {
        clientId: item.clientId,
        clientName: item.clientName,
        phone: item.phone ?? null,
        activeDays7d: current,
        activeDaysPrev7d: prev,
        drop,
      },
      index,
    })
  })
  candidates.sort((a, b) => b.entry.drop - a.entry.drop || a.index - b.index)
  return candidates.slice(0, Math.max(0, limit)).map((c) => c.entry)
}

/**
 * Motivo corto bajo el nombre, derivado de `attentionReason` (la verdad la calcula el
 * servidor). `no_recent_intake` se enriquece con los dias reales desde el ultimo registro.
 * `none` no muestra nada: el roster no inventa alarmas.
 */
export function attentionReasonLabel(
  item: RosterItemLike,
  ctx: RosterFilterContext,
): string | null {
  switch (item.attentionReason) {
    case 'no_plan':
      return 'Sin plan publicado'
    case 'draft_pending':
      return 'Borrador sin publicar'
    case 'no_recent_intake': {
      const days = daysSinceLastEntry(item, ctx)
      if (days == null) return 'Sin registros en 90 días'
      return `Sin registro hace ${days} ${days === 1 ? 'día' : 'días'}`
    }
    default:
      return null
  }
}

// ── WhatsApp (la app NO mensajea alumnos: el contacto es wa.me) ──────────────────────

/** Solo digitos; `null` si no queda nada marcable. */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/** `https://wa.me/<digitos>?text=…`; `null` sin telefono utilizable. */
export function whatsappHref(phone: string | null | undefined, message?: string): string | null {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return null
  const base = `https://wa.me/${digits}`
  const text = message?.trim()
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

/** Mensaje sugerido para la franja "Bajaron esta semana". */
export function weeklyDropMessage(clientName: string): string {
  const name = clientName.trim().split(/\s+/)[0] || clientName.trim()
  return `Hola ${name}, vi que esta semana registraste menos tus comidas. ¿Cómo vas? ¿Te ayudo a retomar?`
}

/** Texto de "Copiar lista": una linea por alumno, "Nombre — motivo". */
export function buildContactList(
  items: readonly RosterItemLike[],
  ctx: RosterFilterContext,
): string {
  return items
    .map((item) => `${item.clientName} — ${attentionReasonLabel(item, ctx) ?? 'Al día'}`)
    .join('\n')
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
  /** Keyset del modo `attention`; ausente en el modo `default` y en los cursores viejos. */
  score?: number | null
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
 * página (sin cursor). El tercer campo (score) solo viaja en modo `attention`; las entradas
 * de dos campos siguen siendo válidas (URLs emitidas antes del triage).
 */
export function encodeCursorStack(stack: ReadonlyArray<RosterCursor | null>): string {
  return stack
    .map((c) => {
      if (!c) return CURSOR_NULL_TOKEN
      const head = `${c.updatedAt}${CURSOR_FIELD_SEP}${c.clientId}`
      return c.score == null ? head : `${head}${CURSOR_FIELD_SEP}${c.score}`
    })
    .join(CURSOR_STACK_SEP)
}

/** Inversa de `encodeCursorStack`; tolera entradas corruptas devolviéndolas como null. */
export function parseCursorStack(raw: string | null | undefined): Array<RosterCursor | null> {
  if (!raw) return []
  return raw.split(CURSOR_STACK_SEP).map((entry) => {
    if (entry === CURSOR_NULL_TOKEN || entry === '') return null
    const parts = entry.split(CURSOR_FIELD_SEP)
    const updatedAt = parts[0] ?? ''
    const clientId = parts[1] ?? ''
    if (!updatedAt || !clientId) return null
    const rawScore = parts[2]
    const score = rawScore != null && rawScore !== '' ? Number(rawScore) : null
    if (score != null && Number.isFinite(score)) return { updatedAt, clientId, score }
    return { updatedAt, clientId }
  })
}

/** Lee el `cursorScore` de la URL; `null` si falta o es basura. */
export function parseCursorScore(raw: string | string[] | null | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
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
  // `default` es el nombre viejo del orden por actividad reciente: sigue siendo honrado para
  // que los enlaces compartidos antes del triage no cambien de significado en silencio.
  const sortRawValue = raw('sort')
  const sortRaw = (sortRawValue === 'default' ? 'recientes' : sortRawValue) as SortKey

  return {
    search: raw('q').slice(0, MAX_SEARCH_LEN),
    attention: ATTENTION_FILTER_VALUES.has(attentionRaw) ? attentionRaw : 'all',
    sort: SORT_VALUES.has(sortRaw) ? sortRaw : DEFAULT_SORT,
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
  if (filters.sort !== DEFAULT_SORT) out.sort = filters.sort
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
