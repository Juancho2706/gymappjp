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
    // getClaims(): verificación LOCAL del JWT (llaves asimétricas ES256 + JWKS cacheado), sin
    // round-trip a GoTrue /user. Solo necesitamos el id del coach para el lookup — es lectura de
    // página, no un boundary de mutación, así que no requiere accuracy de revocación.
    const { data } = await supabase.auth.getClaims()
    const userId = data?.claims?.sub
    if (!userId) {
        return null
    }

    return (await findCoachById(supabase, userId)) as CoachSession | null
})
