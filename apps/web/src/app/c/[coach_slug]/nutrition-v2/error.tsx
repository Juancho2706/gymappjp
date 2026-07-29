'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'

// NUT-025 — Error boundary LOCAL de la nutrición V2 del alumno.
//
// Sin este archivo, cualquier throw de lectura V2 (`rpcRead` de
// `nutrition-v2-read.service.ts`, o el `parse` Zod del read model) subía al boundary del
// shell `/c/[coach_slug]`, que desmonta nav + branding del coach y muestra un copy
// genérico. Al vivir dentro del segmento, el layout padre sobrevive y `reset()` reintenta
// solo la lectura de nutrición.
//
// Importante para el copy: los throws de esta superficie son de LECTURA, nunca de
// escritura — por eso tranquilizamos explícitamente sobre los registros ya guardados.
export default function NutritionV2StudentError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        Sentry.captureException(error)
    }, [error])

    // Salida secundaria al dashboard del MISMO base path: bajo `/t/[team_slug]` o
    // `/e/[org_slug]` el proxy reescribe a este segmento, así que el prefijo real se toma
    // del pathname vivo en vez de reconstruirlo con el slug del coach.
    const pathname = usePathname() ?? ''
    const dashboardHref = pathname.replace(/\/nutrition-v2(?:\/.*)?$/, '/dashboard') || '/'

    return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 pt-safe pb-safe">
            <GlassCard className="w-full max-w-sm">
                <div className="flex flex-col items-start gap-4 p-6">
                    <div className="flex items-center gap-2 text-rose-500">
                        <AlertTriangle className="h-5 w-5" />
                        <h2 className="font-display text-xl font-bold">No pudimos cargar tu nutrición</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Tus registros están guardados; esto es solo un problema al mostrar la información.
                        Vuelve a intentar en un momento.
                    </p>
                    {error.digest && (
                        <p className="font-mono text-[11px] text-muted-foreground">{error.digest}</p>
                    )}
                    <div className="flex w-full flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={reset}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white"
                            style={{ backgroundColor: 'var(--theme-primary, #007AFF)' }}
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reintentar
                        </button>
                        <Link
                            href={dashboardHref}
                            className="inline-flex flex-1 items-center justify-center rounded-full border border-border-default px-4 py-2 text-sm font-semibold text-strong"
                        >
                            Ir al inicio
                        </Link>
                    </div>
                </div>
            </GlassCard>
        </div>
    )
}
