'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolvePostGoogleAuthUrl } from '@/lib/auth/post-google-auth'
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

            // W3.13 (flujo-coach-nuevo): rotación anti-takeover. Con el alta free naciendo
            // confirmada (W3.1), quien registró primero el correo de la víctima conserva su
            // contraseña cuando ella entra por Google. El servidor decide y rota; desde acá solo
            // se avisa que hubo un login con Google, porque `service_role` no existe en el
            // navegador. `await` para que la clave del intruso muera ANTES de mandar a la víctima
            // a su panel; `.catch` porque una auditoría caída no puede dejar a nadie fuera de su
            // cuenta. Idempotente y sin detalle en la respuesta.
            await fetch('/api/auth/google-link', { method: 'POST' }).catch(() => {})

            // Password recovery (or any explicit internal next): the session is now set,
            // so send the user straight to that page (e.g. /reset-password) instead of the
            // default post-login redirect. resolvePostGoogleAuthUrl guards against open
            // redirects and handles the coach/org lookup + no-account fallbacks.
            const next = searchParams.get('next')
            const url = await resolvePostGoogleAuthUrl({
                supabase,
                userId: data.user.id,
                intent: isLoginIntent ? 'login' : 'register',
                next,
            })
            window.location.replace(url)
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
