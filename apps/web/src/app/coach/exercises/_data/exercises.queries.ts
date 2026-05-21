import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_CATALOG_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import type { Tables } from '@/lib/database.types'

type Exercise = Tables<'exercises'>

export interface ExerciseCatalog {
    globalExercises: Exercise[]
    customExercises: Exercise[]
    byMuscle: Record<string, Exercise[]>
}

export const getExerciseCatalog = cache(async (coachId: string): Promise<ExerciseCatalog> => {
    const supabase = await createClient()

    let exercisesQuery = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(`coach_id.is.null,coach_id.eq.${coachId}`)
        .order('muscle_group')
        .order('name')

    if (exercisesQuery.error) {
        exercisesQuery = await supabase
            .from('exercises')
            .select('*')
            .or(`coach_id.is.null,coach_id.eq.${coachId}`)
            .order('muscle_group')
            .order('name')
    }

    const allExercises = (exercisesQuery.data ?? []) as Exercise[]
    const globalExercises = allExercises.filter(ex => ex.coach_id === null)
    const customExercises = allExercises.filter(ex => ex.coach_id === coachId)
    const byMuscle = globalExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
        acc[ex.muscle_group].push(ex)
        return acc
    }, {})

    return { globalExercises, customExercises, byMuscle }
})
