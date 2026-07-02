'use server'

import { createClient } from '@/lib/supabase/server'
import type { CatalogExercise } from '@/lib/exercises/exercise-thumb'
import {
    resolveCatalogScope,
    fetchExercisePage,
    CATALOG_PAGE_SIZE,
} from '../_data/exercises.queries'

/**
 * Página incremental del catálogo (búsqueda + filtro de músculo + offset), para el infinite
 * scroll REAL y los cambios de filtro server-side. Re-deriva el scope del alumno desde `auth`
 * (nunca del body) → RLS es el techo. Mantiene el payload liviano (sin `instructions`).
 */
export async function loadClientExercisesAction(params: {
    search?: string
    muscle?: string
    offset?: number
}): Promise<{ exercises: CatalogExercise[]; hasMore: boolean; total: number }> {
    const supabase = await createClient()
    const scope = await resolveCatalogScope(supabase)
    if (!scope) return { exercises: [], hasMore: false, total: 0 }

    return fetchExercisePage(supabase, {
        scopeFilter: scope.scopeFilter,
        muscle: params.muscle,
        search: params.search,
        offset: params.offset ?? 0,
        limit: CATALOG_PAGE_SIZE,
    })
}

/**
 * Detalle on-demand de UN ejercicio (instrucciones + media alterna), al abrir su tarjeta.
 * Mantiene el listado del catálogo liviano (sin `instructions`): el blob pesado solo viaja para
 * el ejercicio que el alumno realmente abre. User-scoped → RLS es el techo (el alumno solo lee
 * ejercicios de su sistema/coach/team).
 */
export async function getExerciseInstructions(
    exerciseId: string
): Promise<{ instructions: string[] | null; image_url: string | null } | null> {
    if (!exerciseId) return null
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('exercises')
        .select('instructions, image_url')
        .eq('id', exerciseId)
        .is('deleted_at', null)
        .maybeSingle()

    if (error || !data) return null
    return { instructions: data.instructions ?? null, image_url: data.image_url ?? null }
}
