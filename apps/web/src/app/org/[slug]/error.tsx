'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function OrgError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[OrgError]', error)
    }, [error])

    return (
        <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <div>
                <p className="text-sm font-semibold">Error al cargar esta sección</p>
                {error.digest && (
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">{error.digest}</p>
                )}
            </div>
            <button
                onClick={reset}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline transition-colors"
            >
                <RefreshCw className="w-3 h-3" />
                Reintentar
            </button>
        </div>
    )
}
