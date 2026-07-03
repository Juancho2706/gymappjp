'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Share2, Download, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { canShareFiles, share } from '@/lib/web-share'
import {
    readShareCardBrand,
    renderWorkoutPRCardToBlob,
    type WorkoutPRCardData,
} from '@/lib/workout-pr-card-canvas'

interface PRShareCardModalProps {
    pr: WorkoutPRCardData
    onClose: () => void
}

function slugify(s: string): string {
    return (
        s
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'record'
    )
}

/**
 * Preview + acciones (Compartir / Guardar) de la share-card de RECORD personal. La imagen se genera
 * 100% en el cliente (<canvas>, zero-server) a partir del PR ya detectado en la sesión. Se portalea a
 * document.body por encima del overlay de resumen (z-[9999]).
 */
export function PRShareCardModal({ pr, onClose }: PRShareCardModalProps) {
    const reducedMotion = useReducedMotion()
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const blobRef = useRef<Blob | null>(null)
    const fileName = `record-${slugify(pr.exerciseName)}.png`

    // Genera la imagen al montar. Un blob/objectURL vivo; se limpia al desmontar.
    useEffect(() => {
        let cancelled = false
        let url: string | null = null
        ;(async () => {
            const brand = readShareCardBrand()
            const blob = await renderWorkoutPRCardToBlob(pr, brand)
            if (cancelled) return
            if (!blob) {
                toast.error('No pudimos generar la imagen. Intentá de nuevo.')
                onClose()
                return
            }
            blobRef.current = blob
            url = URL.createObjectURL(blob)
            setPreviewUrl(url)
        })()
        return () => {
            cancelled = true
            if (url) URL.revokeObjectURL(url)
        }
    }, [pr, onClose])

    async function handleShare() {
        const blob = blobRef.current
        if (!blob || busy) return
        setBusy(true)
        try {
            const file = new File([blob], fileName, { type: 'image/png' })
            const text = `Nuevo récord personal en ${pr.exerciseName}`
            if (canShareFiles([file])) {
                await share({ files: [file], title: 'Récord personal', text })
            } else {
                handleDownload()
            }
        } finally {
            setBusy(false)
        }
    }

    function handleDownload() {
        const blob = blobRef.current
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success('Imagen guardada')
    }

    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-4 pt-safe pb-safe"
            role="dialog"
            aria-modal="true"
            aria-label="Compartir récord personal"
            onClick={onClose}
        >
            <motion.div
                initial={reducedMotion ? false : { opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="flex w-full max-w-sm flex-col items-stretch gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative aspect-[1080/1350] w-full overflow-hidden rounded-card border border-white/10 bg-[var(--ink-950,#0B0E13)] shadow-2xl">
                    {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- preview de un blob generado en cliente (no optimizable por next/image)
                        <img src={previewUrl} alt="Vista previa del récord" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={handleShare}
                        disabled={!previewUrl || busy}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-control font-bold text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
                        style={{ backgroundColor: 'var(--theme-primary)' }}
                    >
                        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />}
                        {canShare ? 'Compartir' : 'Guardar imagen'}
                    </button>
                    {canShare && (
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={!previewUrl}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-control border border-white/15 bg-white/[0.06] text-sm font-semibold text-white/90 transition-colors hover:bg-white/[0.12] disabled:opacity-60"
                        >
                            <Download className="h-4 w-4" /> Guardar
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-control text-sm font-semibold text-white/60 transition-colors hover:text-white/90"
                    >
                        <X className="h-4 w-4" /> Cerrar
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    )
}
