'use client'

import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'
import { applyConsent, getStoredConsent, setStoredConsent } from '@/lib/posthog/consent'

export function CookieConsent() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const stored = getStoredConsent()
        if (!stored) {
            setVisible(true)
            return
        }
        // Re-aplica la preferencia guardada sobre la instancia REAL del módulo posthog-js.
        // (El bug histórico: acá se hablaba con `window.posthog`, que con el paquete npm no existe →
        // el opt-in caía al vacío y PostHog quedó mudo desde 2026-06-08. El provider además re-aplica
        // en su callback `loaded`, así que el orden de montaje da lo mismo.)
        applyConsent(stored)
    }, [])

    const handle = (choice: 'accepted' | 'rejected') => {
        setStoredConsent(choice)
        setVisible(false)
        applyConsent(choice)
    }

    if (!visible) return null

    return (
        <div
            role="dialog"
            aria-label="Consentimiento de cookies"
            className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-4xl rounded-[var(--radius-card)] border border-border bg-background/95 p-4 shadow-[var(--shadow-lg)] backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-300 sm:inset-x-6"
        >
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Cookie className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
                <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
                    Usamos cookies analíticas para mejorar la plataforma.
                    Puedes aceptar o rechazar.{' '}
                    <a href="/privacidad" className="underline hover:text-foreground">Política de privacidad</a>.
                </p>
                <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                    <button
                        onClick={() => handle('rejected')}
                        className="flex-1 sm:flex-none h-8 px-3 text-xs rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                        Rechazar
                    </button>
                    <button
                        onClick={() => handle('accepted')}
                        className="flex-1 sm:flex-none h-8 px-4 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
                    >
                        Aceptar
                    </button>
                    <button
                        onClick={() => handle('rejected')}
                        aria-label="Cerrar"
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    )
}
