import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_CATALOG_COLUMNS } from '@/lib/exercises/exercise-catalog-select'

export const getMyAndSystemExercises = cache(async (coachId: string) => {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(`coach_id.is.null,coach_id.eq.${coachId}`)
        .is('deleted_at', null)
        .order('name')

    if (error) throw error
    return data ?? []
})

export type ExerciseCatalogRow = Awaited<ReturnType<typeof getMyAndSystemExercises>>[number]
