'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MetaTrackEvent } from '@/components/meta/MetaTrackEvent'
import { CoachRegisteredTracker } from '@/components/analytics/RegistrationTracker'

/**
 * Espejo browser del alta Free por Google: `CompleteRegistration` de Meta (mismo `eid` que el
 * evento CAPI del server action, Meta funde ambos en UNA conversión) + `coach_registered` en
 * PostHog. Vivía en `FreeWelcomeModal` (dashboard con `?welcome=free&eid=`), pero desde el
 * onboarding v2 el coach nuevo NO aterriza en el dashboard: el gate de persona (`proxy.ts`) lo
 * manda a «¿A qué te dedicas?» y de ahí cae en `/coach/guia`. Los dos query params viajan por ese
 * camino y acá se consumen, se disparan y se limpian de la URL (un refresh no los re-emite).
 */
export function RegistrationMirror({ eid }: { eid: string }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (!params.has('welcome') && !params.has('eid')) return
        params.delete('welcome')
        params.delete('eid')
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname)
    }, [pathname, router, searchParams])

    return (
        <>
            <MetaTrackEvent event="CompleteRegistration" eventId={eid} />
            <CoachRegisteredTracker tier="free" dedupeKey={eid} />
        </>
    )
}
