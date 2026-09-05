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
        // Ley 21.719 + captura COOKIELESS pre-consentimiento (autorizada por el dueño 2026-08-19).
        // Antes esto era `opt_out_capturing_by_default: true` a secas: mientras el visitante no
        // tocara el banner NO salía absolutamente nada, y como el banner se ignora o se cierra con
        // la X (que a propósito no persiste elección), el embudo de adquisición era ciego justo en
        // el tramo que paga la campaña. Ahora, según lo GUARDADO:
        //
        //   null (indeciso) → persistence 'memory': se captura anónimo, sin cookie ni localStorage,
        //                     sin identificador que sobreviva a la recarga. Nada que consentir.
        //   'accepted'      → 'localStorage+cookie' (el default de posthog) — camino de HOY intacto.
        //   'rejected'      → opted-out: cero eventos, cero requests. Memoria porque no hay nada
        //                     que guardar (la elección vive en NUESTRO localStorage, no en el de ph).
        //
        // `applyConsent` hace el salto memoria → persistente al aceptar (conserva el distinct_id).
        const storedConsent = getStoredConsent()
        posthog.init(token, {
            api_host: '/ph',
            ui_host: uiHost,
            persistence: storedConsent === 'accepted' ? 'localStorage+cookie' : 'memory',
            opt_out_capturing_by_default: storedConsent === 'rejected',
            // Un session replay NO es «analítica anónima»: graba la pantalla. Sin un sí explícito,
            // no se graba (si el proyecto lo tiene apagado, esto es inerte de todos modos).
            disable_session_recording: storedConsent !== 'accepted',
            person_profiles: 'identified_only',
            capture_pageview: false,
            capture_pageleave: true,
            // Re-aplica el consentimiento GUARDADO recién cuando posthog terminó de iniciar: el effect
            // del banner puede correr antes que este init (carrera de montaje) y su opt-in se perdería.
            loaded: () => applyConsent(getStoredConsent()),
        })
        // Super-properties GLOBALES (SEC-01, 05-09): viajan en TODO evento — identify, pageview y
        // captura anónima pre-consentimiento incluidos, porque `register()` solo guarda props
        // locales, no dispara una request propia. Sirven para medir cuánto tráfico sigue en un
        // bundle viejo tras un deploy (`app_version` = commit corto de Vercel; `dev` fuera de
        // Vercel). Metadatos de build, sin PII: no dependen del opt-in de cookies.
        posthog.register({
            app_version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? 'dev',
            platform: 'web',
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
