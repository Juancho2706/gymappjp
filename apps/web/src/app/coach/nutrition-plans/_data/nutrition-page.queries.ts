import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getNutritionPlansPageCoach = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null }

    const { data: coach } = await supabase
        .from('coaches')
        .select('subscription_tier')
        .eq('id', user.id)
        .maybeSingle()

    return { user, coach }
})
