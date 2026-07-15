import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'
import type { BuilderCardioContext } from '../types'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { listAvailableWorkoutAreas } from '@/services/workout/workout-areas.service'
import { getClientZonesForContext } from '@/services/cardio-zones.service'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'

type Client = Pick<Tables<'clients'>, 'id' | 'full_name' | 'email'>
type Exercise = Tables<'exercises'>

function applyOrgScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
    query: T,
    orgId: string | null
): T {
    return orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
}

export const getBuilderData = cache(async (clientId: string, programId?: string) => {
    const supabase = await createClient()
    // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó/refrescó la sesión.
    const { data: __cl } = await supabase.auth.getClaims()
    const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
    if (!user) return { user: null, client: null, exercises: [] as Exercise[], initialProgram: null, areas: [] as WorkoutArea[], cardio: { enabled: false, zones: null } as BuilderCardioContext }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null

    // Acceso por workspace ACTIVO (separación estricta): team ⇒ SOLO alumnos de ESE pool
    // (colaborativo, sin filtro coach_id; RLS techo); standalone ⇒ propios NO-pool; enterprise ⇒ org.
    let clientQuery = supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
    if (activeTeamId) {
        clientQuery = clientQuery.eq('team_id', activeTeamId).is('org_id', null)
    } else {
        clientQuery = clientQuery.eq('coach_id', user.id)
        clientQuery = applyOrgScope(clientQuery, orgId)
        if (!orgId) clientQuery = clientQuery.is('team_id', null)
    }

    // Fase 2C / F7: scope exercises to the active workspace — standalone shows system + own,
    // enterprise shows system + the org catalog (RLS enforces the boundary either way).
    // Team (Plan 2 entrenamiento, AC11 — mustFix anti-fantasma): asignable = system + catálogo
    // del team, SIN ejercicios personales. Un ejercicio coach_id = user.id en un plan del pool
    // no es legible ni por los otros miembros ni por los alumnos del pool
    // (exercises_client_coach_select exige clients.coach_id = exercises.coach_id) ⇒ bloque
    // fantasma en la ejecución. Para usar uno personal: "Copiar al team" (copy-on-use, diferido).
    // El predicado system exige team_id NULL (espejo de la policy exercises_select_visible).
    const exercisesFilter = orgId
        ? `and(coach_id.is.null,org_id.is.null,team_id.is.null),org_id.eq.${orgId}`
        : activeTeamId
            ? `and(coach_id.is.null,org_id.is.null,team_id.is.null),team_id.eq.${activeTeamId}`
            : `and(coach_id.is.null,org_id.is.null,team_id.is.null),and(coach_id.eq.${user.id},org_id.is.null,team_id.is.null)`

    const [clientResult, exercisesResult, areas, cardio] = await Promise.all([
        clientQuery.maybeSingle(),
        supabase
            .from('exercises')
            .select(EXERCISE_LIST_COLUMNS)
            .or(exercisesFilter)
            .order('muscle_group')
            .order('name'),
        // Areas del builder (workout_section_templates) segun workspace activo.
        // Enterprise: solo system por ahora (sin areas de org en v1).
        listAvailableWorkoutAreas(supabase, {
            coachId: orgId ? null : user.id,
            teamId: activeTeamId,
        }),
        // Modulo cardio (gated por el contexto del RECURSO — el alumno): zonas para chips
        // del builder. Enterprise fuera de alcance v1 (modulo no habilitado ahi).
        orgId
            ? Promise.resolve<BuilderCardioContext>({ enabled: false, zones: null })
            : getClientZonesForContext(supabase, clientId)
                .then((r): BuilderCardioContext => ({ enabled: r.enabled, zones: r.zones?.zones ?? null }))
                .catch((): BuilderCardioContext => ({ enabled: false, zones: null })),
    ])

    let initialProgram = null
    if (programId) {
        let programQuery = supabase
            .from('workout_programs')
            .select(`
                *,
                workout_plans (
                    *,
                    workout_blocks (
                        *,
                        exercises ( name, muscle_group, gif_url, video_url, thumbnail_url, exercise_type )
                    )
                )
            `)
            .eq('id', programId)
            // PostgREST no garantiza el orden de embeds sin .order() explicito —
            // sin esto, los bloques llegan en orden de heap (aleatorio tras updates).
            .order('order_index', { referencedTable: 'workout_plans.workout_blocks', ascending: true })
        if (activeTeamId) {
            // Pool colaborativo: el programa del alumno del pool puede ser de otro coach del team.
            // RLS valida la fila; el client gate de arriba ya exige que el alumno sea de ESTE pool.
            programQuery = programQuery.eq('client_id', clientId).is('org_id', null)
        } else {
            programQuery = programQuery.eq('coach_id', user.id)
            programQuery = applyOrgScope(programQuery, orgId)
        }
        const { data: program } = await programQuery.maybeSingle()
        initialProgram = program ?? null
    }

    // E (awareness): nombre del último editor — solo interesa en el pool (contexto team)
    // y solo si fue OTRO coach (el badge "editado por mí" es ruido).
    let lastEditor: { name: string; at: string | null } | null = null
    const editedBy = (initialProgram as { last_edited_by_coach_id?: string | null } | null)?.last_edited_by_coach_id
    if (activeTeamId && editedBy && editedBy !== user.id) {
        const { data: editor } = await supabase
            .from('coaches')
            .select('full_name, brand_name')
            .eq('id', editedBy)
            .maybeSingle()
        if (editor) {
            lastEditor = {
                name: editor.full_name || editor.brand_name || 'Otro coach',
                at: (initialProgram as { updated_at?: string | null } | null)?.updated_at ?? null,
            }
        }
    }

    return {
        user,
        client: clientResult.data as Client | null,
        exercises: (exercisesResult.data ?? []) as Exercise[],
        initialProgram,
        lastEditor,
        areas,
        cardio,
    }
})
