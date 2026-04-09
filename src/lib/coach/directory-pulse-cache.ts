import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { DashboardService, type DirectoryPulseRow } from '@/services/dashboard.service'

/** Una sola carga de pulse por request (dashboard stats + directorio). */
export const getCachedDirectoryPulse = cache(
    async (coachId: string): Promise<DirectoryPulseRow[]> => {
        const supabase = await createClient()
        return new DashboardService(supabase).getDirectoryPulse(coachId)
    }
)
