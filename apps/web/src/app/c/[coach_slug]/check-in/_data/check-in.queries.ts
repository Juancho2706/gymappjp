import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getCheckInPageData = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coachPrimaryColor: null, lastCheckIn: null }

    const { data: client } = await supabase
        .from('clients')
        .select(`
            id,
            coaches!inner ( slug, primary_color )
        `)
        .eq('id', user.id)
        .eq('coaches.slug', coachSlug)
        .maybeSingle()

    if (!client) return { user, coachPrimaryColor: null, lastCheckIn: null }

    const typedClient = client as unknown as {
        coaches: { primary_color: string } | { primary_color: string }[]
    }
    const coachInfo = Array.isArray(typedClient.coaches) ? typedClient.coaches[0] : typedClient.coaches

    const { data: lastCheckIn } = await supabase
        .from('check_ins')
        .select('weight, energy_level, created_at')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    return {
        user,
        coachPrimaryColor: coachInfo?.primary_color ?? '#8B5CF6',
        lastCheckIn,
    }
})
