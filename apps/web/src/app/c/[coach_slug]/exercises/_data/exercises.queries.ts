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
            id, coach_id,
            coaches ( brand_name, primary_color )
        `)
        .eq('id', user.id)
        .maybeSingle()

    const client = clientResponse.data
    if (!client) return { user, client: null, exercises: [] }

    const exercisesResponse = await supabase
        .from('exercises')
        .select(EXERCISE_CATALOG_COLUMNS)
        .or(`coach_id.is.null,coach_id.eq.${client.coach_id}`)
        .order('name')

    return { user, client, exercises: exercisesResponse.data ?? [] }
})
