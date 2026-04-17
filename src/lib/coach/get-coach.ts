import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'

export type CoachSession = Pick<
    Tables<'coaches'>,
    'id' | 'full_name' | 'brand_name' | 'subscription_status' | 'primary_color' | 'slug'
> & {
    use_brand_colors_coach?: boolean
}

/**
 * Cached per request to avoid duplicated auth + coach lookup across layout/page.
 */
export const getCoach = cache(async (): Promise<CoachSession | null> => {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return null
    }

    const { data: coachData } = (await supabase
        .from('coaches')
        .select(
            'id, full_name, brand_name, subscription_status, primary_color, use_brand_colors_coach, slug'
        )
        .eq('id', user.id)
        .maybeSingle()) as {
        data: CoachSession | null
    }

    return coachData ?? null
})
