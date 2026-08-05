// Guard de bundling (SEC-2, F0 08-05): si un Client Component importa esta cadena,
// el build de Next falla en vez de embarcar codigo service-role al browser.
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

export function createServiceRoleClient() {
    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        }
    )
}
