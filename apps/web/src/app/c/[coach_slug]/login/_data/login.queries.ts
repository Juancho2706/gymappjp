import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'
import type { Tables } from '@/lib/database.types'

type Coach = Tables<'coaches'>

export const getClientLoginMetadataCoach = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        .select('brand_name, logo_url')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<Coach, 'brand_name' | 'logo_url'> | null
})

export const getClientLoginCoach = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('coaches')
        // white-label v2: +subscription_tier (gate) + campos v2 (color2/accent/logo dark/fuente).
        .select('brand_name, primary_color, logo_url, welcome_message, subscription_tier, brand_secondary_color, accent_light, accent_dark, logo_url_dark, brand_font_key')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<
        Coach,
        | 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message' | 'subscription_tier'
        | 'brand_secondary_color' | 'accent_light' | 'accent_dark' | 'logo_url_dark' | 'brand_font_key'
    > | null
})
