'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { startCoachGoogleLogin, startCoachGoogleRegistration } from '@/lib/auth/client-oauth'
import { resolvePostGoogleAuthUrl } from '@/lib/auth/post-google-auth'
import {
    generateGoogleNonce,
    loadGisScript,
    type GoogleCredentialResponse,
} from '@/lib/auth/google-gis'

interface GoogleSignInButtonProps {
    intent: 'login' | 'register'
}

type Mode = 'gis' | 'fallback' | 'exchanging'

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

function GoogleLogo() {
    return (
        <svg
            className="w-4 h-4 shrink-0"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    )
}

function FallbackButton({ intent }: GoogleSignInButtonProps) {
    const label = intent === 'register' ? 'Registrarse con Google' : 'Continuar con Google'
    const onClick = intent === 'register' ? startCoachGoogleRegistration : startCoachGoogleLogin

    return (
        <button
            type="button"
            onClick={onClick}
            // EVA DS (rama rediseño): mismos tokens del botón Google inline previo de auth.
            className="w-full h-14 flex items-center justify-center gap-2.5 rounded-control border-[1.5px] border-border-default bg-surface-card hover:bg-surface-sunken transition-colors text-[17px] font-semibold text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
            <GoogleLogo />
            {label}
        </button>
    )
}

export function GoogleSignInButton({ intent }: GoogleSignInButtonProps) {
    // No client id → straight to the legacy redirect flow (safe deploy before env is set).
    if (!clientId) {
        return <FallbackButton intent={intent} />
    }

    return <GisButton intent={intent} clientId={clientId} />
}

function GisButton({ intent, clientId }: GoogleSignInButtonProps & { clientId: string }) {
    const [mode, setMode] = useState<Mode>('gis')
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const rawNonceRef = useRef<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function handleCredential(response: GoogleCredentialResponse) {
            const nonce = rawNonceRef.current
            if (!nonce) {
                setError('No se pudo iniciar sesion con Google. Intenta de nuevo.')
                return
            }

            setError(null)
            setMode('exchanging')

            const supabase = createClient()
            const { data, error: signInError } = await supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce,
            })

            if (signInError || !data.user) {
                setError('No se pudo iniciar sesion con Google. Intenta de nuevo.')
                setMode('gis')
                return
            }

            const url = await resolvePostGoogleAuthUrl({
                supabase,
                userId: data.user.id,
                intent,
                next: intent === 'login' ? '/coach/dashboard' : null,
            })
            window.location.replace(url)
        }

        async function init() {
            try {
                await loadGisScript()
                const { nonce, hashedNonce } = await generateGoogleNonce()
                if (cancelled) return

                rawNonceRef.current = nonce

                const idServices = window.google?.accounts?.id
                const container = containerRef.current
                if (!idServices || !container) {
                    setMode('fallback')
                    return
                }

                idServices.initialize({
                    client_id: clientId,
                    callback: handleCredential,
                    nonce: hashedNonce,
                    use_fedcm_for_prompt: true,
                    itp_support: true,
                })

                const measured = container.getBoundingClientRect().width
                const width = Math.round(Math.min(400, Math.max(200, measured || 300)))

                idServices.renderButton(container, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    text: intent === 'register' ? 'signup_with' : 'signin_with',
                    shape: 'rectangular',
                    logo_alignment: 'center',
                    locale: 'es',
                    width,
                })
            } catch {
                if (!cancelled) setMode('fallback')
            }
        }

        void init()

        return () => {
            cancelled = true
        }
    }, [intent, clientId])

    if (mode === 'fallback') {
        return <FallbackButton intent={intent} />
    }

    // The GIS container must stay mounted while exchanging: renderButton drew into
    // this exact node, so unmounting it would leave an empty div if we need to
    // return to the 'gis' state after a failed sign-in.
    return (
        <div className="w-full">
            <div
                ref={containerRef}
                className={`flex min-h-[44px] w-full items-center justify-center ${mode === 'exchanging' ? 'hidden' : ''}`}
            />
            {mode === 'exchanging' && (
                <div className="w-full h-14 flex items-center justify-center gap-2.5 text-[15px] font-semibold text-text-muted">
                    <Loader2 className="h-5 w-5 animate-spin text-sport-500" />
                    Verificando sesión...
                </div>
            )}
            {error && (
                <p className="mt-2 text-center text-[13px] font-medium text-red-600" role="alert">
                    {error}
                </p>
            )}
        </div>
    )
}
