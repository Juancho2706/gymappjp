import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getWorkoutHistoryUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, hasClientRow: false }

    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    return { user, hasClientRow: Boolean(client) }
})
