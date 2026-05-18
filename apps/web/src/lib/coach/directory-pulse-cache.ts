import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DashboardService, type DirectoryPulseRow } from '@/services/dashboard.service'

/**
 * Tag reservado para futuras invalidaciones con `revalidateTag` desde server actions.
 * No usar `unstable_cache` aquí: el pulse depende de `cookies()` vía Supabase SSR y rompe el RSC en prod.
 */
export const DIRECTORY_PULSE_CACHE_TAG = 'directory-pulse'

/** Una sola carga de pulse por request (dashboard stats + directorio). */
export const getCachedDirectoryPulse = cache(async (coachId: string): Promise<DirectoryPulseRow[]> => {
    const supabase = await createClient()
    return new DashboardService(supabase).getDirectoryPulse(coachId)
})
