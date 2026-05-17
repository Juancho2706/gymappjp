'use client'

import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'eva-cookie-consent-v1'

type ConsentValue = 'accepted' | 'rejected' | null

function getStoredConsent(): ConsentValue {
    try { return (localStorage.getItem(STORAGE_KEY) as ConsentValue) ?? null } catch { return null }
}

function setStoredConsent(value: 'accepted' | 'rejected') {
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* noop */ }
}

export function CookieConsent() {
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        const stored = getStoredConsent()
        if (!stored) {
            setVisible(true)
            return
        }
        // Apply stored preference to PostHog if available
        if (typeof window !== 'undefined' && (window as Window & { posthog?: { opt_in_capturing: () => void; opt_out_capturing: () => void } }).posthog) {
            const ph = (window as Window & { posthog?: { opt_in_capturing: () => void; opt_out_capturing: () => void } }).posthog!
            if (stored === 'accepted') ph.opt_in_capturing()
            else ph.opt_out_capturing()
        }
    }, [])

    const handle = (choice: 'accepted' | 'rejected') => {
        setStoredConsent(choice)
        setVisible(false)
        if (typeof window !== 'undefined' && (window as Window & { posthog?: { opt_in_capturing: () => void; opt_out_capturing: () => void } }).posthog) {
            const ph = (window as Window & { posthog?: { opt_in_capturing: () => void; opt_out_capturing: () => void } }).posthog!
            if (choice === 'accepted') ph.opt_in_capturing()
            else ph.opt_out_capturing()
        }
    }

    if (!visible) return null

    return (
        <div
            role="dialog"
            aria-label="Consentimiento de cookies"
            className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm p-4 animate-in slide-in-from-bottom-2 duration-300"
        >
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Cookie className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5 sm:mt-0" />
                <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
                    Usamos cookies analíticas para mejorar la plataforma (PostHog).
                    Puedes aceptar o rechazar.{' '}
                    <a href="/legal/privacidad" className="underline hover:text-foreground">Política de privacidad</a>.
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
