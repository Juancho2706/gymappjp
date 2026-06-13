import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_LIST_COLUMNS } from '@/lib/exercises/exercise-catalog-select'

/**
 * Catálogo del alumno. Eficiencia:
 *  - Columnas de LISTA (sin `instructions`/`image_url`, los blobs pesados) → payload menor.
 *    `instructions` se trae on-demand al abrir el detalle (getExerciseInstructions).
 *  - Una sola query cacheada (React.cache) + filtro de scope. RLS es el techo real.
 *  - `deleted_at IS NULL` (antes faltaba → traía borrados que RLS igual podía exponer).
 */
export const getClientExerciseCatalogData = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, exercises: [] }

    const { data: client } = await supabase
        .from('clients')
        .select('id, coach_id, org_id, team_id, coaches ( brand_name, primary_color )')
        .eq('id', user.id)
        .maybeSingle()
    if (!client) return { user, client: null, exercises: [] }

    // sistema (todo NULL) ∪ el set del scope del alumno: org | team (pool) | coach (standalone).
    // RLS (exercises_select_visible / _client_team_select / _client_org_select) hace cumplir el límite.
    let scopeBranch: string
    if (client.org_id) scopeBranch = `org_id.eq.${client.org_id}`
    else if (client.team_id) scopeBranch = `team_id.eq.${client.team_id}` // pool — antes faltaba esta rama
    else scopeBranch = `and(coach_id.eq.${client.coach_id},org_id.is.null,team_id.is.null)`
    const exercisesFilter = `and(coach_id.is.null,org_id.is.null,team_id.is.null),${scopeBranch}`

    const { data: exercises } = await supabase
        .from('exercises')
        .select(EXERCISE_LIST_COLUMNS)
        .or(exercisesFilter)
        .is('deleted_at', null)
        .order('name')

    return { user, client, exercises: exercises ?? [] }
})
