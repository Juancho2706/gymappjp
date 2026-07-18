'use client'

import { useEffect } from 'react'

/**
 * Feedback INSTANTANEO client-side de una navegacion de nav pendiente (coach y alumno).
 * Regla CEO: la data puede tardar, la UI JAMAS — el tap debe pintar algo en <100ms.
 *
 * Mientras esta montado (el nav lo monta con su `isNavigating` y lo desmonta al commit):
 * - pinta una barra de progreso indeterminada de 2px arriba (tinte primary via
 *   `--nav-progress-color`, white-label en el area del alumno);
 * - marca `html[data-nav-pending]` para que globals.css atenue el `<main>` actual
 *   (opacity) — feedback de contenido inmediato SIN esperar el loading.tsx del server.
 *
 * Cuando la navegacion commitea (cambia `usePathname` en el caller) el nav limpia su
 * estado pending, esto se desmonta y el skeleton del segmento (loading.tsx) toma el
 * relevo. No reemplaza al loading.tsx: cubre el hueco ANTES de que exista.
 */
export function NavPendingFeedback({ color }: { color?: string }) {
    useEffect(() => {
        document.documentElement.setAttribute('data-nav-pending', '')
        return () => document.documentElement.removeAttribute('data-nav-pending')
    }, [])
    return (
        <div
            aria-hidden="true"
            className="eva-nav-progress"
            style={color ? ({ '--nav-progress-color': color } as React.CSSProperties) : undefined}
        />
    )
}
