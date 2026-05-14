'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
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
                console.error('[auth/exchange] exchange failed:', error?.message)
                router.replace('/login?error=auth_callback_failed')
                return
            }

            // Check if this Google account already has a coaches record
            const { data: coach } = await supabase
                .from('coaches')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle()

            if (coach) {
                // Existing coach — go to dashboard regardless of intent
                router.replace('/coach/dashboard')
            } else if (isLoginIntent) {
                // Tried to LOGIN but has no account — show friendly error
                router.replace('/login?error=no_google_account')
            } else {
                // Tried to REGISTER — go to onboarding to complete profile + pick plan
                router.replace('/coach/onboarding/complete')
            }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <div className="flex min-h-dvh items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm">Verificando sesión...</p>
            </div>
        </div>
    )
}

export default function AuthExchangePage() {
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
