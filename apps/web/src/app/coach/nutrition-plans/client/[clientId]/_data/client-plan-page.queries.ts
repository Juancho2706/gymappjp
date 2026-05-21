import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getClientNutritionPlanPageAuthData = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, client: null, intake: null }

    const [{ data: client }, { data: intake }] = await Promise.all([
        supabase.from('clients').select('id, full_name, coach_id').eq('id', clientId).maybeSingle(),
        supabase.from('client_intake').select('weight_kg, height_cm').eq('client_id', clientId).maybeSingle(),
    ])

    return { user, client, intake }
})
