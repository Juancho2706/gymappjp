'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    const token = process.env.NEXT_PUBLIC_POSTHOG_TOKEN
    const uiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

    useEffect(() => {
        if (!token) return
        posthog.init(token, {
            // Route through our domain proxy (/ph) so adblockers don't block it.
            api_host: '/ph',
            ui_host: uiHost,
            // Ley 21.719: no crear perfiles identificados sin consentimiento explícito.
            // Los eventos se capturan anónimamente hasta que el coach llama posthog.identify().
            person_profiles: 'identified_only',
            capture_pageview: false, // manejado manualmente en PageviewTracker
            capture_pageleave: true,
        })
    }, [token, uiHost])

    if (!token) return <>{children}</>

    return (
        <PHProvider client={posthog}>
            <PageviewTracker />
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
