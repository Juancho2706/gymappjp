import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listAvailableWorkoutAreas } from '@/services/workout/workout-areas.service'
import { hasModule } from '@/services/entitlements.service'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'
import { exerciseVisibilityOrFilter } from '@/lib/exercises/exercise-visibility-filter'
import type { Tables } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'
import type { BuilderCardioContext } from '../../../builder/[clientId]/types'

type Exercise = Tables<'exercises'>

export const getTemplateBuilderData = cache(async (programId?: string) => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, exercises: [] as Exercise[], initialProgram: null, areas: [] as WorkoutArea[], cardio: { enabled: false, zones: null } as BuilderCardioContext }

    // Resolve workspace to apply correct org scope
    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    const [{ data: rawExercises }, areas, cardio] = await Promise.all([
        supabase
            .from('exercises')
            .select(EXERCISE_LIST_COLUMNS)
            // Mismo scope 3 vías que el catálogo real (`getExerciseCatalog`). El filtro anterior
            // (`coach_id.is.null,coach_id.eq.<id>`) tenía dos agujeros: colaba como "del sistema"
            // cualquier fila de team/org (coach_id NULL) y, en workspace team, ofrecía los
            // ejercicios PERSONALES del coach — «Editar» sobre uno de ellos terminaba en el error
            // explícito de la action, y arrastrarlo al plan es un bloque fantasma para el alumno.
            .or(exerciseVisibilityOrFilter({ coachId: user.id, orgId, teamId: activeTeamId }))
            // El catálogo también esconde los eliminados: sin esto el builder de plantillas seguía
            // ofreciendo un ejercicio que el coach ya borró de su biblioteca.
            .is('deleted_at', null)
            .order('muscle_group')
            .order('name'),
        // Areas del builder segun workspace activo (enterprise: solo system en v1).
        listAvailableWorkoutAreas(supabase, {
            coachId: orgId ? null : user.id,
            teamId: activeTeamId,
        }),
        // Módulo cardio en PLANTILLAS (sin alumno ⇒ sin contexto de recurso): decide el propio
        // COACH/workspace vía la derivación "pago ⇒ todos los módulos" de entitlements.service.
        // Antes esta página no pasaba `cardio` y el sheet mostraba el candado incluso a coaches
        // Pro (QA CEO 2026-07-25). Enterprise sigue fuera de alcance v1 (módulo OFF).
        orgId
            ? Promise.resolve<BuilderCardioContext>({ enabled: false, zones: null })
            : hasModule(supabase, 'cardio', { teamId: activeTeamId, coachId: activeTeamId ? null : user.id })
                .then((enabled): BuilderCardioContext => ({ enabled, zones: null }))
                .catch((): BuilderCardioContext => ({ enabled: false, zones: null })),
    ])

    let initialProgram = null
    if (programId) {
        let query = supabase
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (
                        *,
                        exercises ( name, muscle_group )
                    )
                )
            `)
            .eq('id', programId)
            .eq('coach_id', user.id)
            // PostgREST no garantiza el orden de embeds sin .order() explicito.
            .order('order_index', { referencedTable: 'workout_plans.workout_blocks', ascending: true })

        // Scope to active workspace — enterprise coach only sees programs from their org
        if (orgId) {
            query = query.eq('org_id', orgId)
        } else {
            query = query.is('org_id', null)
        }

        const { data: program } = await query.single()
        initialProgram = program ?? null
    }

    return {
        user,
        exercises: (rawExercises ?? []) as Exercise[],
        initialProgram,
        areas,
        cardio,
    }
})
