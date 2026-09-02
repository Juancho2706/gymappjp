import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_CATALOG_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import { exerciseVisibilityOrFilter } from '@/lib/exercises/exercise-visibility-filter'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

export type ExerciseCatalogRow = Exercise

export interface ExerciseCatalog {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
    /**
     * id de ejercicio PROPIO → cuántos bloques de programa lo referencian. Alimenta el aviso
     * previo a eliminar ("lo que ya lo usa lo conserva tal cual"): el borrado es soft, los
     * bloques ya armados siguen apuntando a la fila.
     * OJO: con la RLS de `workout_blocks` el conteo es "de tus programas" (los que ves — en un
     * workspace team, los del pool), NUNCA global. Es informativo: no autoriza nada.
     */
    usageByExercise: Record<string, number>
}

export const getExerciseCatalog = cache(async (
    coachId: string,
    orgId?: string | null,
    teamId?: string | null
): Promise<ExerciseCatalog> => {
    const supabase = await createClient()

    // Scope 3 vías (team > org > coach) — helper compartido con el builder de plantillas, que
    // scopeaba con solo 2 vías. Ver `@/lib/exercises/exercise-visibility-filter`.
    const filterStr = exerciseVisibilityOrFilter({ coachId, orgId, teamId })

    let exercisesQuery = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(filterStr)
        .is('deleted_at', null)
        .order('muscle_group')
        .order('name')

    if (exercisesQuery.error) {
        // Fallback if new columns not yet present (e.g. before migration)
        exercisesQuery = await supabase
            .from('exercises')
            .select('*')
            .or(filterStr)
            .order('muscle_group')
            .order('name')
    }

    const allExercises = (exercisesQuery.data ?? []) as Exercise[]
    const globalExercises = allExercises.filter(ex =>
        ex.coach_id === null
        && (ex as Record<string, unknown>).org_id == null
        && (ex as Record<string, unknown>).team_id == null
    )
    const customExercises = allExercises.filter(ex =>
        teamId
            ? (ex as Record<string, unknown>).team_id === teamId
            : (ex.coach_id === coachId || (orgId && (ex as Record<string, unknown>).org_id === orgId))
    )
    const byMuscle = globalExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
        acc[ex.muscle_group].push(ex)
        return acc
    }, {})

    // Uso de los ejercicios propios. Solo sobre `customExercises`: son los únicos editables/
    // eliminables, y los del catálogo global viven en miles de planes (contarlos sería un scan
    // inútil en cada render). Ante cualquier error el conteo se degrada a {} — es un dato de
    // apoyo del diálogo de borrado, jamás debe tumbar el catálogo.
    let usageByExercise: Record<string, number> = {}
    if (customExercises.length > 0) {
        const { data: usageRows, error: usageError } = await supabase
            .from('workout_blocks')
            .select('exercise_id')
            .in('exercise_id', customExercises.map(ex => ex.id))

        if (!usageError && usageRows) {
            usageByExercise = usageRows.reduce<Record<string, number>>((acc, row) => {
                const id = (row as { exercise_id: string | null }).exercise_id
                if (id) acc[id] = (acc[id] ?? 0) + 1
                return acc
            }, {})
        }
    }

    return { globalExercises, customExercises, byMuscle, usageByExercise }
})
