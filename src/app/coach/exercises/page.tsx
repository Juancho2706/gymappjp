import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import type { Tables } from '@/lib/database.types'
import { EXERCISE_CATALOG_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import { getCoach } from '@/lib/coach/get-coach'

type Exercise = Tables<'exercises'>
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | EVA' }

export default async function CoachExercisesPage() {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) redirect('/login')

    let exercisesQuery = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(`coach_id.is.null,coach_id.eq.${coach.id}`)
        .order('muscle_group')
        .order('name')

    // Compat fallback: if a newer explicit column is missing in DB,
    // avoid leaving the exercise library empty.
    if (exercisesQuery.error) {
        exercisesQuery = await supabase
            .from('exercises')
            .select('*')
            .or(`coach_id.is.null,coach_id.eq.${coach.id}`)
            .order('muscle_group')
            .order('name')
    }

    const allExercises = (exercisesQuery.data ?? []) as Exercise[]
    
    const globalExercises = allExercises.filter(ex => ex.coach_id === null)
    const customExercises = allExercises.filter(ex => ex.coach_id === coach.id)

    const byMuscle = globalExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
        acc[ex.muscle_group].push(ex)
        return acc
    }, {})

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-8 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                        Catálogo de Ejercicios
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {globalExercises.length + customExercises.length} ejercicios disponibles
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ExerciseCatalogClient
                    globalExercises={globalExercises}
                    customExercises={customExercises}
                    byMuscle={byMuscle}
                />
            </div>
        </div>
    )
}

