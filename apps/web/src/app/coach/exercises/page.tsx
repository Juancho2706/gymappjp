import { redirect } from 'next/navigation'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachOrgContext } from '@/lib/coach-context'
import { getExerciseCatalog } from './_data/exercises.queries'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | EVA' }

export default async function CoachExercisesPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const ctx = await getCoachOrgContext()
    const orgId = ctx?.orgId ?? null
    // Enterprise coach (role='coach' within org) cannot create exercises
    const canCreateExercises = !ctx?.isOrgUser || ctx.isOrgAdmin

    const { globalExercises, customExercises, byMuscle } = await getExerciseCatalog(coach.id, orgId)

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
                    canCreateExercises={canCreateExercises}
                />
            </div>
        </div>
    )
}
