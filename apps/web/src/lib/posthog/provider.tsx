'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { applyConsent, getStoredConsent } from '@/lib/posthog/consent'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN
    const uiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

    useEffect(() => {
        if (!token) return
        posthog.init(token, {
            api_host: '/ph',
            ui_host: uiHost,
            // Ley 21.719: no capturar sin consentimiento explícito. CookieConsent llama opt_in_capturing() al aceptar.
            opt_out_capturing_by_default: true,
            person_profiles: 'identified_only',
            capture_pageview: false,
            capture_pageleave: true,
            // Re-aplica el consentimiento GUARDADO recién cuando posthog terminó de iniciar: el effect
            // del banner puede correr antes que este init (carrera de montaje) y su opt-in se perdería.
            loaded: () => applyConsent(getStoredConsent()),
        })
    }, [token, uiHost])

    if (!token) return <>{children}</>

    return (
        <PHProvider client={posthog}>
            <Suspense fallback={null}>
                <PageviewTracker />
            </Suspense>
            {children}
        </PHProvider>
    )
}

function PageviewTracker() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const ph = usePostHog()

    useEffect(() => {
        if (!ph) return
        const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '')
        ph.capture('$pageview', { $current_url: url })
    }, [pathname, searchParams, ph])

    return null
}
