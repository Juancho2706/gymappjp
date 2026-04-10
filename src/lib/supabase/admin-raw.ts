import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * Untyped Supabase admin client — use only when TypeScript infers 'never'
 * for Update types on RLS-enabled tables (known Supabase v2 issue).
 * The service_role key bypasses RLS entirely.
 */
export async function createRawAdminClient() {
    const cookieStore = await cookies()

     
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // no-op
                    }
                },
            },
        }
    )
}
