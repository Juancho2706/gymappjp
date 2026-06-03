'use client'

import { useEffect, useState } from 'react'
import { Smartphone, X } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
    /** Clave única para recordar el descarte (localStorage). */
    storageKey: string
    title?: string
    children: ReactNode
}

/**
 * Aviso flotante y DESCARTABLE "mejor en la app". Pensado para pantallas donde el
 * contenido necesita todo el espacio (ej. el builder): no ocupa layout (fixed),
 * se cierra y no vuelve (localStorage). Responsive: full-width abajo en móvil,
 * tarjeta esquina inferior derecha en desktop.
 */
export function AppOnlyPopup({ storageKey, title = 'Mejor en la app de EVA', children }: Props) {
    const KEY = `eva-app-only-${storageKey}-v1`
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        try {
            if (localStorage.getItem(KEY) !== 'true') setVisible(true)
        } catch {
            setVisible(true)
        }
    }, [KEY])

    if (!visible) return null

    const close = () => {
        try { localStorage.setItem(KEY, 'true') } catch { /* noop */ }
        setVisible(false)
    }

    return (
        <div className="fixed bottom-4 left-4 right-4 z-40 flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg animate-in slide-in-from-bottom-2 duration-300 sm:left-auto sm:max-w-xs">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{children}</p>
            </div>
            <button
                onClick={close}
                aria-label="Cerrar"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
