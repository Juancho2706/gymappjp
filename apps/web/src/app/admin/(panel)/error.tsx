'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Error boundary del panel CEO: antes cualquier throw de una query escalaba al
// global-error de la raiz, fuera del shell admin (F1 08-05).
export default function AdminPanelError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[admin] panel error boundary:', error)
    }, [error])

    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-500)]/10">
                <AlertTriangle className="h-6 w-6 text-[var(--danger-500)]" />
            </div>
            <div>
                <h2 className="text-base font-semibold text-strong">Algo fallo cargando esta seccion</h2>
                <p className="mt-1 max-w-sm text-xs text-muted">
                    El resto del panel sigue funcionando. Reintenta; si persiste, revisa Sistema o los logs de Supabase.
                    {error.digest && <span className="mt-1 block font-mono text-[10px]">digest: {error.digest}</span>}
                </p>
            </div>
            <button
                onClick={reset}
                className="flex items-center gap-2 rounded-lg bg-[var(--cta-fill)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--sport-600)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
            </button>
        </div>
    )
}
