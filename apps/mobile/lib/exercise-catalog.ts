import { supabase } from './supabase'
import { isMissingColumnError } from './db-compat'
import { normalizeString, youtubeId, youtubeThumb } from './exercises'

/**
 * Catálogo del alumno ("Aprender") — capa de datos. Espeja 1:1 el modelo server-side de la web
 * (`apps/web/src/app/c/[coach_slug]/exercises/_data/exercises.queries.ts` + `_actions`):
 *
 *  - Paginación REAL server-side: la primera página trae solo `CATALOG_PAGE_SIZE` filas; el resto
 *    llega incrementalmente vía `fetchExercisePage(offset)` (no un slice de un dataset ya bajado).
 *  - Búsqueda + filtro de músculo server-side (`ilike`/`eq`) → no se descargan las ~846 filas para
 *    filtrarlas en el cliente. Los sinónimos de músculo (MUSCLE_MAPPING) expanden el término igual
 *    que `buildExerciseSearchOr` de la web.
 *  - Columnas de LISTA (sin `instructions`/`image_url`, los blobs pesados). El detalle llega
 *    on-demand al abrir la tarjeta (`getExerciseInstructions`).
 *  - Miniaturas del grid vía `render/image` (WebP redimensionado), no el gif crudo — ver
 *    `exerciseGridThumb`. El gif/video full-res vive solo en el sheet de técnica.
 *
 * Mobile habla PostgREST directo (anon key + JWT); RLS es el techo real del scope (sistema ∪
 * org | team pool | coach standalone). El catálogo "Aprender" es free tier → sin gate de módulo.
 */

export const CATALOG_PAGE_SIZE = 30

/** Fila de LISTA (sin `instructions`/`image_url`). Tipo compartido lib + pantalla. */
export interface CatalogExercise {
  id: string
  name: string
  muscle_group: string | null
  equipment: string | null
  body_part: string | null
  secondary_muscles: string[] | null
  gif_url: string | null
  video_url: string | null
  thumbnail_url: string | null
  video_start_time: number | null
  video_end_time: number | null
}

export interface ExercisePage {
  exercises: CatalogExercise[]
  hasMore: boolean
  total: number
}

/**
 * Scope del alumno para el `or()` de PostgREST. `rich` incluye ramas org/team (columnas
 * enterprise); `min` cae a coach-only para prod standalone que aún no tiene org_id/team_id.
 */
export interface CatalogScope {
  clientId: string
  scopeFilterRich: string
  scopeFilterMin: string
}

// Columnas de LISTA (mismo set liviano que la web: EXERCISE_LIST_COLUMNS sin blobs).
const LIST_COLUMNS =
  'id, name, muscle_group, equipment, body_part, secondary_muscles, gif_url, video_url, thumbnail_url, video_start_time, video_end_time'

// Sinónimos de músculo (1:1 web `MUSCLE_MAPPING`, `apps/web/src/lib/constants.ts`). Expanden el
// término de búsqueda para cubrir es/en + con/sin tilde sobre columnas escalares.
const MUSCLE_MAPPING: Record<string, string[]> = {
  hombros: ['delts', 'shoulders', 'deltoides'],
  biceps: ['biceps', 'bíceps'],
  triceps: ['triceps', 'tríceps'],
  antebrazos: ['forearms', 'antebrazos'],
  cuadriceps: ['quads', 'cuadriceps', 'cuádriceps'],
  gluteos: ['glutes', 'glúteos'],
  abductores: ['abductors', 'abductores'],
  aductores: ['adductors', 'aductores'],
  pantorrillas: ['calves', 'pantorrillas', 'gemelos'],
  lumbar: ['lower back', 'lumbar'],
  abdominales: ['abs', 'core', 'abdominales', 'abdomen'],
  cardio: ['cardio', 'cardiovascular system'],
  dorsales: ['lats', 'dorsales'],
  'espalda alta': ['upper back', 'espalda alta'],
  isquiotibiales: ['hamstrings', 'isquiotibiales', 'isquios'],
  pectorales: ['pectoral', 'pecho', 'chest', 'pectorales'],
  trapecios: ['traps', 'trapecios', 'trapecio'],
}

/**
 * `or()` de PostgREST para la búsqueda server-side sobre columnas escalares
 * (`name`/`muscle_group`/`equipment`/`body_part`), expandiendo el término con los sinónimos de
 * `MUSCLE_MAPPING`. Devuelve `null` si no hay término. `ilike` es case-insensitive pero NO
 * accent-insensitive; los sinónimos cubren los músculos comunes con/sin tilde.
 */
export function buildExerciseSearchOr(search: string): string | null {
  const s = (search ?? '').trim()
  if (!s) return null
  const terms = [s, ...(MUSCLE_MAPPING[normalizeString(s)] ?? [])]
  const seen = new Set<string>()
  const clauses: string[] = []
  for (const raw of terms) {
    // Neutraliza los caracteres que rompen la mini-gramática de `or()` de PostgREST.
    const t = raw.replace(/[(),*]/g, ' ').trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    clauses.push(`name.ilike.*${t}*`)
    clauses.push(`muscle_group.ilike.*${t}*`)
    clauses.push(`equipment.ilike.*${t}*`)
    clauses.push(`body_part.ilike.*${t}*`)
  }
  return clauses.length ? clauses.join(',') : null
}

/**
 * Resuelve usuario + scope del alumno: sistema (todo NULL) ∪ el set de su scope
 * (org | team pool | coach standalone). RLS es el techo real. Devuelve `null` sin sesión/cliente.
 */
export async function resolveCatalogScope(): Promise<CatalogScope | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Intento rico (org_id/team_id) → fallback a coach-only si esas columnas no existen (prod vieja).
  type ClientScopeRow = {
    id: string
    coach_id: string | null
    org_id?: string | null
    team_id?: string | null
  }
  let client: ClientScopeRow | null = null
  const rich = await supabase
    .from('clients')
    .select('id, coach_id, org_id, team_id')
    .eq('id', user.id)
    .maybeSingle()
  if (rich.error && isMissingColumnError(rich.error)) {
    const min = await supabase.from('clients').select('id, coach_id').eq('id', user.id).maybeSingle()
    client = (min.data as ClientScopeRow | null) ?? null
  } else {
    client = (rich.data as ClientScopeRow | null) ?? null
  }
  if (!client) return null

  let scopeBranch: string
  if (client.org_id) scopeBranch = `org_id.eq.${client.org_id}`
  else if (client.team_id) scopeBranch = `team_id.eq.${client.team_id}` // pool
  else scopeBranch = `and(coach_id.eq.${client.coach_id},org_id.is.null,team_id.is.null)`
  const scopeFilterRich = `and(coach_id.is.null,org_id.is.null,team_id.is.null),${scopeBranch}`
  const scopeFilterMin = client.coach_id
    ? `coach_id.is.null,coach_id.eq.${client.coach_id}`
    : `coach_id.is.null`

  return { clientId: client.id, scopeFilterRich, scopeFilterMin }
}

/**
 * Una página del catálogo (columnas de LISTA). `count: 'exact'` devuelve el total del set filtrado
 * en el MISMO round-trip → `hasMore` preciso y contador de "restantes" sin query extra. Fallback
 * de scope (rich→min) para prod sin columnas enterprise.
 */
export async function fetchExercisePage(params: {
  scope: CatalogScope
  muscle?: string | null
  search?: string | null
  offset?: number
  limit?: number
}): Promise<ExercisePage> {
  const { scope, muscle, search, offset = 0, limit = CATALOG_PAGE_SIZE } = params
  const searchOr = buildExerciseSearchOr(search ?? '')

  const run = (scopeFilter: string) => {
    let q = supabase
      .from('exercises')
      .select(LIST_COLUMNS, { count: 'exact' })
      .or(scopeFilter)
      .is('deleted_at', null)
    if (muscle && muscle !== 'Todos') q = q.eq('muscle_group', muscle)
    if (searchOr) q = q.or(searchOr)
    return q.order('name').range(offset, offset + limit - 1)
  }

  let res = await run(scope.scopeFilterRich)
  if (res.error && isMissingColumnError(res.error)) res = await run(scope.scopeFilterMin)

  const exercises = ((res.data as unknown as CatalogExercise[]) ?? [])
  const total = res.count ?? offset + exercises.length
  return { exercises, hasMore: offset + exercises.length < total, total }
}

/**
 * Grupos musculares del scope, para los chips de filtro. Trae una sola columna liviana
 * (`muscle_group`) y deduplica en memoria — payload despreciable frente al media. Con paginación
 * server-side NO se puede derivar de la página cargada (solo trae 30 filas), por eso es query aparte.
 */
export async function fetchScopeMuscleGroups(scope: CatalogScope): Promise<string[]> {
  const run = (scopeFilter: string) =>
    supabase.from('exercises').select('muscle_group').or(scopeFilter).is('deleted_at', null)

  let res = await run(scope.scopeFilterRich)
  if (res.error && isMissingColumnError(res.error)) res = await run(scope.scopeFilterMin)

  const set = new Set<string>()
  for (const row of (res.data ?? []) as Array<{ muscle_group: string | null }>) {
    if (row.muscle_group) set.add(row.muscle_group)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Detalle on-demand de UN ejercicio (instrucciones), al abrir su tarjeta. Mantiene el listado del
 * catálogo liviano (sin `instructions`): el blob pesado solo viaja para el ejercicio que el alumno
 * realmente abre. `exercises.instructions` es `text[]` en la DB. User-scoped → RLS es el techo.
 */
export async function getExerciseInstructions(exerciseId: string): Promise<string[]> {
  if (!exerciseId) return []
  const { data, error } = await supabase
    .from('exercises')
    .select('instructions')
    .eq('id', exerciseId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return []
  return ((data as { instructions: string[] | null }).instructions as string[] | null) ?? []
}

/**
 * Trae UNA fila de LISTA por id, para el deep-link `?ex=<id>` (o `/alumno/exercise/[id]`) cuando el
 * ejercicio no está en la página ya cargada. RLS-scoped por id → el alumno solo lee su set.
 */
export async function getCatalogExerciseById(id: string): Promise<CatalogExercise | null> {
  if (!id) return null
  const { data } = await supabase
    .from('exercises')
    .select(LIST_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  return (data as unknown as CatalogExercise) ?? null
}

const OBJECT_MARKER = '/storage/v1/object/public/'

/**
 * Reescribe una URL pública de Supabase Storage (`…/object/public/<bucket>/<path>`) a su URL de
 * TRANSFORMACIÓN (`…/render/image/public/…?width=…`). imgproxy redimensiona + re-codifica: un gif
 * del catálogo (~93KB) sale como WebP (~26KB). Solo transforma URLs de Storage; el resto → `null`.
 * (1:1 web `toStorageRenderThumb`.)
 */
export function toStorageRenderThumb(publicUrl: string, width = 256, quality = 55): string | null {
  const idx = publicUrl.indexOf(OBJECT_MARKER)
  if (idx === -1) return null
  const origin = publicUrl.slice(0, idx)
  const bucketAndPath = publicUrl.slice(idx + OBJECT_MARKER.length).split('?')[0]
  if (!bucketAndPath) return null
  return `${origin}/storage/v1/render/image/public/${bucketAndPath}?width=${width}&quality=${quality}`
}

/**
 * Miniatura LIGERA para el grid del catálogo del alumno — nunca el gif/video crudo full-res (queja
 * del CEO: "me carga TODO su multimedia"). Prioridad: espejo estático `thumbnail_url` (ya es un webp
 * chico) → gif de Storage reescrito a `render/image` → póster de YouTube. El gif/video a resolución
 * completa vive SOLO en el sheet de técnica. (1:1 web `exerciseGridThumb`.)
 */
export function exerciseGridThumb(
  ex: Pick<CatalogExercise, 'thumbnail_url' | 'gif_url' | 'video_url'> & { image_url?: string | null },
  width = 256,
): string | null {
  // Prioridad 1:1 web `exerciseGridThumb` (thumbnail_url early-return) + `exerciseThumbnailUrl`
  // (apps/web/src/lib/youtube.ts:130-143): gif_url → image_url → thumbnail_url → youtube(video_url)
  // → video_url. `image_url` va entre gif_url y el póster de YouTube (un candidato image_url-only
  // debe mostrar ESA imagen, no el placeholder Dumbbell). SubstituteCandidate ya trae image_url.
  if (ex.thumbnail_url) return ex.thumbnail_url
  let base: string | null = null
  if (ex.gif_url) base = ex.gif_url
  else if (ex.image_url) base = ex.image_url
  else {
    const yt = youtubeId(ex.video_url)
    if (yt) base = youtubeThumb(yt)
    else if (ex.video_url) base = ex.video_url
  }
  if (!base) return null
  return toStorageRenderThumb(base, width) ?? base
}
