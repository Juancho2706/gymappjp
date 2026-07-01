'use client'

import { useSyncExternalStore } from 'react'

function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 768px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que Asignar en workout-programs): desktop → Dialog, móvil → bottom-sheet. */
export function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribeMd,
        () => window.matchMedia('(min-width: 768px)').matches,
        () => true,
    )
}
