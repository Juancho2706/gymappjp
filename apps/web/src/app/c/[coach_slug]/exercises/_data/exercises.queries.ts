import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { EXERCISE_CATALOG_COLUMNS } from '@/lib/exercises/exercise-catalog-select'

export const getClientExerciseCatalogData = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, exercises: [] }

    const clientResponse = await (supabase as any)
        .from('clients')
        .select(`
            id, coach_id, org_id,
            coaches ( brand_name, primary_color )
        `)
        .eq('id', user.id)
        .maybeSingle()

    const client = clientResponse.data
    if (!client) return { user, client: null, exercises: [] }

    // F9 / Fase 2C: enterprise alumno sees system + their org's exercises; standalone alumno
    // sees system + their coach's. RLS enforces the boundary; this filters to the right set.
    const exercisesFilter = client.org_id
        ? `and(coach_id.is.null,org_id.is.null),org_id.eq.${client.org_id}`
        : `and(coach_id.is.null,org_id.is.null),and(coach_id.eq.${client.coach_id},org_id.is.null)`

    const exercisesResponse = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(exercisesFilter)
        .order('name')

    return { user, client, exercises: exercisesResponse.data ?? [] }
})
