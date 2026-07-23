'use client'

import { useSyncExternalStore } from 'react'

/**
 * Ejecutor V3 (QA7) — LOADER DE RUTA del ejecutor con el LOOK DEL SPLASH.
 *
 * Antes esta ruta usaba `BrandClientLoadingShell` (wordmark/variante/loader compuesto del coach). Al
 * lanzar desde el dashboard el App Router desmontaba el overlay del MORPH (vive en el árbol del
 * dashboard) apenas montaba este fallback → se veían loaders encadenados antes del splash (loader
 * genérico del coach + splash), y cualquier color por defecto podía asomar como un flash de tema
 * "viejo" (bug QA CEO). Ahora la ruta pinta DIRECTO el fondo del splash V3, con la marca ACTUAL:
 * `--exec-brand = var(--theme-primary)` ya resuelta en `:root` por el layout `/c` (nunca un default
 * stale). Si venimos del morph (`eva:exec-v3-morph === '1'`) mostramos además el logo del coach en el
 * círculo, en la misma posición que el avatar del splash → handoff invisible: morph → este cover →
 * splash SSR, un solo loader de marca de punta a punta.
 *
 * El flag `eva:exec-v3-morph` lo CONSUME (removeItem) el splash (`SessionIntro`) — aquí sólo se LEE.
 * Lectura síncrona con `useSyncExternalStore` (snapshot de server = null → SSR pinta sólo el fondo,
 * sin mismatch de hidratación; en navegación soft el logo aparece en el primer paint).
 */

const subscribeNoop = () => () => {}

function readMorphLogo(): string | null {
    try {
        if (sessionStorage.getItem('eva:exec-v3-morph') !== '1') return null
        return sessionStorage.getItem('eva:exec-v3-morph-logo') || null
    } catch {
        return null
    }
}

export default function LoadingWorkoutExecution() {
    const logoUrl = useSyncExternalStore(subscribeNoop, readMorphLogo, () => null)

    return (
        <div className="exec-route-cover" role="status" aria-live="polite" aria-busy="true" aria-label="Preparando tu sesión">
            <div className="exec-route-cover-stack">
                {logoUrl ? (
                    <div className="exec-route-cover-avatar">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoUrl} alt="" className="exec-route-cover-avatar-img" />
                    </div>
                ) : null}
            </div>
        </div>
    )
}
