'use client'

import { useState } from 'react'
import { Share2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SharePRButtonProps {
    /** Ejercicio del que se genera la card de record. */
    exerciseId: string
    exerciseName: string
    /** Solo el flujo COACH lo pasa (alumno objetivo). El alumno omite → usa su propia sesión. */
    clientId?: string
    /** Texto del botón. Default: "Compartir". */
    label?: string
    /** Variante visual: `solid` (CTA acento) o `ghost` (icono discreto). */
    variant?: 'solid' | 'ghost'
    className?: string
}

function slugify(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'record'
}

/**
 * Genera la share-card de RECORD PERSONAL (endpoint auth-gated `/api/pr-card`) y la comparte como
 * archivo PNG vía Web Share API (nivel 2, files); si el dispositivo no soporta compartir archivos,
 * cae a descarga directa. Reusable por el alumno (su record) y el coach (record de su alumno).
 */
export function SharePRButton({
    exerciseId,
    exerciseName,
    clientId,
    label = 'Compartir',
    variant = 'solid',
    className,
}: SharePRButtonProps) {
    const [busy, setBusy] = useState(false)

    async function handleShare() {
        if (busy) return
        setBusy(true)
        try {
            const params = new URLSearchParams({ exerciseId })
            if (clientId) params.set('clientId', clientId)
            const res = await fetch(`/api/pr-card?${params.toString()}`, { credentials: 'same-origin' })
            if (!res.ok) throw new Error(`status ${res.status}`)

            const blob = await res.blob()
            const fileName = `record-${slugify(exerciseName)}.png`
            const file = new File([blob], fileName, { type: 'image/png' })
            const shareText = `Nuevo récord personal en ${exerciseName}`

            const nav = typeof navigator !== 'undefined' ? navigator : undefined
            if (nav?.canShare?.({ files: [file] }) && nav.share) {
                try {
                    await nav.share({ files: [file], title: 'Récord personal', text: shareText })
                } catch (err) {
                    // El usuario canceló el diálogo de compartir → no es un error.
                    if ((err as Error)?.name === 'AbortError') return
                    throw err
                }
                return
            }

            // Fallback: descarga directa del PNG.
            const objectUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = objectUrl
            a.download = fileName
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(objectUrl)
        } catch {
            toast.error('No pudimos generar la imagen. Intentá de nuevo.')
        } finally {
            setBusy(false)
        }
    }

    if (variant === 'ghost') {
        return (
            <button
                type="button"
                onClick={handleShare}
                disabled={busy}
                aria-label={label}
                className={cn(
                    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-sport-600 disabled:opacity-60',
                    className
                )}
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className={cn(
                'inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60',
                className
            )}
        >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {busy ? 'Generando…' : label}
        </button>
    )
}
