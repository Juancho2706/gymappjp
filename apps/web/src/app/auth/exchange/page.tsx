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

        console.log('[exchange] params:', { code: code ? code.slice(0, 8) + '…' : null, intent, isLoginIntent })

        if (!code) {
            console.warn('[exchange] no oauth_code in URL — full params:', searchParams.toString())
            router.replace('/login?error=auth_callback_failed')
            return
        }

        const supabase = createClient()

        supabase.auth.exchangeCodeForSession(code).then(async ({ data, error }) => {
            if (error || !data.user) {
                console.error('[exchange] exchangeCodeForSession failed:', error?.message, error)
                router.replace('/login?error=auth_callback_failed')
                return
            }

            console.log('[exchange] session ok, user:', data.user.id, data.user.email)

            const { data: coach, error: coachErr } = await supabase
                .from('coaches')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle()

            console.log('[exchange] coach check:', { coach, coachErr })

            if (coach) {
                console.log('[exchange] existing coach → /coach/dashboard')
                window.location.replace('/coach/dashboard')
            } else if (isLoginIntent) {
                console.log('[exchange] login intent + no coach → /login?error=no_google_account')
                router.replace('/login?error=no_google_account')
            } else {
                console.log('[exchange] register intent + no coach → /register?from=google')
                window.location.replace('/register?from=google')
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
