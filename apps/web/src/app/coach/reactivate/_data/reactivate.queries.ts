import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getReactivatePageData = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null, activeClientCount: 0 }

    const [coachResult, clientCountResult] = await Promise.all([
        supabase
            .from('coaches')
            .select('subscription_tier, subscription_status, max_clients, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle(),
        supabase
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .eq('is_archived', false),
    ])

    return {
        user,
        coach: coachResult.data,
        activeClientCount: clientCountResult.count ?? 0,
    }
})
