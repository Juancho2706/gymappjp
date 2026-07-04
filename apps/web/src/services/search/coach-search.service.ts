import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CoachClientScope } from '@/app/coach/clients/_data/clients.queries'
import { buildExerciseSearchOr } from '@/app/c/[coach_slug]/exercises/_data/exercises.queries'
import { exerciseGridThumb } from '@/lib/exercises/exercise-thumb'
import { searchCoachRecipes } from '@/services/nutrition-recipes.service'

/**
 * Agregador de la búsqueda global del topbar coach.
 *
 * COMPONE las búsquedas server-side ya existentes de las 4 categorías (Alumnos / Programas /
 * Ejercicios / Recetas) con el MISMO scope 3-vías vigente (enterprise / team-pool / standalone).
 * No inventa política de visibilidad: cada sub-búsqueda replica exactamente el filtro de scope de
 * su query canónica (`getCoachClientsWithPrograms`, `getWorkoutProgramsWithClients`,
 * `getExerciseCatalog`, `listCoachRecipes`). RLS es el techo; el filtro explícito evita cruzar
 * pool/enterprise/standalone.
 *
 * SEGURIDAD (AC duro del SPEC): el `scope` SIEMPRE lo deriva el caller (route handler) de la
 * sesión/JWT — nunca del query string. Este servicio solo aplica lo que recibe.
 *
 * Capa: services/ — recibe el supabase client request-scoped del caller (route handler). No usa
 * React.cache (la búsqueda es on-demand, no un render RSC deduplicable).
 */

export type SearchHit = {
    id: string
    label: string
    sublabel?: string
    href: string
    thumbUrl?: string | null
}

export type CoachSearchResults = {
    clients: SearchHit[]
    programs: SearchHit[]
    exercises: SearchHit[]
    recipes: SearchHit[]
}

/** Mínimo de caracteres para golpear la DB (evita búsquedas de 1 letra = catálogo entero). */
export const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT_PER_GROUP = 5

type DB = SupabaseClient<Database>

export function emptyCoachSearchResults(): CoachSearchResults {
    return { clients: [], programs: [], exercises: [], recipes: [] }
}

/** Patrón `ilike` case-insensitive `%término%` (mismo criterio que el resto de la app). */
function ilikePattern(q: string): string {
    return `%${q}%`
}

/** Ficha del programa: plantilla → builder de plantillas; asignado → builder del alumno. */
function programHref(program: { id: string; client_id: string | null }): string {
    return program.client_id
        ? `/coach/builder/${program.client_id}?programId=${program.id}`
        : `/coach/workout-programs/builder?programId=${program.id}`
}

/**
 * Alumnos — columnas mínimas (`id, full_name`), scope 3-vías idéntico a
 * `getCoachClientsWithPrograms`. `clients` no tiene columna de avatar → el hit no lleva thumb
 * (el dropdown pinta iniciales client-side).
 */
async function searchClients(
    supabase: DB,
    coachId: string,
    scope: CoachClientScope,
    pattern: string,
    limit: number,
): Promise<SearchHit[]> {
    let query = supabase
        .from('clients')
        .select('id, full_name')
        .ilike('full_name', pattern)
        .order('full_name')
        .limit(limit)

    if (scope.orgId) {
        query = query.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        query = query.is('org_id', null).eq('team_id', scope.activeTeamId)
    } else {
        query = query.eq('coach_id', coachId).is('org_id', null).is('team_id', null)
    }

    const { data } = await query
    return (data ?? []).map((c) => ({
        id: c.id,
        label: c.full_name,
        href: `/coach/clients/${c.id}`,
    }))
}

/**
 * Programas — columnas mínimas (`id, name, client_id`), scope 3-vías idéntico a
 * `getWorkoutProgramsWithClients`. En team-pool se resuelven los ids del pool y se acota a
 * plantillas propias ∪ programas de alumnos del pool (mismo `or()` que la query canónica).
 */
async function searchPrograms(
    supabase: DB,
    coachId: string,
    scope: CoachClientScope,
    pattern: string,
    limit: number,
): Promise<SearchHit[]> {
    let query = supabase
        .from('workout_programs')
        .select('id, name, client_id')
        .ilike('name', pattern)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (scope.orgId) {
        query = query.eq('coach_id', coachId).eq('org_id', scope.orgId)
    } else if (scope.activeTeamId) {
        const { data: poolClients } = await supabase
            .from('clients')
            .select('id')
            .is('org_id', null)
            .eq('team_id', scope.activeTeamId)
        const poolIds = (poolClients ?? []).map((c) => c.id)
        query = query.is('org_id', null)
        query =
            poolIds.length > 0
                ? query.or(
                      `and(coach_id.eq.${coachId},client_id.is.null),client_id.in.(${poolIds.join(',')})`,
                  )
                : query.eq('coach_id', coachId).is('client_id', null)
    } else {
        query = query.eq('coach_id', coachId).is('org_id', null)
    }

    const { data } = await query
    return (data ?? []).map((p) => ({
        id: p.id,
        label: p.name,
        sublabel: p.client_id ? 'Programa asignado' : 'Plantilla',
        href: programHref(p),
    }))
}

/**
 * Ejercicios — reutiliza `buildExerciseSearchOr` (nombre/músculo/equipo/parte + sinónimos de
 * músculo) y el `scopeFilter` (system ∪ scope) idéntico a `getExerciseCatalog`. `href` al catálogo
 * del coach con el término pre-cargado (`?q=`).
 */
async function searchExercises(
    supabase: DB,
    coachId: string,
    scope: CoachClientScope,
    rawQuery: string,
    limit: number,
): Promise<SearchHit[]> {
    const searchOr = buildExerciseSearchOr(rawQuery)
    if (!searchOr) return []

    let scopeFilter: string
    if (scope.activeTeamId) {
        scopeFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),team_id.eq.${scope.activeTeamId}`
    } else if (scope.orgId) {
        scopeFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),org_id.eq.${scope.orgId}`
    } else {
        scopeFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),coach_id.eq.${coachId}`
    }

    const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, thumbnail_url, gif_url, video_url')
        .or(scopeFilter)
        .is('deleted_at', null)
        .or(searchOr)
        .order('name')
        .limit(limit)

    type ExerciseHitRow = {
        id: string
        name: string
        muscle_group: string | null
        thumbnail_url: string | null
        gif_url: string | null
        video_url: string | null
    }

    return ((data ?? []) as ExerciseHitRow[]).map((ex) => ({
        id: ex.id,
        label: ex.name,
        sublabel: ex.muscle_group ?? undefined,
        href: `/coach/exercises?q=${encodeURIComponent(ex.name)}`,
        thumbUrl: exerciseGridThumb(ex, 96),
    }))
}

/**
 * Recetas — `searchCoachRecipes` (scope coach XOR team, columnas mínimas). Las recetas del feature
 * L (`nutrition_recipes`) NO tienen ruta de detalle propia: viven en la pestaña "Recetas" del hub
 * de nutrición → `href` a `/coach/nutrition-plans?tab=recipes`.
 */
async function searchRecipes(
    supabase: DB,
    coachId: string,
    scope: CoachClientScope,
    rawQuery: string,
    limit: number,
): Promise<SearchHit[]> {
    const rows = await searchCoachRecipes(
        supabase,
        { coachId, teamId: scope.activeTeamId },
        rawQuery,
        limit,
    )
    return rows.map((r) => ({
        id: r.id,
        label: r.name,
        href: '/coach/nutrition-plans?tab=recipes',
        thumbUrl: r.image_url,
    }))
}

/**
 * Búsqueda global del workspace del coach. Ejecuta las 4 sub-búsquedas en paralelo
 * (`Promise.all`). Query `< MIN_QUERY_LENGTH` (tras trim) → resultados vacíos SIN golpear DB.
 */
export async function searchCoachWorkspace(
    supabase: DB,
    params: {
        coachId: string
        scope: CoachClientScope
        query: string
        limitPerGroup?: number
    },
): Promise<CoachSearchResults> {
    const q = params.query.trim()
    if (q.length < MIN_QUERY_LENGTH) return emptyCoachSearchResults()

    const limit = params.limitPerGroup ?? DEFAULT_LIMIT_PER_GROUP
    const pattern = ilikePattern(q)
    const { coachId, scope } = params

    const [clients, programs, exercises, recipes] = await Promise.all([
        searchClients(supabase, coachId, scope, pattern, limit),
        searchPrograms(supabase, coachId, scope, pattern, limit),
        searchExercises(supabase, coachId, scope, q, limit),
        searchRecipes(supabase, coachId, scope, q, limit),
    ])

    return { clients, programs, exercises, recipes }
}
