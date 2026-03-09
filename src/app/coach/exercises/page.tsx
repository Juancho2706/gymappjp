import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Plus, User } from 'lucide-react'
import { CreateExerciseForm } from './CreateExerciseForm'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import type { Exercise } from '@/lib/database.types'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | OmniCoach OS' }

const MUSCLE_GROUPS = [
    'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps',
    'Antebrazos', 'Core', 'Cuádriceps', 'Isquiotibiales',
    'Glúteos', 'Pantorrillas', 'Full Body', 'Cardio',
    'Brazos', 'Piernas',
]

export default async function CoachExercisesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

    const exercises = (rawExercises ?? []) as Exercise[]
    const globalExercises = exercises.filter(e => !e.coach_id)
    const customExercises = exercises.filter(e => e.coach_id === user.id)

    const byMuscle = globalExercises.reduce<Record<string, Exercise[]>>((acc, ex) => {
        if (!acc[ex.muscle_group]) acc[ex.muscle_group] = []
        acc[ex.muscle_group].push(ex)
        return acc
    }, {})

    return (
        <div className="p-8 max-w-6xl animate-fade-in">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-extrabold text-foreground">
                        Catálogo de Ejercicios
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        {globalExercises.length} globales · {customExercises.length} personalizados
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: custom exercise creation */}
                <div className="lg:col-span-1">
                    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                        <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                            <Plus className="w-4 h-4 text-primary" />
                            Agregar ejercicio propio
                        </h2>
                        <CreateExerciseForm muscleGroups={MUSCLE_GROUPS} coachId={user.id} />
                    </div>

                    {customExercises.length > 0 && (
                        <div className="bg-card border border-border rounded-2xl p-5 mt-4 shadow-sm">
                            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                                <User className="w-4 h-4 text-primary" />
                                Mis ejercicios
                            </h2>
                            <ul className="space-y-2">
                                {customExercises.map(ex => (
                                    <li key={ex.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                                        <div>
                                            <p className="text-sm text-foreground">{ex.name}</p>
                                            <p className="text-xs text-muted-foreground">{ex.muscle_group}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Right: clickable global catalog with preview modal */}
                <ExerciseCatalogClient
                    globalExercises={globalExercises}
                    customExercises={customExercises}
                    byMuscle={byMuscle}
                />
            </div>
        </div>
    )
}
