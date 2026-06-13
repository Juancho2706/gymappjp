'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'

// Error boundary del dashboard del alumno (/c/[coach_slug]/dashboard).
// Acotado: si un widget del dashboard falla, degrada solo esta vista y deja
// vivo el resto del shell white-label (nav, branding del coach).
export default function ClientDashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    return (
        <div className="p-4 pt-safe">
            <GlassCard>
                <div className="flex flex-col items-start gap-4 p-6">
                    <div className="flex items-center gap-2 text-rose-500">
                        <AlertTriangle className="h-5 w-5" />
                        <h2 className="font-display text-xl font-bold">No pudimos cargar tu panel</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Hubo un problema al mostrar tu información. Intenta recargar en un momento.
                    </p>
                    {error.digest && (
                        <p className="font-mono text-[11px] text-muted-foreground">{error.digest}</p>
                    )}
                    <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
                        style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                    >
                        <RotateCcw className="h-4 w-4" />
                        Reintentar
                    </button>
                </div>
            </GlassCard>
        </div>
    )
}
