import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

// P1.0: optionally scope auth cookies to a shared domain (e.g. `.eva-app.cl`) so the alumno
// session is shared between `eva-app.cl` and `enterprise.eva-app.cl` (the future /e/* area).
// Unset (default) = current behavior exactly (host-scoped cookies). Zero-regression switch.
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined
function withCookieDomain<T extends { domain?: string }>(options: T): T {
    return AUTH_COOKIE_DOMAIN ? { ...options, domain: AUTH_COOKIE_DOMAIN } : options
}

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, withCookieDomain(options ?? {}))
                        )
                    } catch {
                        // Server Component — ignore cookie setting errors
                    }
                },
            },
        }
    )
}

export async function createAdminClient() {
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
