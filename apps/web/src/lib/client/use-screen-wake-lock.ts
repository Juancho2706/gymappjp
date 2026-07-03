'use client'

import { useEffect } from 'react'

/**
 * Mantiene la pantalla despierta durante TODA la sesión de ejecución (bug E2-1).
 *
 * Antes el wake lock solo cubría el descanso (`RestTimer`); ahora se pide al montar la
 * pantalla de ejecución y se suelta al salir/finalizar. El sentinel se libera solo cuando
 * la pestaña pasa a segundo plano, así que re-adquirimos en `visibilitychange` (mismo patrón
 * que `RestTimer`). Todo envuelto en guardas: navegadores sin Wake Lock API o rechazos
 * (batería baja, permisos) degradan en silencio.
 *
 * @param enabled desactiva el efecto sin romper las reglas de hooks (default: true).
 */
export function useScreenWakeLock(enabled: boolean = true): void {
    useEffect(() => {
        if (!enabled) return
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

        let wakeLock: { release: () => Promise<void> } | null = null
        let released = false

        const request = async () => {
            try {
                if (document.visibilityState === 'visible') {
                    wakeLock = await navigator.wakeLock.request('screen')
                }
            } catch {
                /* rechazo no fatal (batería baja / no soportado) */
            }
        }

        const handleVisibilityChange = () => {
            // Re-adquirir al volver a primer plano (el sentinel se suelta solo al ocultarse).
            if (document.visibilityState === 'visible' && !released) void request()
        }

        void request()
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            released = true
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            wakeLock?.release().catch(() => {})
        }
    }, [enabled])
}
