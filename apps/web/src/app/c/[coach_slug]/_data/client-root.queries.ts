import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { coachIdentifierColumn } from '@/lib/coach/invite-code'

export const getClientRootUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
})

export const getSuspendedCoachData = cache(async (coachSlug: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, coach: null }

    const { data: coach } = await supabase
        .from('coaches')
        .select('brand_name, whatsapp')
        .eq(coachIdentifierColumn(coachSlug), coachSlug)
        .maybeSingle()

    return { user, coach: coach as { brand_name: string; whatsapp: string | null } | null }
})
