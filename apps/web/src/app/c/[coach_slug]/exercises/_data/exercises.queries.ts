import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import type { CatalogExercise } from '@/lib/exercises/exercise-thumb'
import { MUSCLE_MAPPING } from '@/lib/constants'
import { normalizeString } from '@/lib/utils'

/**
 * Catálogo del alumno ("Aprender"). Eficiencia (queja CEO: "me carga TODOS los ejercicios y
 * TODO su multimedia"):
 *  - Paginación REAL server-side: la página inicial trae solo CATALOG_PAGE_SIZE filas; el resto
 *    llega incrementalmente vía `loadClientExercisesAction` (infinite scroll de verdad, no un
 *    slice de un dataset total ya descargado).
 *  - Búsqueda + filtro de músculo server-side (SQL `ilike`/`eq`) → no se descargan las ~846 filas
 *    para filtrarlas en el cliente.
 *  - Columnas de LISTA (sin `instructions`/`image_url`, los blobs pesados); el detalle llega
 *    on-demand al abrir la tarjeta (`getExerciseInstructions`).
 *  - Miniaturas del grid vía `render/image` (WebP redimensionado), no el gif crudo — ver
 *    `exerciseGridThumb`. El gif/video full-res vive solo en el modal.
 */

export const CATALOG_PAGE_SIZE = 30

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type CatalogScope = {
    userId: string
    scopeFilter: string
    coachBranding: { brand_name: string | null; primary_color: string | null } | null
}

export type ExercisePage = {
    exercises: CatalogExercise[]
    hasMore: boolean
    total: number
}

/**
 * Resuelve usuario + scope del alumno: sistema (todo NULL) ∪ el set de su scope
 * (org | team pool | coach standalone). RLS es el techo real.
 */
export async function resolveCatalogScope(
    supabase: ServerClient,
): Promise<CatalogScope | null> {
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const userId = __cl?.claims?.sub as string | undefined
    if (!userId) return null

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id, org_id, team_id, coaches ( brand_name, primary_color )')
        .eq('id', userId)
        .maybeSingle()
    if (!client) return null

    let scopeBranch: string
    if (client.org_id) scopeBranch = `org_id.eq.${client.org_id}`
    else if (client.team_id) scopeBranch = `team_id.eq.${client.team_id}` // pool
    else scopeBranch = `and(coach_id.eq.${client.coach_id},org_id.is.null,team_id.is.null)`
    const scopeFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),${scopeBranch}`

    const rawBranding = Array.isArray(client.coaches) ? client.coaches[0] : client.coaches
    const coachBranding = (rawBranding ?? null) as CatalogScope['coachBranding']
    return { userId, scopeFilter, coachBranding }
}

/**
 * Construye el `or()` de PostgREST para la búsqueda server-side sobre columnas escalares
 * (`name`/`muscle_group`/`equipment`/`body_part`), expandiendo el término con los sinónimos de
 * `MUSCLE_MAPPING` (ej. "gluteos" → "glutes"). Devuelve `null` si no hay término.
 *
 * Nota: `ilike` es case-insensitive pero NO accent-insensitive; los sinónimos cubren los músculos
 * comunes con/sin tilde. Es un trade-off consciente frente a descargar el catálogo completo para
 * filtrar en el cliente.
 */
export function buildExerciseSearchOr(search: string): string | null {
    const s = search.trim()
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
 * Una página del catálogo (columnas de LISTA). `count: 'exact'` devuelve el total del set
 * filtrado en el MISMO round-trip → `hasMore` preciso y contador de "restantes" sin query extra.
 */
export async function fetchExercisePage(
    supabase: ServerClient,
    params: {
        scopeFilter: string
        muscle?: string | null
        search?: string | null
        offset?: number
        limit?: number
    },
): Promise<ExercisePage> {
    const { scopeFilter, muscle, search, offset = 0, limit = CATALOG_PAGE_SIZE } = params

    let q = supabase
        .from('exercises')
        .select(EXERCISE_LIST_COLUMNS, { count: 'exact' })
        .or(scopeFilter)
        .is('deleted_at', null)

    if (muscle && muscle !== 'Todos') q = q.eq('muscle_group', muscle)
    const searchOr = buildExerciseSearchOr(search ?? '')
    if (searchOr) q = q.or(searchOr)

    const { data, count } = await q.order('name').range(offset, offset + limit - 1)
    const exercises = (data ?? []) as unknown as CatalogExercise[]
    const total = count ?? offset + exercises.length
    return { exercises, hasMore: offset + exercises.length < total, total }
}

/**
 * Grupos musculares del scope, para los chips de filtro. Trae una sola columna liviana
 * (`muscle_group`) y deduplica en memoria — payload despreciable frente al media.
 */
async function fetchScopeMuscleGroups(
    supabase: ServerClient,
    scopeFilter: string,
): Promise<string[]> {
    const { data } = await supabase
        .from('exercises')
        .select('muscle_group')
        .or(scopeFilter)
        .is('deleted_at', null)
    const set = new Set<string>()
    for (const row of (data ?? []) as Array<{ muscle_group: string | null }>) {
        if (row.muscle_group) set.add(row.muscle_group)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Datos iniciales de la pantalla: PRIMERA página (paginada server-side) + grupos musculares
 * (chips) + branding del coach. `initialSearch` viene del deep-link `?q=` (desde los PRs del
 * dashboard). El resto del catálogo llega vía `loadClientExercisesAction`.
 */
export const getClientExerciseCatalogData = cache(async (initialSearch = '') => {
    const supabase = await createClient()
    const scope = await resolveCatalogScope(supabase)
    if (!scope) {
        return {
            user: null as { id: string } | null,
            coachBranding: null as CatalogScope['coachBranding'],
            exercises: [] as CatalogExercise[],
            muscleGroups: [] as string[],
            hasMore: false,
            total: 0,
        }
    }

    const [page, muscleGroups] = await Promise.all([
        fetchExercisePage(supabase, { scopeFilter: scope.scopeFilter, search: initialSearch }),
        fetchScopeMuscleGroups(supabase, scope.scopeFilter),
    ])

    return {
        user: { id: scope.userId },
        coachBranding: scope.coachBranding,
        exercises: page.exercises,
        muscleGroups,
        hasMore: page.hasMore,
        total: page.total,
    }
})
