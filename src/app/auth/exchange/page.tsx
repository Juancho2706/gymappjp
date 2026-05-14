'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

function ExchangeInner() {
    const router = useRouter()
    const searchParams = useSearchParams()

    useEffect(() => {
        const code = searchParams.get('code')
        const next = searchParams.get('next') ?? '/coach/dashboard'

        if (!code) {
            router.replace('/login?error=auth_callback_failed')
            return
        }

        const supabase = createClient()

        supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
            if (error || !data.user) {
                console.error('[auth/exchange] exchange failed:', error?.message)
                router.replace('/login?error=auth_callback_failed')
                return
            }
            // Session is now stored in browser cookies by the Supabase client.
            // Navigate to dashboard — middleware redirects to /coach/onboarding/complete if no coaches record.
            router.replace('/coach/dashboard')
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
