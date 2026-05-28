import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import type { Tables } from '@/lib/database.types'
import { getCoach } from '@/lib/coach/get-coach'
import { getTierCapabilities, type SubscriptionTier } from '@/lib/constants'
import { getMyAndSystemExercises } from './_data/exercises.queries'
import { ExerciseCreateButton } from './_components/ExerciseCreateButton'
import type { Metadata } from 'next'

type Exercise = Tables<'exercises'>

export const metadata: Metadata = { title: 'Ejercicios | EVA' }

export default async function CoachExercisesPage() {
    const supabase = await createClient()
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const tier = (coach.subscription_tier ?? 'free') as SubscriptionTier
    const caps = getTierCapabilities(tier)

    const allExercises = (await getMyAndSystemExercises(coach.id)) as Exercise[]

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
                {caps.canCreateCustomExercises && <ExerciseCreateButton />}
            </div>

            <div className="grid grid-cols-1 gap-6">
                <ExerciseCatalogClient
                    globalExercises={globalExercises}
                    customExercises={customExercises}
                    byMuscle={byMuscle}
                    myCoachId={coach.id}
                    coachLogoUrl={coach.logo_url}
                    canEdit={caps.canCreateCustomExercises}
                />
            </div>
        </div>
    )
}

