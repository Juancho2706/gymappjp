import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import { findCoachById } from '@/infrastructure/db'

export type CoachSession = Pick<
    Tables<'coaches'>,
    | 'id'
    | 'active_org_id'
    | 'full_name'
    | 'brand_name'
    | 'subscription_status'
    | 'primary_color'
    | 'slug'
    | 'invite_code'
    | 'loader_text'
    | 'use_custom_loader'
    | 'loader_text_color'
    | 'loader_icon_mode'
    | 'logo_url'
    | 'onboarding_guide'
    | 'subscription_tier'
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

    return (await findCoachById(supabase, user.id)) as CoachSession | null
})
