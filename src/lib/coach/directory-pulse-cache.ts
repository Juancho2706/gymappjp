import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { DashboardService, type DirectoryPulseRow } from '@/services/dashboard.service'

/** Tag global para `revalidateTag('directory-pulse')` si se necesita invalidar todo el cache de pulse. */
export const DIRECTORY_PULSE_CACHE_TAG = 'directory-pulse'

const fetchDirectoryPulse = unstable_cache(
    async (coachId: string) => {
        const supabase = await createClient()
        return new DashboardService(supabase).getDirectoryPulse(coachId)
    },
    ['directory-pulse'],
    { revalidate: 60, tags: [DIRECTORY_PULSE_CACHE_TAG] }
)

/**
 * Pulse deduplicado por request (React.cache) y con TTL corto entre navegaciones (unstable_cache).
 */
export const getCachedDirectoryPulse = cache(
    async (coachId: string): Promise<DirectoryPulseRow[]> => {
        return fetchDirectoryPulse(coachId)
    }
)
