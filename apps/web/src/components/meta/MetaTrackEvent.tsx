'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
    isMetaTrackableRoute,
    trackMetaEvent,
    type MetaEventParams,
    type MetaStandardEvent,
} from '@/lib/meta/pixel'

type MetaTrackEventProps = {
    event: MetaStandardEvent
    params?: MetaEventParams
    /**
     * `event_id` compartido con el evento server-side (CAPI). Meta deduplica cruzando SOLO
     * `event_name` + `event_id`, ventana de 48h. Cualquier diferencia de string cuenta doble.
     */
    eventId?: string
}

/**
 * Dispara UN evento estandar al montar. Client component aislado (nunca por barrel) para poder
 * usarse desde Server Components como `/pricing`.
 *
 * Si el pixel no cargo (sin consentimiento o sin `NEXT_PUBLIC_FB_PIXEL_ID`) el helper es no-op.
 */
export function MetaTrackEvent({ event, params, eventId }: MetaTrackEventProps) {
    const pathname = usePathname()
    const hasFired = useRef(false)

    useEffect(() => {
        if (hasFired.current) return
        if (!isMetaTrackableRoute(pathname)) return
        hasFired.current = true
        trackMetaEvent(event, params, eventId ? { eventID: eventId } : undefined)
    }, [event, params, eventId, pathname])

    return null
}
