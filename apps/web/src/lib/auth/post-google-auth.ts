'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'

type ProjectSupabaseClient = SupabaseClient<Database>

interface ResolvePostGoogleAuthUrlParams {
    supabase: ProjectSupabaseClient
    userId: string
    intent: 'login' | 'register'
    next?: string | null
}

/**
 * Resolves the post-Google-auth destination URL.
 *
 * Shared by AuthExchangeClient (redirect flow) and GoogleSignInButton (GIS +
 * signInWithIdToken flow). Behavior mirrors the original inline logic:
 * 1. A safe internal `next` (starts with '/' but not '//') wins outright.
 * 2. Otherwise look up the coach (+ active org membership) and delegate to
 *    getPostLoginRedirect.
 * 3. No coach row: login → '/login?error=no_google_account';
 *    register → '/register?from=google'.
 */
export async function resolvePostGoogleAuthUrl({
    supabase,
    userId,
    intent,
    next,
}: ResolvePostGoogleAuthUrlParams): Promise<string> {
    if (next && next.startsWith('/') && !next.startsWith('//')) {
        return next
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, active_org_id')
        .eq('id', userId)
        .maybeSingle()

    if (coach) {
        let activeOrgSlug: string | null = null
        let activeOrgRole: string | null = null

        if (coach.active_org_id) {
            const { data: membership } = await supabase
                .from('organization_members')
                .select('role, organizations(slug)')
                .eq('org_id', coach.active_org_id)
                .eq('user_id', userId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle()

            const organization = membership?.organizations as unknown as { slug?: string | null } | null
            activeOrgSlug = organization?.slug ?? null
            activeOrgRole = membership?.role ?? null
        }

        return getPostLoginRedirect({
            isCoach: true,
            activeOrgSlug,
            activeOrgRole,
        })
    }

    return intent === 'register' ? '/register?from=google' : '/login?error=no_google_account'
}
