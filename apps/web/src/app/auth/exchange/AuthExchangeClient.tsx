'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'
import { Loader2 } from 'lucide-react'

function ExchangeInner() {
    const router = useRouter()
    const searchParams = useSearchParams()

    useEffect(() => {
        const code = searchParams.get('oauth_code')
        const intent = searchParams.get('intent') ?? 'login'
        const isLoginIntent = intent !== 'register'

        if (!code) {
            router.replace('/login?error=auth_callback_failed')
            return
        }

        const supabase = createClient()

        supabase.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
            if (error || !data.user) {
                router.replace('/login?error=auth_callback_failed')
                return
            }

            const { data: coach } = await supabase
                .from('coaches')
                .select('id, active_org_id')
                .eq('id', data.user.id)
                .maybeSingle()

            if (coach) {
                let activeOrgSlug: string | null = null
                let activeOrgRole: string | null = null

                if (coach.active_org_id) {
                    const { data: membership } = await supabase
                        .from('organization_members')
                        .select('role, organizations(slug)')
                        .eq('org_id', coach.active_org_id)
                        .eq('user_id', data.user.id)
                        .eq('status', 'active')
                        .is('deleted_at', null)
                        .maybeSingle()

                    const organization = membership?.organizations as unknown as { slug?: string | null } | null
                    activeOrgSlug = organization?.slug ?? null
                    activeOrgRole = membership?.role ?? null
                }

                window.location.replace(getPostLoginRedirect({
                    isCoach: true,
                    activeOrgSlug,
                    activeOrgRole,
                }))
            } else if (isLoginIntent) {
                router.replace('/login?error=no_google_account')
            } else {
                window.location.replace('/register?from=google')
            }
        })
    }, [router, searchParams])

    return (
        <div className="flex min-h-dvh items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm">Verificando sesion...</p>
            </div>
        </div>
    )
}

export function AuthExchangeClient() {
    return (
        <Suspense fallback={
            <div className="flex min-h-dvh items-center justify-center bg-background">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
        }>
            <ExchangeInner />
        </Suspense>
    )
}
