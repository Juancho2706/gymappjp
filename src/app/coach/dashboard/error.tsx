'use client'

import { GlassCard } from '@/components/ui/glass-card'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="p-6">
            <GlassCard>
                <div className="flex flex-col items-start gap-4 p-6">
                    <div className="flex items-center gap-2 text-rose-500">
                        <AlertTriangle className="h-5 w-5" />
                        <h2 className="font-display text-xl font-bold">Algo fallo al cargar el dashboard</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {error.message || 'Error desconocido. Intenta recargar en un momento.'}
                    </p>
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
