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
        .select('brand_name, primary_color, logo_url, welcome_message')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return data as Pick<Coach, 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message'> | null
})
