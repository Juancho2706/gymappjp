import { redirect } from 'next/navigation'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachOrgContext } from '@/lib/coach-context'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getExerciseCatalog } from './_data/exercises.queries'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | EVA' }

// Dashboard autenticado: lee cookies (sesion) ⇒ render dinamico. Explicito por claridad.
export const dynamic = 'force-dynamic'

export default async function CoachExercisesPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    // Workspace ACTIVO (AC6/AC11): en contexto team el catálogo es el del POOL (system + team)
    // y cualquier miembro activo puede crear — espejo de resolveExerciseOwner en las actions.
    const [ctx, workspace] = await Promise.all([
        getCoachOrgContext(),
        getPreferredWorkspaceForRender(coach.id),
    ])
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    const orgId = activeTeamId ? null : ctx?.orgId ?? null
    // Enterprise coach (role='coach' within org) cannot create exercises; team member can.
    const canCreateExercises = activeTeamId ? true : (!ctx?.isOrgUser || ctx.isOrgAdmin)

    const { globalExercises, customExercises, byMuscle } = await getExerciseCatalog(coach.id, orgId, activeTeamId)

    return (
        // Móvil: SIN padding propio — CoachMainWrapper ya da el gutter px-5 (patrón Alumnos).
        // Desktop conserva su p-8 + max-w-6xl.
        <div className="md:p-8 max-w-6xl mx-auto animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 md:mb-8 gap-4">
                <div>
                    <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-[-0.03em] text-strong">
                        Catálogo de Ejercicios
                    </h1>
                    <p className="text-muted text-sm mt-1">
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
