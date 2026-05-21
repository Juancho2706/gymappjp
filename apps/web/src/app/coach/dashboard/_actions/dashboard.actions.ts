'use server'

import { createClient } from '@/lib/supabase/server'
import { getCachedDirectoryPulse } from '@/lib/coach/directory-pulse-cache'
import {
    mapDirectoryPulseToAdherenceStats,
    mapDirectoryPulseToNutritionStats,
} from '@/services/dashboard.service'

export async function getAdherenceStats() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const pulse = await getCachedDirectoryPulse(user.id)
    return mapDirectoryPulseToAdherenceStats(pulse)
}

export async function getNutritionStats() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('No autorizado')

    const pulse = await getCachedDirectoryPulse(user.id)
    return mapDirectoryPulseToNutritionStats(pulse)
}
