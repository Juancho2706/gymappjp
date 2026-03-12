import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import type { Exercise } from '@/lib/database.types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | OmniCoach OS' }

export default async function CoachExercisesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .is('coach_id', null)
        .order('muscle_group')
        .order('name')

    const exercises = (rawExercises ?? []) as Exercise[]

    const byMuscle = exercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
        acc[ex.muscle_group].push(ex)
        return acc
    }, {})

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-8 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-foreground" style={{ fontFamily: 'var(--font-outfit)' }}>
                        Catálogo de Ejercicios
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {exercises.length} ejercicios globales disponibles
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ExerciseCatalogClient
                    globalExercises={exercises}
                    customExercises={[]}
                    byMuscle={byMuscle}
                />
            </div>
        </div>
    )
}
