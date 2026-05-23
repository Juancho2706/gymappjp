'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, X } from 'lucide-react'

const DISMISSED_KEY = 'eva-mfa-banner-dismissed-v1'

export function MfaBanner({ orgSlug }: { orgSlug: string }) {
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(DISMISSED_KEY) === 'true' } catch { return false }
    })

    if (dismissed) return null

    function handleDismiss() {
        try { localStorage.setItem(DISMISSED_KEY, 'true') } catch { /* noop */ }
        setDismissed(true)
    }

    return (
        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-tight">
                    <span className="font-semibold">Recomendado:</span> Activa la autenticación de dos factores (2FA) para proteger tu cuenta de administrador.{' '}
                    <Link
                        href={`/org/${orgSlug}/setup-mfa`}
                        className="underline hover:no-underline font-medium"
                    >
                        Activar 2FA →
                    </Link>
                </p>
            </div>
            <button
                onClick={handleDismiss}
                aria-label="Cerrar aviso"
                className="shrink-0 text-amber-600/60 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    )
}
