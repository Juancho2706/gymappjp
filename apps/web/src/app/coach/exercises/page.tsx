import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { ExerciseCatalogClient } from './ExerciseCatalogClient'
import { getCoach } from '@/lib/coach/get-coach'
import { getCoachOrgContext } from '@/lib/coach-context'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { getExerciseCatalog } from './_data/exercises.queries'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Ejercicios | EVA' }

// Next 16: la ruta usa cookies (auth via createClient). Sin esto, el re-render del server
// action intenta render estático y cookies() tira DynamicServerError -> 500 ("Oops") al crear.
export const dynamic = 'force-dynamic'

export default async function CoachExercisesPage() {
  try {
    await connection()
    const coach = await getCoach()
    if (!coach) redirect('/login')

    // Workspace ACTIVO (AC6/AC11): en contexto team el catálogo es el del POOL (system + team)
    // y cualquier miembro activo puede crear — espejo de resolveExerciseOwner en las actions.
    const supabase = await createClient()
    const [ctx, workspace] = await Promise.all([
        getCoachOrgContext(),
        resolvePreferredWorkspace(supabase, coach.id),
    ])
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
    const orgId = activeTeamId ? null : ctx?.orgId ?? null
    // Enterprise coach (role='coach' within org) cannot create exercises; team member can.
    const canCreateExercises = activeTeamId ? true : (!ctx?.isOrgUser || ctx.isOrgAdmin)

    const { globalExercises, customExercises, byMuscle } = await getExerciseCatalog(coach.id, orgId, activeTeamId)

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
  } catch (e) {
    const digest = (e as { digest?: string })?.digest
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP') || digest === 'NEXT_NOT_FOUND')) throw e
    try {
      const { createClient: sbAdmin } = await import('@supabase/supabase-js')
      const admin = sbAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
      await admin.from('admin_audit_logs').insert({
        admin_email: 'DIAG-exercisesPage', action: 'page.render.error', target_table: 'exercises', target_id: null,
        payload: { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? (e.stack ?? '').slice(0, 4000) : '' },
      })
    } catch { /* noop */ }
    throw e
  }
}
