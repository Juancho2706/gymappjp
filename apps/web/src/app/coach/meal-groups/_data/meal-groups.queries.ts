import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getMealGroups = cache(async (coachId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('saved_meals')
        .select(`*, items:saved_meal_items(id, quantity, unit, food:foods(*))`)
        .eq('coach_id', coachId)
        .order('name')
    return data ?? []
})
